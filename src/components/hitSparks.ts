import type { EffectCanvasHost, EffectFrame, EffectLayer } from './effectCanvasHost'
// 강화 망치 임팩트의 불꽃(프레젠테이션 전용) — 작은 캔버스 한 장이 매 임팩트마다 화염 섬광을 폭발시킨다:
// ① 임팩트 화구(따뜻한 가산 섬광), ② 충격파 링(원점에서 팽창하는 백열 고리), ③ 불혀(발화점에서
// 솟아오르는 화염 혀). 가는 불티·잉걸불(날아가는 불티 줄무늬)은 제거됐다 — 화구·충격파·불혀만 남겨
// 임팩트를 "번쩍이는 화염 섬광"으로 표현한다. 픽셀 단위 가산 합성 묘사는 작은 스테이지에서 DOM 으로는
// 묻혀 캔버스로 그린다. 성공/실패 버스트(dotParticles)와 같은 효과 캔버스(EffectCanvas)에 레이어로 겹쳐 그린다 — 이 시스템은 hit 만 담당한다.
//
// 좌표/물리는 결정적이지 않아도 된다(시각 연출 — 게임 로직 아님). 매 타격마다 Math.random 으로 약간씩 다른
// 산란을 줘 더 자연스럽다. 색은 index.css 의 @theme 토큰(소스 hex 금지)을 런타임 1회 해석해 쓴다.
//
// 튜닝값(개수·반경·스케일 등) — 브라우저에서 눈으로 맞추는 값이다. 한곳에 모아 두어 연출을 조정한다.
const hitSparkSettings = {
  scale: 1, // 전체 스케일(반경) — rem 스케일과 별개로 연출 크기를 통째로 키우는 손잡이
  arcR: 10, // 발화점 반경(×scale×k) — 불혀 가로 산란의 기준
  // ── 임팩트 화구(따뜻한 폭발 섬광 — 가산 합성으로 불혀와 겹쳐 중심이 백열로 탄다) ──
  fireR: 46, // 화구 최대 반경(×scale×k) — 망치 머리를 잠깐 삼키고 가장자리가 머리 밖으로 비어져 나오는 크기
  fireDur: 0.13, // 화구 길이(초) — 짧게 번쩍하고 꺼진다
  fireGlow: 0.6, // 화구 후광 강도(0~1, 0 이면 없음) — 글로우 스프라이트를 크게 덧대 빛이 번진다
  // ── 충격파 링(임팩트 "펑" — 원점에서 빠르게 팽창하며 사라지는 백열 고리) ──
  shockR: 64, // 링 최대 반경(×scale×k)
  shockDur: 0.18, // 링 길이(초) — 화구보다 살짝 길게 남아 팽창이 읽힌다
  // ── 불혀(발화점에서 솟아오르며 수축·깜빡이다 꺼지는 화염 혀) ──
  lickCount: 6, // 한 타격당 불혀 수 — 여러 가닥이 춤춘다
  lickRise: 150, // 상승 속도(px/s, ×scale×k) — 망치 머리 위로 솟아오르도록
  lickLife: 0.38, // 기본 수명(초) — ×(0.7~1.3) 난수
  lickR: 26, // 기본 반경(px, ×scale×k) — ×(0.7~1.4) 난수, 수명 따라 수축
  lickGlow: 0.5, // 불혀 후광 강도(0~1, 0 이면 없음) — 단마다 글로우를 덧대 혀가 주변을 비춘다
}

const REF_W = 460 // 데모 기준 캔버스 폭(px) — 30rem 캔버스 시절의 폭과의 비(k = 30·rem/REF_W)로 모든 px 를 스케일(rem 스케일 대응)
const REF_CANVAS_REM = 30 // k 의 기준 캔버스 폭(rem) — 캔버스 크기 규칙이 바뀌어도(EffectCanvas) 연출 크기는 이 기준으로 고정
const TAU = Math.PI * 2

// 불혀 — 발화점에서 솟아오르며 수축·깜빡이다 꺼지는 화염 혀(가산 합성 그라데이션 블롭).
type Lick = {
  x: number
  y: number
  vy: number // 상승 속도(음수) — 떠오르며 감쇠
  r: number // 기본 반경 — 수명에 따라 수축
  t: number
  max: number
  ph: number // 깜빡임·좌우 흔들림 위상
}

