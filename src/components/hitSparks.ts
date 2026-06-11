// 강화 망치 임팩트의 "용접식 불꽃"(프레젠테이션 전용) — 작은 캔버스 한 장이 매 임팩트마다 가는 불티를
// 사방으로 폭발시킨다. 밀도 높은 가는 실 + 긴 비행은 작은 스테이지에서 DOM 으로는 묻혀(1px 불티가 안 보임)
// 캔버스로 픽셀 단위로 그린다. 성공/실패 버스트는 여전히 DOM 풀(ParticlePool) — 이 시스템은 hit 만 담당한다.
//
// 좌표/물리는 결정적이지 않아도 된다(시각 연출 — 게임 로직 아님). 매 타격마다 Math.random 으로 약간씩 다른
// 산란을 줘 더 자연스럽다. 색은 index.css 의 @theme 토큰(소스 hex 금지)을 런타임 1회 해석해 쓴다.
//
// 튜닝값(개수·굵기·스케일 등) — 인앱 튜너로 눈으로 맞춰 확정한 값이다. 한곳에 모아 두어 연출을 조정한다.
const hitSparkSettings = {
  count: 17, // 한 타격당 불티 수 — 밀도가 곧 "튀는" 느낌
  thick: 0.3, // 불티 코어 선 굵기(px, k 로 스케일)
  scale: 1, // 전체 스케일(속도·길이·아크 반경)
  fanDeg: 45, // 위(−90°) 중심 부채꼴 폭 — 좁게 위로 솟구침
  baseVel: 260, // 기준 속도(px/s) — ×scale×k, 불티별 sp(0.6~1.9) 난수 배수
  gravity: 700, // 중력(px/s², ×k) — 호 그리며 낙하
  lifeMin: 0.1, // 불티 최소 수명(초) — +lifeVar 난수
  lifeVar: 0.28, // 수명 변주 — 제각각 사그라듦
  lenFactor: 0.01, // 실 길이 = min(cap, |v|×이값) — 빠를수록 긴 실(모션블러)
  lenCap: 10, // 실 길이 상한(×scale×k)
  arcR: 10, // 중심 아크(발화점) 반경(×scale×k)
  arcDur: 0.18, // 아크 섬광 길이(초)
  glow: 14, // 불티 후광 반경(px, ×k) — additive 로 깔아 발광체처럼(0 이면 글로우 없음)
}

const REF_W = 460 // 데모 기준 캔버스 폭 — 실제 캔버스 폭과의 비(k)로 모든 px 를 스케일(rem 스케일 대응)
const TAU = Math.PI * 2

type Spark = {
  x: number
  y: number
  vx: number
  vy: number
  t: number
  life: number
  max: number
  ph: number // 플리커 위상
  head: number // 머리 점 반경
}

// ── @theme 토큰(hex) → rgb 1회 해석 + 캐시 ─────────────────────────────────────
// 캐시는 정적이다 — 현재 코드베이스에 런타임 테마 전환 경로가 없다(hit 토큰은 index.css 의 정적 @theme 상수).
// 다크모드/테마 토글을 도입하면 palette·glowSprite 를 무효화(null 리셋)해야 한다.
type Palette = {
  cool: number[][]
  outline: number[]
  arc: number[]
  arcCore: number[] // 발화 정중앙 백색 점
  arcHalo: number[] // 발화 아크 외곽 크림 헤일로
  headHot: number[] // 불티 머리 백열 하이라이트 시작
  headWarm: number[] // 불티 머리 하이라이트 끝(식음)
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
    // 식어가는 4-stop: 머리(호박) → 주황 → 적색 → 잿불
    cool: [
      tok('--color-hit-flash'),
      tok('--color-hit-core'),
      tok('--color-hit-edge'),
      tok('--color-hit-ember'),
    ],
    outline: tok('--color-hit-outline'),
    arc: tok('--color-hit-arc'),
    arcCore: tok('--color-hit-arc-core'),
    arcHalo: tok('--color-hit-arc-halo'),
    headHot: tok('--color-hit-head-hot'),
    headWarm: tok('--color-hit-head-warm'),
  }
  return palette
}

function coolAt(cool: number[][], t: number): number[] {
  let seg: number, f: number
  if (t < 0.32) {
    seg = 0
    f = t / 0.32
  } else if (t < 0.66) {
    seg = 1
    f = (t - 0.32) / 0.34
  } else {
    seg = 2
    f = (t - 0.66) / 0.34
  }
  const a = cool[seg]
  const b = cool[seg + 1]
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]
}

