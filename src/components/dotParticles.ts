import { PARTICLE_DUR, type Particle } from './particles'
import type { ParticleEmitSpec } from './particleEmit'

// 성공/파괴 버스트의 방사형 도트 파티클(프레젠테이션 전용·DOM 노드 없음) — 기존 DOM 풀(motion.span 132개를
// 상시 마운트·재사용)을 캔버스 한 장으로 대체한다. 강화 1회마다 emit() 로 도트 N개 + decor(섬광·충격파 링)
// 1세트로 교체하고(replace — 이전 버스트를 비워 겹침 없이 최신 한 벌만), 살아 있는 입자가 있는 동안에만 rAF 를 돌려 그린 뒤 끝나면 캔버스를 비운다(평소 0 비용
// — HitSparkSystem 과 동일한 생명주기). 이로써 ① 상시 132 DOM 노드·motion 구독, ② 버스트당 ~44개 setState
// 팬아웃, ③ 동시 수십~132개 motion JS 애니메이션(메인 스레드), ④ boxShadow 글로우 레이어 합성이 한꺼번에 사라진다.
//
// 좌표: 검 박스 정중앙 원점(캔버스 left-1/2 top-1/2 — HitSparkCanvas·옛 ParticlePool 과 같은 공간). makeParticles
// 의 raw CSS px 를 그대로 쓴다(rem 스케일 무관 — 옛 motion transform 도 raw px 였다). dpr 만 backing store 로 보정.
//
// 색: emit spec 의 coreVar/edgeVar('var(--color-…)')를 probe 엘리먼트의 computed color 로 1회 해석·캐시한다
// (hex·oklch·색명 무엇이든 브라우저가 rgb 로 정규화). 도트는 색 조합별로 텍스처를 1회 구워 drawImage 로 블릿한다
// — 매 프레임 gradient 생성을 피하고(HitSpark 의 glowSprite 철학), boxShadow 글로우를 텍스처의 부드러운 가장자리로 흡수한다.

const TAU = Math.PI * 2

// ── 옛 DOM 도트 애니메이션 재현 상수(제거된 DOM 풀의 DotSlot.controls 와 1:1) ─────────────
// opacity/scale 은 times 기준 다중 키프레임, 위치는 단일 키프레임(0→목표)에 전체 easeOut.
const DOT_TIMES = [0, 0.15, 0.6, 1]
const DOT_OPACITY = [0, 1, 1, 0]
const DOT_SCALE = [0.4, 1, 0.9, 0.45]

// 도트 텍스처에서 "본체(꽉 찬 원)"가 차지하는 반경 비율 — 나머지(0.5~1.0)는 글로우 헤일로(옛 boxShadow 0 0 6px 대체).
// drawImage 반경 R 을 size/(2·ρ) 로 잡으면 본체 지름이 정확히 size 가 되고, 글로우는 그 바깥 size·(1−ρ)/(2ρ) 만큼 번진다.
const DOT_BODY_RATIO = 0.5

// ── decor(섬광 + 충격파 링) — 제거된 DOM 풀의 DecorSlot 과 1:1. px 는 옛 rem 클래스를 환산(h-32=128 → 반경 64 등). ──
const FLASH_DUR = 0.45
const FLASH_R = 64 // h-32(8rem=128px)의 반경. scale 0.3→1.1.
const RING_DUR = 0.5
const RING_R = 80 // h-40(10rem=160px)의 반경. scale 0.1→1.
const RING_W = 2 // border-2

type RGB = [number, number, number]

// times 기준 다중 키프레임 선형 보간(motion 의 키프레임 보간 근사 — 세그먼트 easeOut 차이는 0.6s·동시 수십개에서 식별 불가).
function keyframe(t: number, times: number[], vals: number[]): number {
  if (t <= times[0]) return vals[0]
  for (let i = 1; i < times.length; i++) {
    if (t <= times[i]) {
      const f = (t - times[i - 1]) / (times[i] - times[i - 1])
      return vals[i - 1] + (vals[i] - vals[i - 1]) * f
    }
  }
  return vals[vals.length - 1]
}

// easeOut 근사(quadratic) — 위치가 빠르게 퍼졌다 느려지는 방사형 폭발감. motion 'easeOut'(cubic-bezier)의 실용 근사.
const easeOut = (t: number) => 1 - (1 - t) * (1 - t)