// ── @theme 토큰(hex) → rgb 1회 해석 + 캐시 ─────────────────────────────────────
// 캐시는 정적이다 — 현재 코드베이스에 런타임 테마 전환 경로가 없다(hit 토큰은 index.css 의 정적 @theme 상수).
// 다크모드/테마 토글을 도입하면 palette·glowSprite 를 무효화(null 리셋)해야 한다.
type Palette = {
  cool: number[][] // 식어가는 화염 램프(머리→꼬리) — 화구·불혀·충격파 그라데이션에 쓰인다
  arcCore: number[] // 화염 백열 중심색 — 화구·불혀 그라데이션의 가장 뜨거운 속
}
let palette: Palette | null = null

function hexToRgb(hex: string): number[] {
  const h = hex.replace('#', '').trim()
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h
  const n = parseInt(full, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function resolvePalette(): Palette {
  if (palette) return palette
  const root = getComputedStyle(document.documentElement)
  const tok = (name: string) => hexToRgb(root.getPropertyValue(name).trim())
  palette = {
    // 식어가는 4-stop: 머리(화염 노랑) → 주황 → 적색 → 잿불
    cool: [
      tok('--color-hit-flash'),
      tok('--color-hit-core'),
      tok('--color-hit-edge'),
      tok('--color-hit-ember'),
    ],
    arcCore: tok('--color-hit-arc-core'),
  }
  return palette
}

const rgba = (c: number[], a: number) =>
  `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`

// 부드러운 글로우 스프라이트(오프스크린, 1회 구움) — 가산 합성으로 화구·불혀에 blit 해 발광 후광을 낸다.
// shadowBlur(매 draw 가우시안 블러)는 임팩트 때 프레임을 떨어뜨려, 캐시한 텍스처 복사(drawImage)로 대체한다.
// 색은 머리 노랑(--color-hit-flash)으로 고정 — 캐시는 정적(런타임 테마 전환 경로 없음; 도입 시 무효화 필요).
// 방사 그라데이션 텍스처 베이커 — 화구·불혀의 "백열 심지 → 노랑 → 주황 → 적색 치마" 단면을 오프스크린에 1회 굽고
// 매 프레임 drawImage 로 찍는다. 이전엔 프레임마다 불혀 단(6×3)·화구마다 createRadialGradient + addColorStop ×4 를
// 새로 만들었는데(초당 ~1,000개), 그라데이션 객체 할당(GC)과 GPU 셰이더 fill 이 모바일 GPU 시간의 큰 몫이었다.
// 알파는 모든 stop 에 균일하게 곱해지므로(마지막 stop 은 0) globalAlpha 로 완전히 등가 재현된다.
const TEX_SIZE = 128
const texCache = new Map<string, HTMLCanvasElement>()
function bakeRadialTexture(
  key: string,
  stops: readonly (readonly [number, number[], number])[],
): HTMLCanvasElement {
  const cached = texCache.get(key)
  if (cached) return cached
  const half = TEX_SIZE / 2
  const off = document.createElement('canvas')
  off.width = off.height = TEX_SIZE
  const g = off.getContext('2d')
  if (!g) throw new Error('radial texture 2d context unavailable')
  const grad = g.createRadialGradient(half, half, 0, half, half, half)
  for (const [pos, color, a] of stops) grad.addColorStop(pos, rgba(color, a))
  g.fillStyle = grad
  g.fillRect(0, 0, TEX_SIZE, TEX_SIZE)
  texCache.set(key, off)
  return off
}
// 임팩트 화구 단면(반경 = 텍스처 절반) — 백열 중심 → 노랑 → 주황 → 적색 가장자리(투명).
function getFireballTexture(): HTMLCanvasElement {
  const pal = resolvePalette()
  return bakeRadialTexture('fireball', [
    [0, pal.arcCore, 0.95],
    [0.25, pal.cool[0], 0.85],
    [0.6, pal.cool[1], 0.5],
    [1, pal.cool[2], 0],
  ])
}
// 불혀 단 단면 — 백색 심지 → 노랑 → 주황 → 적색 치마.
function getLickTexture(): HTMLCanvasElement {
  const pal = resolvePalette()
  return bakeRadialTexture('lick', [
    [0, pal.arcCore, 0.95],
    [0.35, pal.cool[0], 0.75],
    [0.7, pal.cool[1], 0.45],
    [1, pal.cool[2], 0],
  ])
}

let glowSprite: HTMLCanvasElement | null = null
function getGlowSprite(): HTMLCanvasElement {
  if (glowSprite) return glowSprite
  const color = resolvePalette().cool[0]
  const S = 48
  const off = document.createElement('canvas')
  off.width = S
  off.height = S
  const g = off.getContext('2d')
  if (!g) throw new Error('glow sprite 2d context unavailable')
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0, rgba(color, 0.9))
  grad.addColorStop(0.4, rgba(color, 0.32))
  grad.addColorStop(1, rgba(color, 0))
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  glowSprite = off
  return glowSprite
}

// ── 캔버스 불꽃 시스템 ──────────────────────────────────────────────────────────
// 임팩트마다 burst() 로 이전 불혀를 비우고 새로 교체하며(replace), 살아 있는 연출이 있는 동안에만 rAF 루프를
// 돈다(평소 0 비용). 화구·충격파(시간값)와 불혀(풀)만 그린다 — 날아가는 불티·잉걸불 줄무늬는 제거됐다.
export class HitSparkSystem implements EffectLayer {
  private readonly host: EffectCanvasHost
  // 풀(증가만) — 0..lickCount 가 활성 슬롯. burst 마다 슬롯 필드만 덮어써 재사용한다(GC 압박 제거).
  private licks: Lick[] = []
  private lickCount = 0
  private fireT = 1e9 // 큰 값 = 초기엔 화구 없음(첫 burst 에서 0 으로 리셋)
  private shockT = 1e9 // 충격파 링도 동일
  private cx = 0
  private cy = 0
  private k = 1 // 스케일 = 30rem/REF_W (rem 스케일 대응)

  // 캔버스·루프·크기는 호스트(EffectCanvasHost)가 소유한다 — 이 시스템은 불꽃 상태와 그리기만 맡는 레이어.
  constructor(host: EffectCanvasHost) {
    this.host = host
  }

  isAlive(): boolean {
    const S = hitSparkSettings
    return this.lickCount > 0 || this.fireT < S.fireDur || this.shockT < S.shockDur
  }

  private lick(i: number): Lick {
    let l = this.licks[i]
    if (!l) {
      l = { x: 0, y: 0, vy: 0, r: 0, t: 0, max: 0, ph: 0 }
      this.licks[i] = l
    }
    return l
  }

  // 임팩트 1회 — 화구·충격파를 리셋하고 불혀 풀을 다시 채운다. 원점(origin)은 검 박스 중심 기준 px.
  burst(origin: { x: number; y: number }) {
    const g = this.host.geometry()
    if (g.w <= 0 || g.h <= 0) return
    this.cx = g.cx + origin.x
    this.cy = g.cy + origin.y
    this.k = (REF_CANVAS_REM * g.remPx) / REF_W
    const S = hitSparkSettings

    // 불혀 — 발화점 주변에 흩어 심고 위로 솟게 한다(수명·반경·위상은 난수).
    let li = 0
    for (let i = 0; i < S.lickCount; i++) {
      const l = this.lick(li++)
      l.x = this.cx + (Math.random() - 0.5) * S.arcR * 4 * S.scale * this.k
      l.y = this.cy + (Math.random() - 0.5) * 6 * this.k
      l.vy = -S.lickRise * S.scale * this.k * (0.7 + Math.random() * 0.6)
      l.r = S.lickR * S.scale * this.k * (0.7 + Math.random() * 0.7)
      l.t = 0
      l.max = S.lickLife * (0.7 + Math.random() * 0.6)
      l.ph = Math.random() * TAU
    }
    this.lickCount = li
    this.fireT = 0
    this.shockT = 0
    this.host.wake()
  }

  draw(ctx: CanvasRenderingContext2D, f: EffectFrame) {
    const { dt, dpr } = f
    const pal = resolvePalette()
    const S = hitSparkSettings

    // 화염은 전부 가산 합성(겹치는 곳이 백열로 탄다).
    ctx.globalCompositeOperation = 'lighter'

    // 충격파 링 — 원점에서 빠르게 팽창하며 사라지는 백열 고리(안쪽 흰 링 + 바깥 노랑 링).
    if (this.shockT < S.shockDur) {
      const q = this.shockT / S.shockDur
      const r = S.shockR * S.scale * this.k * (0.15 + 0.85 * Math.pow(q, 0.55))
      const a = Math.pow(1 - q, 1.3)
      ctx.strokeStyle = rgba(pal.arcCore, 0.9 * a)
      ctx.lineWidth = (3.5 - 2.3 * q) * this.k
      ctx.beginPath()
      ctx.arc(this.cx, this.cy, r, 0, TAU)
      ctx.stroke()
      ctx.strokeStyle = rgba(pal.cool[0], 0.5 * a)
      ctx.lineWidth = (5.5 - 3.5 * q) * this.k
      ctx.beginPath()
      ctx.arc(this.cx, this.cy, r * 0.9, 0, TAU)
      ctx.stroke()
      this.shockT += dt
    }

    // 임팩트 화구 — 구운 텍스처를 반경 r 로 찍는다(알파 fa 는 globalAlpha). 후광은 글로우 스프라이트 한 장.
    if (this.fireT < S.fireDur) {
      const q = this.fireT / S.fireDur
      const fa = Math.pow(1 - q, 1.5)
      const r = S.fireR * S.scale * this.k * (0.55 + 0.45 * q)
      ctx.globalAlpha = fa
      ctx.drawImage(getFireballTexture(), this.cx - r, this.cy - r, r * 2, r * 2)
      ctx.globalAlpha = 1
      if (S.fireGlow > 0) {
        const gr = r * 1.7
        ctx.globalAlpha = fa * S.fireGlow
        ctx.drawImage(getGlowSprite(), this.cx - gr, this.cy - gr, gr * 2, gr * 2)
        ctx.globalAlpha = 1
      }
      this.fireT += dt
    }

    // 불혀 — 발화점에서 솟아오르며 수축·깜빡이다 꺼진다. 단(3)마다 맥동 신장 변환을 걸어 텍스처를 찍는다.
    // save/restore 대신 setTransform 으로 변환을 되돌린다(상태 스택 push/pop 비용 없음 — 단당 1회 행렬 대입).
    if (this.lickCount > 0) {
      let w = 0
      for (let r = 0; r < this.lickCount; r++) {
        const l = this.licks[r]
        l.t += dt
        const q = l.t / l.max
        if (q >= 1) continue
        l.vy *= Math.exp(-1.5 * dt) // 상승 감쇠 — 빠르게 솟다 끝에서 머문다
        l.y += l.vy * dt
        l.x += Math.sin(l.t * 15 + l.ph) * 110 * this.k * dt // 혀 전체의 좌우 일렁임 — 빠르고 크게
        const rr = l.r * (1 - 0.6 * q) * 0.78
        const la =
          Math.pow(1 - q, 1.2) *
          (0.45 + 0.55 * Math.abs(Math.sin(l.t * 27 + l.ph))) *
          0.9
        for (let s = 0; s < 3; s++) {
          const f2 = s / 2 // 밑동 0 → 끝 1
          const seg = rr * (1 - 0.45 * f2) // 테이퍼 — 끝이 가늘다
          const roil =
            1 +
            (0.2 + 0.42 * f2) * Math.sin(l.t * (30 + 12 * s) + l.ph * (1.3 + s))
          const sx =
            l.x +
            Math.sin(l.t * (17 + 11 * s) + l.ph + s * 1.9) *
              seg *
              (0.5 + 1.4 * f2)
          const sy = l.y - s * seg * 1.1 // 위로 쌓아 혀 기둥을 만든다
          const sa = la * (1 - 0.2 * f2) // 끝은 살짝 옅게(식어가는 혀끝)
          const pulse = 1.5 + 0.7 * Math.sin(l.t * 20 + l.ph + s) // 맥동 신장 — 빠르고 깊게 핥아 올리는 박동
          // 변환 = dpr 스케일 ∘ 이동(sx,sy) ∘ 세로 신장(pulse)
          ctx.setTransform(dpr, 0, 0, dpr * pulse, sx * dpr, sy * dpr)
          const r2 = seg * roil
          ctx.globalAlpha = sa
          ctx.drawImage(getLickTexture(), -r2, -r2, r2 * 2, r2 * 2)
          if (S.lickGlow > 0) {
            const gr = r2 * 1.9
            ctx.globalAlpha = sa * S.lickGlow
            ctx.drawImage(getGlowSprite(), -gr, -gr, gr * 2, gr * 2)
          }
        }
        if (w !== r) {
          const tmp = this.licks[w]
          this.licks[w] = l
          this.licks[r] = tmp
        }
        w++
      }
      this.lickCount = w
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.globalAlpha = 1
    }

    ctx.globalCompositeOperation = 'source-over'
  }

  // 첫 타격의 일회성 비용(팔레트 해석·텍스처 굽기 + 풀 슬롯 확보)을 마운트로 옮겨 첫 burst 가 프레임을 떨구지 않게 한다.
  warmup(lickReserve = 0) {
    for (let i = 0; i < lickReserve; i++) this.lick(i)
    getGlowSprite()
    getFireballTexture()
    getLickTexture()
  }
}