const rgba = (c: number[], a: number) =>
  `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`

// 부드러운 글로우 스프라이트(오프스크린, 1회 구움) — 가산 합성으로 불티마다 blit 해 발광 후광을 낸다.
// shadowBlur(매 draw 가우시안 블러)는 임팩트 때 프레임을 떨어뜨려, 캐시한 텍스처 복사(drawImage)로 대체한다.
// 색은 머리 호박(--color-hit-flash)으로 고정 — 캐시는 정적(런타임 테마 전환 경로 없음; 도입 시 무효화 필요).
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

// ── 캔버스 스파크 시스템 ────────────────────────────────────────────────────────
// 임팩트마다 burst() 로 불티를 추가하고, 살아 있는 불티가 있는 동안에만 rAF 루프를 돈다(평소 0 비용).
export class HitSparkSystem {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private sparks: Spark[] = []
  private flashT = 1e9 // 큰 값 = 초기엔 아크 섬광 없음(첫 burst 에서 0 으로 리셋)
  private cx = 0
  private cy = 0
  private w = 0
  private h = 0
  private bw = 0 // 현재 backing store 픽셀 폭(리사이즈 감지)
  private bh = 0
  private k = 1 // 스케일 = 캔버스 CSS 폭 / REF_W (rem 스케일 대응)
  private g = 0 // 중력(px/s², ×k) — burst 에서 설정값으로 채운다
  private running = false
  private prev = 0
  private raf = 0

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('HitSparkSystem: 2d context unavailable')
    this.ctx = ctx
  }

  // dpr 기준 backing store 픽셀 크기를 맞춘다(크기 변화 시에만 재설정 — 매번 하면 진행 중 프레임이 지워진다).
  // burst·warmup 공용(중복 제거). dpr 을 반환해 호출 측이 setTransform 에 쓴다.
  private syncBackingStore(rect: DOMRect): number {
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const bw = Math.round(rect.width * dpr)
    const bh = Math.round(rect.height * dpr)
    if (bw !== this.bw || bh !== this.bh) {
      this.canvas.width = bw
      this.canvas.height = bh
      this.bw = bw
      this.bh = bh
    }
    return dpr
  }

  burst() {
    const rect = this.canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const dpr = this.syncBackingStore(rect)
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.w = rect.width
    this.h = rect.height
    this.cx = rect.width / 2
    this.cy = rect.height / 2
    this.k = rect.width / REF_W
    const S = hitSparkSettings
    this.g = S.gravity * this.k

    const fanRad = (S.fanDeg * Math.PI) / 180
    const v = S.baseVel * S.scale * this.k
    for (let i = 0; i < S.count; i++) {
      const ang =
        -Math.PI / 2 +
        (Math.random() - 0.5) * fanRad +
        (Math.random() - 0.5) * 0.25
      const sp = 0.6 + Math.random() * 1.3 // 0.6~1.9
      this.sparks.push({
        x: this.cx,
        y: this.cy,
        vx: Math.cos(ang) * sp * v,
        vy: Math.sin(ang) * sp * v,
        t: 0,
        life: 0,
        max: S.lifeMin + Math.random() * S.lifeVar,
        ph: Math.random() * TAU,
        head: S.thick * this.k * (0.7 + Math.random() * 0.6),
      })
    }
    this.flashT = 0
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
    if (this.sparks.length === 0 && this.flashT >= hitSparkSettings.arcDur) {
      this.running = false
      this.ctx.clearRect(0, 0, this.w, this.h)
      return
    }
    this.raf = requestAnimationFrame(this.loop)
  }

  private draw(dt: number) {
    const ctx = this.ctx
    const pal = resolvePalette()
    const S = hitSparkSettings
    ctx.clearRect(0, 0, this.w, this.h)

    // 중심 발화 아크(청백색) — 짧게 번쩍.
    if (this.flashT < S.arcDur) {
      const fa = 1 - this.flashT / S.arcDur
      const r = S.arcR * S.scale * this.k
      const grad = ctx.createRadialGradient(this.cx, this.cy, 0, this.cx, this.cy, r)
      grad.addColorStop(0, rgba(pal.arc, 0.95 * fa))
      grad.addColorStop(0.4, rgba(pal.arcHalo, 0.5 * fa))
      grad.addColorStop(1, rgba(pal.arcHalo, 0))
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(this.cx, this.cy, r, 0, TAU)
      ctx.fill()
      ctx.fillStyle = rgba(pal.arcCore, 0.9 * fa)
      ctx.beginPath()
      ctx.arc(this.cx, this.cy, 4 * S.scale * this.k, 0, TAU)
      ctx.fill()
      this.flashT += dt
    }

    ctx.lineCap = 'round'
    const cap = S.lenCap * S.scale * this.k
    const coreW = S.thick * this.k

    // 물리 전진 + 이번 프레임 렌더값 수집(살아 있는 것만). 그린 패스를 두 번(글로우→또렷) 돌려야 해서 미리 모은다.
    // (핫패스 단명 할당이 있으나 count 적고 enhanceLock 게이팅 + 측정상 무해 — 부하 시 Spark 필드 저장 + in-place
    //  압축으로 frame[]/alive[] 제거 가능.)
    type Render = { x: number; y: number; tx: number; ty: number; a: number; c: number[]; head: number; life: number }
    const frame: Render[] = []
    const alive: Spark[] = []
    for (const p of this.sparks) {
      p.t += dt
      p.life = p.t / p.max
      if (p.life >= 1) continue
      p.vy += this.g * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      const mag = Math.hypot(p.vx, p.vy) || 1
      const len = Math.min(cap, mag * S.lenFactor) * (1 - 0.3 * p.life) + 3 * this.k
      const ux = p.vx / mag
      const uy = p.vy / mag
      const flick = 0.62 + 0.38 * Math.abs(Math.sin(p.life * 26 + p.ph))
      // 수명 내내 선형으로 점점 흐려진다(끝에서만 꺼지지 않고 비행하며 식어 사그라듦) + 자글거림(flick).
      const a = flick * (1 - p.life)
      frame.push({
        x: p.x,
        y: p.y,
        tx: p.x - ux * len,
        ty: p.y - uy * len,
        a,
        c: coolAt(pal.cool, p.life),
        head: p.head,
        life: p.life,
      })
      alive.push(p)
    }
    this.sparks = alive

    // 패스 1 — additive 후광 블룸: 미리 구운 글로우 스프라이트를 가산 합성으로 불티마다 blit 한다. 겹치는
    // 불티의 빛이 누적돼 발광체처럼 보인다. shadowBlur 와 달리 캐시 텍스처 복사라 임팩트 때 프레임을 안 떨군다.
    if (S.glow > 0) {
      const sprite = getGlowSprite()
      ctx.globalCompositeOperation = 'lighter'
      const r = coreW * 2 + S.glow * this.k // 후광 반경(px)
      for (const f of frame) {
        ctx.globalAlpha = f.a < 1 ? f.a : 1
        ctx.drawImage(sprite, f.x - r, f.y - r, r * 2, r * 2)
      }
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
    }

    // 패스 2 — 또렷한 코어(글로우 위): 어두운 테두리(밝은 크림 위 대비) → 식어가는 코어 → 더 뜨거운 백열 머리.
    // 머리 하이라이트는 headHot→headWarm 을 수명으로 보간(중간 배열 할당 없이 rgba 문자열에 인라인).
    const hh = pal.headHot
    const hw = pal.headWarm
    for (const f of frame) {
      ctx.strokeStyle = rgba(pal.outline, f.a * 0.9)
      ctx.lineWidth = coreW + 1.9 * this.k
      ctx.beginPath()
      ctx.moveTo(f.tx, f.ty)
      ctx.lineTo(f.x, f.y)
      ctx.stroke()
      ctx.strokeStyle = rgba(f.c, f.a)
      ctx.lineWidth = coreW
      ctx.beginPath()
      ctx.moveTo(f.tx, f.ty)
      ctx.lineTo(f.x, f.y)
      ctx.stroke()
      const hl = f.life
      ctx.fillStyle = `rgba(${(hh[0] + (hw[0] - hh[0]) * hl) | 0},${(hh[1] + (hw[1] - hh[1]) * hl) | 0},${(hh[2] + (hw[2] - hh[2]) * hl) | 0},${f.a})`
      ctx.beginPath()
      ctx.arc(f.x, f.y, f.head, 0, TAU)
      ctx.fill()
    }
  }

  // 첫 타격의 일회성 비용(캔버스 버퍼 할당·팔레트 해석·글로우 스프라이트 굽기)을 마운트로 옮겨 첫 burst 가
  // 프레임을 떨구지 않게 한다. 레이아웃 전(rect 0)이면 건너뛰고 첫 burst 에서 잡는다(무해).
  warmup() {
    const rect = this.canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    this.syncBackingStore(rect)
    getGlowSprite()
  }

  dispose() {
    this.running = false
    if (this.raf) cancelAnimationFrame(this.raf)
    this.sparks = []
  }
}