const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`

// ── CSS 색(var()·hex·oklch·색명) → rgb 1회 해석 + 캐시 ──────────────────────────────
// probe 를 document 에 잠깐 붙여 computed color 를 읽는다 — var() 가 :root 토큰을 상속해 해석되고, 브라우저가
// 어떤 색 표기든 rgb 로 정규화한다. 캐시는 정적(런타임 테마 전환 경로 없음 — 도입 시 무효화 필요).
const colorCache = new Map<string, RGB>()
function resolveColor(css: string): RGB {
  const cached = colorCache.get(css)
  if (cached) return cached
  const probe = document.createElement('span')
  probe.style.color = css
  probe.style.position = 'absolute'
  probe.style.pointerEvents = 'none'
  probe.style.opacity = '0'
  document.body.appendChild(probe)
  const computed = getComputedStyle(probe).color
  document.body.removeChild(probe)
  const m = computed.match(/[\d.]+/g)
  const rgb: RGB = m
    ? [Math.round(+m[0]), Math.round(+m[1]), Math.round(+m[2])]
    : [255, 255, 255]
  colorCache.set(css, rgb)
  return rgb
}

// ── 도트 텍스처(색 조합별 1회 굽기) ───────────────────────────────────────────────
// 중심(코어) → 가장자리(엣지) → 투명(글로우)으로 식는 한 장. 본체는 중앙 DOT_BODY_RATIO 반경까지, 그 바깥은
// 부드럽게 페이드해 옛 boxShadow 발광을 대신한다. drawImage 로 위치·크기·alpha 만 변조한다(매 프레임 gradient 0).
const dotTexCache = new Map<string, HTMLCanvasElement>()
function getDotTexture(coreCss: string, edgeCss: string): HTMLCanvasElement {
  const key = `${coreCss}|${edgeCss}`
  const cached = dotTexCache.get(key)
  if (cached) return cached
  const core = resolveColor(coreCss)
  const edge = resolveColor(edgeCss)
  const S = 64
  const half = S / 2
  const off = document.createElement('canvas')
  off.width = S
  off.height = S
  const g = off.getContext('2d')
  if (!g) throw new Error('dot texture 2d context unavailable')
  const grad = g.createRadialGradient(half, half, 0, half, half, half)
  grad.addColorStop(0, rgba(core, 1)) // 백열 코어
  grad.addColorStop(0.3, rgba(core, 0.95))
  grad.addColorStop(DOT_BODY_RATIO, rgba(edge, 0.9)) // 본체 경계(size/2)
  grad.addColorStop(0.75, rgba(edge, 0.32)) // 글로우 헤일로
  grad.addColorStop(1, rgba(edge, 0)) // 페이드 끝
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  dotTexCache.set(key, off)
  return off
}

type Dot = {
  tx: number // 목표 x(중심 기준 px)
  ty: number // 목표 y
  size: number // 기본 지름 px
  delay: number // 시작 지연(s) = stagger
  t: number // 경과(s)
  tex: HTMLCanvasElement // 색 조합 도트 텍스처
}

type Decor = {
  t: number // 경과(s)
  core: RGB // 섬광 색
  edge: RGB // 충격파 링 색
  flashTex: HTMLCanvasElement // 섬광 방사 텍스처(코어 색으로 1회 구움 — 프레임마다 그라데이션 생성 없음)
}

// 섬광(flash) 텍스처 — 코어 색의 방사 페이드(중심 0.75 → 70% 지점 0)를 1회 굽는다. 프레임마다 createRadialGradient 를
// 만들던 것을 drawImage + globalAlpha 로 대체(hitSparks 의 텍스처 베이크와 같은 규약).
const flashTexCache = new Map<string, HTMLCanvasElement>()
function getFlashTexture(coreCss: string): HTMLCanvasElement {
  const cached = flashTexCache.get(coreCss)
  if (cached) return cached
  const core = resolveColor(coreCss)
  const S = 128
  const half = S / 2
  const off = document.createElement('canvas')
  off.width = off.height = S
  const g = off.getContext('2d')
  if (!g) throw new Error('flash texture 2d context unavailable')
  const grad = g.createRadialGradient(half, half, 0, half, half, half)
  grad.addColorStop(0, rgba(core, 0.75))
  grad.addColorStop(0.7, rgba(core, 0))
  grad.addColorStop(1, rgba(core, 0))
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  flashTexCache.set(coreCss, off)
  return off
}

// ── 도트 파티클 캔버스 시스템 ─────────────────────────────────────────────────────
// emit() 로 도트·decor 로 교체하고(replace — 이전 버스트를 비움), 살아 있는 입자가 있는 동안에만 rAF 루프를 돈다(평소 0 비용). 캔버스당 하나.
export class DotParticleSystem {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  // 풀(증가만) — 0..dotCount / 0..decorCount 가 활성 슬롯. 버스트마다 객체를 새로 만들지 않고 슬롯의 필드만
  // 덮어써 재사용한다(GC 압박 제거). 활성 범위 밖의 슬롯은 다음 버스트에 다시 쓰인다(꼬리에 보존).
  private dots: Dot[] = []
  private dotCount = 0
  private decors: Decor[] = []
  private decorCount = 0
  private cx = 0
  private cy = 0
  private w = 0
  private h = 0
  private bw = 0 // 현재 backing store 픽셀 폭(리사이즈 감지)
  private bh = 0
  private dpr = 1
  private running = false
  private prev = 0
  private raf = 0

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('DotParticleSystem: 2d context unavailable')
    this.ctx = ctx
  }

  // dpr 기준 backing store 픽셀 크기를 맞춘다(크기 변화 시에만 — 매번 하면 진행 중 프레임이 지워진다).
  private syncBackingStore(rect: DOMRect) {
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const bw = Math.round(rect.width * dpr)
    const bh = Math.round(rect.height * dpr)
    if (bw !== this.bw || bh !== this.bh) {
      this.canvas.width = bw
      this.canvas.height = bh
      this.bw = bw
      this.bh = bh
    }
    this.dpr = dpr
    this.w = rect.width
    this.h = rect.height
    this.cx = rect.width / 2
    this.cy = rect.height / 2
  }

  // 버스트 1회 — 이전 버스트를 비우고(replace) 도트 N개 + decor 1세트로 교체한다. 옛 ParticlePool.emit 과
  // 동일 시그니처(소비자 무변경).
  emit(spec: ParticleEmitSpec) {
    const rect = this.canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    this.syncBackingStore(rect)
    // 새 버스트가 이전 버스트를 대체한다(replace — 누적 금지). 단 객체를 버리고 새로 만들지 않고 풀 슬롯
    // (this.dots[i])의 필드만 덮어써 재사용한다 — 첫 대형 버스트 이후로는 Dot 할당이 0이라 연사 시 GC 압박이
    // 없다. dotCount 를 이번 입자 수로 맞춰 이전 버스트의 잔여 슬롯을 활성 범위 밖으로 버린다(잔상 latest 하드
    // 컷과 같은 정책 — 화면엔 늘 최신 한 벌만).
    const tex = getDotTexture(spec.coreVar, spec.edgeVar)
    const particles = spec.particles as Particle[]
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i]
      let d = this.dots[i]
      if (!d) {
        d = { tx: 0, ty: 0, size: 0, delay: 0, t: 0, tex }
        this.dots[i] = d
      }
      d.tx = p.x
      d.ty = p.y
      d.size = p.size
      d.delay = p.stagger
      d.t = 0
      d.tex = tex
    }
    this.dotCount = particles.length
    // decor(섬광+충격파 링) 1세트 — 단일 슬롯 재사용. core/edge 는 resolveColor 의 캐시 배열 참조라 추가 할당 없음.
    let dec = this.decors[0]
    if (!dec) {
      dec = { t: 0, core: [0, 0, 0], edge: [0, 0, 0], flashTex: tex }
      this.decors[0] = dec
    }
    dec.t = 0
    dec.core = resolveColor(spec.coreVar)
    dec.edge = resolveColor(spec.edgeVar)
    dec.flashTex = getFlashTexture(spec.coreVar)
    this.decorCount = 1
    if (!this.running) {
      this.running = true
      this.prev = 0
      this.raf = requestAnimationFrame(this.loop)
    }
  }

  private loop = (ts: number) => {
    if (!this.running) return
    if (!this.prev) this.prev = ts
    const dt = Math.min(0.05, (ts - this.prev) / 1000)
    this.prev = ts
    this.draw(dt)
    if (this.dotCount === 0 && this.decorCount === 0) {
      this.running = false
      this.ctx.clearRect(0, 0, this.w, this.h)
      return
    }
    this.raf = requestAnimationFrame(this.loop)
  }

  private draw(dt: number) {
    const ctx = this.ctx
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.clearRect(0, 0, this.w, this.h)

    // ── decor: 섬광(가산) + 충격파 링 ──
    if (this.decorCount > 0) {
      let w = 0
      for (let r = 0; r < this.decorCount; r++) {
        const d = this.decors[r]
        d.t += dt
        let alive = false
        // 섬광 — 부드럽게 부푸는 코어 플래시(가산 합성). scale 0.3→1.1, opacity [0,0.85,0].
        if (d.t < FLASH_DUR) {
          const q = d.t / FLASH_DUR
          const scale = 0.3 + easeOut(q) * (1.1 - 0.3)
          const op = keyframe(q, [0, 0.5, 1], [0, 0.85, 0])
          const r = FLASH_R * scale
          // 구운 섬광 텍스처를 반경 r 로 가산 합성(알파 op 는 globalAlpha) — 프레임마다 그라데이션을 만들지 않는다.
          ctx.globalCompositeOperation = 'lighter'
          ctx.globalAlpha = op
          ctx.drawImage(d.flashTex, this.cx - r, this.cy - r, r * 2, r * 2)
          ctx.globalAlpha = 1
          ctx.globalCompositeOperation = 'source-over'
          alive = true
        }
        // 충격파 링 — 퍼지며 사라지는 고리. scale 0.1→1, opacity 0.7→0.
        if (d.t < RING_DUR) {
          const q = d.t / RING_DUR
          const e = easeOut(q)
          const r = RING_R * (0.1 + e * 0.9)
          const op = 0.7 * (1 - e)
          ctx.strokeStyle = rgba(d.edge, op)
          ctx.lineWidth = RING_W
          ctx.beginPath()
          ctx.arc(this.cx, this.cy, r, 0, TAU)
          ctx.stroke()
          alive = true
        }
        if (alive) {
          if (w !== r) {
            const tmp = this.decors[w]
            this.decors[w] = d
            this.decors[r] = tmp
          }
          w++
        }
      }
      this.decorCount = w
    }

    // ── 도트: 중심에서 사방으로 뻗으며 페이드(텍스처 블릿) ──
    if (this.dotCount > 0) {
      // in-place swap 압축 — 살아 있는 입자를 앞으로 모으고 죽은 입자는 꼬리에 보존(다음 버스트 재사용),
      // 매 프레임 aliveDots 배열을 새로 만들지 않는다. 순서는 바뀌나 도트는 독립 블릿이라 시각 차이가 없다.
      let w = 0
      for (let r = 0; r < this.dotCount; r++) {
        const p = this.dots[r]
        p.t += dt
        const q = (p.t - p.delay) / PARTICLE_DUR
        if (q >= 1) continue // 수명 종료 — 압축에서 제외(슬롯은 꼬리에 남아 재사용)
        if (q >= 0) {
          // q<0 은 아직 시작 전(stagger 대기) — 살아 있으나 안 그림. q>=0 일 때만 블릿.
          const e = easeOut(q)
          const x = this.cx + p.tx * e
          const y = this.cy + p.ty * e
          const op = keyframe(q, DOT_TIMES, DOT_OPACITY)
          const scale = keyframe(q, DOT_TIMES, DOT_SCALE)
          // R = size/(2·ρ)·scale → 본체 지름이 정확히 size·scale, 글로우는 그 바깥으로 번진다.
          const r2 = (p.size / (2 * DOT_BODY_RATIO)) * scale
          ctx.globalAlpha = op
          ctx.drawImage(p.tex, x - r2, y - r2, r2 * 2, r2 * 2)
        }
        if (w !== r) {
          const tmp = this.dots[w]
          this.dots[w] = p
          this.dots[r] = tmp
        }
        w++
      }
      ctx.globalAlpha = 1
      this.dotCount = w
    }
  }

  // 첫 버스트의 일회성 비용(backing store 할당 + 풀 슬롯 확보)을 마운트로 옮긴다. reserve 개의 Dot 슬롯을
  // 미리 만들어 첫 버스트(특히 고레벨 대형 버스트)도 객체를 새로 할당하지 않게 한다(연사 GC 압박 0). 풀 확보는
  // rect 무관(레이아웃 전이어도 가능), backing store 는 레이아웃이 잡힌 뒤에만(rect 0 이면 첫 emit 에서 잡는다 — 무해).
  warmup(reserve = 0) {
    // 슬롯 tex 는 자리표시 — emit 가 첫 사용 시 실제 텍스처로 덮어쓴다(그 전엔 dotCount=0 이라 그려지지 않는다).
    const placeholder = document.createElement('canvas')
    if (reserve > this.dots.length) {
      for (let i = this.dots.length; i < reserve; i++) {
        this.dots[i] = { tx: 0, ty: 0, size: 0, delay: 0, t: 0, tex: placeholder }
      }
    }
    if (!this.decors[0])
      this.decors[0] = { t: 0, core: [0, 0, 0], edge: [0, 0, 0], flashTex: placeholder }
    const rect = this.canvas.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) this.syncBackingStore(rect)
  }

  dispose() {
    this.running = false
    if (this.raf) cancelAnimationFrame(this.raf)
    this.dots = []
    this.dotCount = 0
    this.decors = []
    this.decorCount = 0
  }
}
