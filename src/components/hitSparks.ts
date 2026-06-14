// 강화 분출 불꽃(프레젠테이션 전용) — 작은 캔버스 한 장이 매 버스트(떨림이 끝나는 burstAt)마다 세 겹을
// 폭발시킨다: ① 빠른 불티(용접 결의 가는 실 — 탄도 비행) 다수, ② 잉걸불(크고 느린 불씨 소수 — 공기
// 저항에 곧 멈춰 난류로 춤추다 수명 말기엔 떠오르며 사그라듦), ③ 임팩트 화구·불혀(따뜻한 가산 섬광 +
// 발화점에서 솟아오르는 화염 혀). 밀도 높은 가는 실 + 픽셀 단위 묘사는 작은 스테이지에서 DOM 으로는
// 묻혀 캔버스로 그린다.
//
// 이 불꽃이 옛 "도트 버스트"(성공=금/파괴=적)를 대체한다 — 그래서 burst(origin, colors) 가 결과 색쌍을
// 받아 화염색을 결과별로 물들인다(성공=금 계열 / 파괴=적 계열). 발사 시점도 임팩트가 아니라 버스트
// (떨림 끝 = 결과 공개)에 맞춘다 — 호출 측(HitSparkCanvas)이 그 타이밍을 소유한다.
//
// 좌표/물리는 결정적이지 않아도 된다(시각 연출 — 게임 로직 아님). 매 타격마다 Math.random 으로 약간씩 다른
// 산란을 줘 더 자연스럽다. 색은 index.css 의 @theme 토큰(소스 hex 금지)을 런타임 1회 해석해 쓴다.
//
// 튜닝값(개수·굵기·스케일 등) — 브라우저에서 눈으로 맞추는 값이다. 한곳에 모아 두어 연출을 조정한다.
const hitSparkSettings = {
  // ── 빠른 불티(용접 결 — 가늘고 빠른 실) ──
  // 이 불꽃이 옛 도트 버스트(성공=금/파괴=적)를 대체하므로, 한 가닥짜리 임팩트 불티가 아니라 사방으로
  // 터지는 "분출"이 되도록 수·굵기·후광·산란을 키웠다. 속도(baseVel)·scale 은 그대로 둬 캔버스 밖으로
  // 새지 않게 하고, 크기감은 굵기(thick)·길이(lenCap)·후광(glow)·화구/불혀 반경으로 키운다.
  count: 14, // 한 타격당 불티 수 — 도트 버스트를 대신해 사방으로 더 풍성하게 흩는다
  thick: 1.4, // 불티 코어 선 굵기(px, k 로 스케일) — 테두리 없이 코어 단독이라 굵을수록 또렷하다
  scale: 1, // 전체 스케일(속도·길이·아크 반경) — 키우면 캔버스 밖으로 새므로 크기감은 아래 반경들로 낸다
  fanDeg: 150, // 발화점 중심 부채꼴 폭 — 넓혀서 위쪽 분출이 아니라 사방 폭발로(도트 버스트의 방사 느낌)
  baseVel: 300, // 기준 속도(px/s) — ×scale×k, 불티별 sp(0.6~1.9) 난수 배수
  gravity: 700, // 중력(px/s², ×k) — 호 그리며 낙하
  lifeMin: 0.1, // 불티 최소 수명(초) — +lifeVar 난수
  lifeVar: 0.3, // 수명 변주 — 제각각 사그라듦
  lenFactor: 0.013, // 실 길이 = min(cap, |v|×이값) — 빠를수록 긴 실(모션블러)
  lenCap: 15, // 실 길이 상한(×scale×k)
  arcR: 14, // 발화점 반경(×scale×k) — 불혀 가로 산란의 기준(심지 섬광은 제거됨)
  glow: 28, // 불티 후광 반경(px, ×k) — additive 로 깔아 발광체처럼(0 이면 글로우 없음)
  // ── 잉걸불(크고 느린 불씨 소수 — 식는 동안 잔류해 타격의 여운을 만든다) ──
  emberCount: 8, // 한 타격당 잉걸불 수
  emberVelMul: 1.15, // 초기 속도 = baseVel × 이 값 — 망치 머리(≈±50px) 가장자리 밖까지 나가 멈추도록
  emberLifeMin: 0.45, // 잉걸불 최소 수명(초) — 불티보다 길게 잔류
  emberLifeVar: 0.3,
  emberDrag: 5, // 공기 저항(1/s, 지수 감쇠) — 튀어나온 직후 급감속해 허공에 머문다
  emberFlutter: 320, // 난류 좌우 흔들림(가속 px/s², ×k) — 느려진 불씨가 춤추는 요동
  emberBuoyancy: 1.6, // 수명 말기 중력 상쇄 — 유효 중력 = g×(1 − 이값×life²), 1 보다 크면 끝에서 떠오른다
  emberHead: 3.6, // 잉걸불 크기 가중(px, ×k) — 글로우 후광 반경에 들어가 불씨가 더 크게 빛난다
  // ── 임팩트 화구(따뜻한 폭발 섬광 — 가산 합성으로 불혀·불티와 겹쳐 중심이 백열로 탄다) ──
  fireR: 56, // 화구 최대 반경(×scale×k) — 분출의 중심 섬광(도트 버스트의 코어를 대신)
  fireDur: 0.13, // 화구 길이(초) — 짧게 번쩍하고 꺼진다
  fireGlow: 0.7, // 화구 후광 강도(0~1, 0 이면 없음) — 글로우 스프라이트를 크게 덧대 빛이 번진다
  // ── 충격파 링(임팩트 "펑" — 원점에서 빠르게 팽창하며 사라지는 백열 고리) ──
  shockR: 78, // 링 최대 반경(×scale×k)
  shockDur: 0.18, // 링 길이(초) — 화구보다 살짝 길게 남아 팽창이 읽힌다
  // ── 불혀(발화점에서 솟아오르며 수축·깜빡이다 꺼지는 화염 혀) ──
  lickCount: 9, // 한 타격당 불혀 수 — 여러 가닥이 사방에서 춤춘다
  lickRise: 150, // 상승 속도(px/s, ×scale×k) — 망치 머리 위로 솟아오르도록
  lickLife: 0.38, // 기본 수명(초) — ×(0.7~1.3) 난수
  lickR: 33, // 기본 반경(px, ×scale×k) — ×(0.7~1.4) 난수, 수명 따라 수축
  lickGlow: 0.6, // 불혀 후광 강도(0~1, 0 이면 없음) — 단마다 글로우를 덧대 혀가 주변을 비춘다
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
  head: number // 개체 크기 가중 — 글로우 blit 반경에 들어간다(머리 백열 점은 제거됨)
  // 잉걸불 물리(빠른 불티는 전부 0 — 순수 탄도). 0/양수 분기로 두 계층이 한 배열을 공유한다.
  drag: number // 공기 저항(1/s) — 지수 감쇠
  flut: number // 난류 좌우 요동(가속 px/s², ×k)
  buoy: number // 수명 말기 부력 — 유효 중력 = g×(1 − buoy×life²)
  // 렌더 스크래치(매 프레임 패스 0에서 갱신, 패스 1·2가 읽음) — frame[]/alive[]/coolAt 새 배열 할당 제거용.
  rtx: number // 꼬리 끝 x(글로우는 머리 x,y 를 쓴다)
  rty: number // 꼬리 끝 y
  ra: number // alpha(자글거림 × 페이드)
  rc: number[] // 화염색 — coolInto 가 채우는 길이 3 재사용 버퍼
}

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
// 결과(성공=금/파괴=적)마다 화염색이 다르므로 색쌍(coreVar|edgeVar)별로 팔레트를 캐시한다 — 변종이 둘뿐이라
// Map 으로 충분하다. 캐시는 정적이다(런타임 테마 전환 경로 없음 — hit 토큰은 index.css 의 정적 @theme 상수).
// 다크모드/테마 토글을 도입하면 paletteCache·glowSprite 를 무효화(clear/null 리셋)해야 한다.
type Palette = {
  cool: number[][]
  arcCore: number[] // 화염 백열 중심색 — 화구·불혀 그라데이션의 가장 뜨거운 속
}
const paletteCache = new Map<string, Palette>()

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

// 'var(--x)' 래퍼 또는 생 hex 를 받아 실제 hex 문자열로 푼다(소비자는 'var(--color-gold)' 형태를 넘긴다).
function resolveColorExpr(root: CSSStyleDeclaration, expr: string): string {
  const m = expr.match(/var\((--[\w-]+)\)/)
  return (m ? root.getPropertyValue(m[1]) : expr).trim()
}

// 결과 색쌍(coreVar=밝은 코어 / edgeVar=가장자리)으로 식어가는 4-stop 화염 램프를 만든다:
//   머리(백열 화염 노랑, 공통) → 코어(결과색) → 가장자리(결과색) → 잿불(공통 어두운 적). 머리·꼬리는
// 공통 hit 토큰이라 어떤 결과든 백열에서 시작해 잿불로 식고, 중간 두 stop 만 결과색(금/적)으로 물든다.
function resolvePalette(coreVar: string, edgeVar: string): Palette {
  const key = coreVar + '|' + edgeVar
  const cached = paletteCache.get(key)
  if (cached) return cached
  const root = getComputedStyle(document.documentElement)
  const tok = (name: string) => hexToRgb(root.getPropertyValue(name).trim())
  const expr = (e: string) => hexToRgb(resolveColorExpr(root, e))
  const pal: Palette = {
    cool: [tok('--color-hit-flash'), expr(coreVar), expr(edgeVar), tok('--color-hit-ember')],
    arcCore: tok('--color-hit-arc-core'),
  }
  paletteCache.set(key, pal)
  return pal
}

// 식어가는 화염색을 out 버퍼(길이 3)에 채운다 — 매 프레임 새 배열을 반환하던 coolAt 의 인플레이스 버전
// (불티마다 1회 호출이라 핫패스. 반환 할당 0으로 GC 압박 제거).
function coolInto(cool: number[][], t: number, out: number[]): void {
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
  out[0] = a[0] + (b[0] - a[0]) * f
  out[1] = a[1] + (b[1] - a[1]) * f
  out[2] = a[2] + (b[2] - a[2]) * f
}

const rgba = (c: number[], a: number) =>
  `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`

// 부드러운 글로우 스프라이트(오프스크린, 1회 구움) — 가산 합성으로 불티마다 blit 해 발광 후광을 낸다.
// shadowBlur(매 draw 가우시안 블러)는 임팩트 때 프레임을 떨어뜨려, 캐시한 텍스처 복사(drawImage)로 대체한다.
// 색은 머리 노랑(--color-hit-flash)으로 고정 — 캐시는 정적(런타임 테마 전환 경로 없음; 도입 시 무효화 필요).
let glowSprite: HTMLCanvasElement | null = null
function getGlowSprite(): HTMLCanvasElement {
  if (glowSprite) return glowSprite
  // 후광 색은 백열 머리(--color-hit-flash)로 고정 — 결과(금/적)와 무관한 공통 뜨거운 심지라 한 장만 굽는다.
  const color = hexToRgb(
    getComputedStyle(document.documentElement)
      .getPropertyValue('--color-hit-flash')
      .trim(),
  )
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
// 임팩트마다 burst() 로 이전 불티를 비우고 새 불티로 교체하며(replace), 살아 있는 불티가 있는 동안에만 rAF 루프를 돈다(평소 0 비용).
export class HitSparkSystem {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  // 풀(증가만) — 0..sparkCount / 0..lickCount 가 활성. burst 마다 객체를 새로 만들지 않고 슬롯 필드만 덮어쓴다.
  private sparks: Spark[] = []
  private sparkCount = 0
  private licks: Lick[] = []
  private lickCount = 0
  private fireT = 1e9 // 큰 값 = 초기엔 화구 없음(첫 burst 에서 0 으로 리셋)
  private shockT = 1e9 // 충격파 링도 동일
  private cx = 0
  private cy = 0
  private w = 0
  private h = 0
  private bw = 0 // 현재 backing store 픽셀 폭(리사이즈 감지)
  private bh = 0
  private k = 1 // 스케일 = 캔버스 CSS 폭 / REF_W (rem 스케일 대응)
  private g = 0 // 중력(px/s², ×k) — burst 에서 설정값으로 채운다
  private pal: Palette | null = null // 이번 버스트의 화염 팔레트(결과 색쌍) — burst 가 채우고 draw 가 읽는다
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

  // 풀 슬롯 접근 — 없으면 1회 생성, 있으면 재사용(필드는 호출 측 burst 가 덮어쓴다).
  private spark(i: number): Spark {
    let s = this.sparks[i]
    if (!s) {
      s = {
        x: 0, y: 0, vx: 0, vy: 0, t: 0, life: 0, max: 0, ph: 0, head: 0,
        drag: 0, flut: 0, buoy: 0, rtx: 0, rty: 0, ra: 0, rc: [0, 0, 0],
      }
      this.sparks[i] = s
    }
    return s
  }
  private lick(i: number): Lick {
    let l = this.licks[i]
    if (!l) {
      l = { x: 0, y: 0, vy: 0, r: 0, t: 0, max: 0, ph: 0 }
      this.licks[i] = l
    }
    return l
  }

  // origin: 폭발 원점(검 박스 중심 기준 px). colors: 결과(성공=금/파괴=적)의 코어·가장자리 색쌍 —
  // 화염 램프 중간 두 stop 에 꽂혀 불꽃 전체를 결과색으로 물들인다(머리 백열·잿불 꼬리는 공통).
  // 망치 키프레임과 같은 "생(raw) px" 공간이라 k 를 곱하지 않는다(rem 스케일과 무관하게 정렬 유지).
  burst(origin: { x: number; y: number }, colors: { coreVar: string; edgeVar: string }) {
    const rect = this.canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const dpr = this.syncBackingStore(rect)
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.w = rect.width
    this.h = rect.height
    this.cx = rect.width / 2 + origin.x
    this.cy = rect.height / 2 + origin.y
    this.k = rect.width / REF_W
    this.pal = resolvePalette(colors.coreVar, colors.edgeVar)
    const S = hitSparkSettings
    this.g = S.gravity * this.k

    // 새 타격이 이전 불티를 대체한다(replace — 누적 금지). 단 객체를 버리지 않고 풀 슬롯(spark()/lick())의
    // 필드만 덮어써 재사용한다 — 첫 타격 이후 Spark/Lick 할당이 0이라 연사 시 GC 압박이 없다. sparkCount/
    // lickCount 를 이번 개수로 맞춰 이전 타격의 잔여 슬롯을 활성 범위 밖으로 버린다(도트 버스트와 같은 정책).
    let si = 0
    const fanRad = (S.fanDeg * Math.PI) / 180
    const v = S.baseVel * S.scale * this.k
    // 빠른 불티 — 용접 결의 가는 실. 탄도 비행(잉걸불 물리 필드 전부 0).
    for (let i = 0; i < S.count; i++) {
      const ang =
        -Math.PI / 2 +
        (Math.random() - 0.5) * fanRad +
        (Math.random() - 0.5) * 0.25
      const sp = 0.6 + Math.random() * 1.3 // 0.6~1.9
      const s = this.spark(si++)
      s.x = this.cx
      s.y = this.cy
      s.vx = Math.cos(ang) * sp * v
      s.vy = Math.sin(ang) * sp * v
      s.t = 0
      s.life = 0
      s.max = S.lifeMin + Math.random() * S.lifeVar
      s.ph = Math.random() * TAU
      s.head = S.thick * this.k * (0.7 + Math.random() * 0.6)
      s.drag = 0
      s.flut = 0
      s.buoy = 0
    }
    // 잉걸불 — 더 넓은 부채꼴로 느리게 톡 튀어, 드래그에 멈춰 춤추다 떠오르며 사그라든다.
    for (let i = 0; i < S.emberCount; i++) {
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * fanRad * 1.5
      const sp = (0.45 + Math.random() * 0.55) * S.emberVelMul
      const s = this.spark(si++)
      s.x = this.cx
      s.y = this.cy
      s.vx = Math.cos(ang) * sp * v
      s.vy = Math.sin(ang) * sp * v
      s.t = 0
      s.life = 0
      s.max = S.emberLifeMin + Math.random() * S.emberLifeVar
      s.ph = Math.random() * TAU
      s.head = S.emberHead * this.k * (0.7 + Math.random() * 0.6)
      s.drag = S.emberDrag
      s.flut = S.emberFlutter
      s.buoy = S.emberBuoyancy
    }
    this.sparkCount = si
    // 불혀 — 발화점 주변에 흩어져 솟기 시작(가로 산란을 넓혀 망치 머리 양옆에서도 혀가 비어져 나온다).
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
    if (
      this.sparkCount === 0 &&
      this.lickCount === 0 &&
      this.fireT >= hitSparkSettings.fireDur &&
      this.shockT >= hitSparkSettings.shockDur
    ) {
      this.running = false
      this.ctx.clearRect(0, 0, this.w, this.h)
      return
    }
    this.raf = requestAnimationFrame(this.loop)
  }

  private draw(dt: number) {
    const ctx = this.ctx
    const pal = this.pal
    if (!pal) return // 팔레트는 burst 가 채운다 — 루프는 burst 이후에만 도므로 사실상 항상 설정돼 있다.
    const S = hitSparkSettings
    ctx.clearRect(0, 0, this.w, this.h)

    // 중심 발화점 심지 섬광은 제거됐다(화구·불혀가 임팩트 순간을 담당) — 충격파 + 화구 + 불혀를
    // 가산 합성(lighter)으로: 서로·불티 글로우와 겹치는 픽셀이 백열로 탄다.
    ctx.globalCompositeOperation = 'lighter'

    // 충격파 링 — 폭발의 "펑": 머리 끝에서 빠르게 팽창(점점 감속)하며 가늘어지고 사라지는 백열 고리.
    if (this.shockT < S.shockDur) {
      const q = this.shockT / S.shockDur
      const r = S.shockR * S.scale * this.k * (0.15 + 0.85 * Math.pow(q, 0.55))
      const a = Math.pow(1 - q, 1.3)
      ctx.strokeStyle = rgba(pal.arcCore, 0.9 * a)
      ctx.lineWidth = (3.5 - 2.3 * q) * this.k
      ctx.beginPath()
      ctx.arc(this.cx, this.cy, r, 0, TAU)
      ctx.stroke()
      // 바로 안쪽의 화염색 보조 링 — 백열 고리가 불빛을 머금은 듯한 두께감.
      ctx.strokeStyle = rgba(pal.cool[0], 0.5 * a)
      ctx.lineWidth = (5.5 - 3.5 * q) * this.k
      ctx.beginPath()
      ctx.arc(this.cx, this.cy, r * 0.9, 0, TAU)
      ctx.stroke()
      this.shockT += dt
    }

    // 임팩트 화구 — 따뜻한 폭발 섬광. 백열 중심 → 노랑 → 주황 → 적색 가장자리로 식는 방사 그라데이션이
    // 살짝 팽창하며 빠르게 꺼진다.
    if (this.fireT < S.fireDur) {
      const q = this.fireT / S.fireDur
      const fa = Math.pow(1 - q, 1.5)
      const r = S.fireR * S.scale * this.k * (0.55 + 0.45 * q)
      const grad = ctx.createRadialGradient(
        this.cx,
        this.cy,
        0,
        this.cx,
        this.cy,
        r,
      )
      grad.addColorStop(0, rgba(pal.arcCore, 0.95 * fa))
      grad.addColorStop(0.25, rgba(pal.cool[0], 0.85 * fa))
      grad.addColorStop(0.6, rgba(pal.cool[1], 0.5 * fa))
      grad.addColorStop(1, rgba(pal.cool[2], 0))
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(this.cx, this.cy, r, 0, TAU)
      ctx.fill()
      // 후광 — 구운 글로우 스프라이트를 화구보다 크게 한 장 덧대 빛이 주변으로 번진다.
      if (S.fireGlow > 0) {
        const gr = r * 1.7
        ctx.globalAlpha = fa * S.fireGlow
        ctx.drawImage(
          getGlowSprite(),
          this.cx - gr,
          this.cy - gr,
          gr * 2,
          gr * 2,
        )
        ctx.globalAlpha = 1
      }
      this.fireT += dt
    }

    // 불혀 — 단일 원 블롭이 아니라 3단 혀: 밑동→끝으로 가늘어지고(테이퍼), 끝 단으로 갈수록 빠르고
    // 크게 흔들리며(채찍), 단마다 주파수·위상이 다른 노이즈로 반경이 들끓고(roil) 세로 신장이 맥동한다
    // — 윤곽이 매 프레임 뒤틀려 격하게 일렁이는 화염 혀로 보인다. 가산 합성이라 겹친 밑동 기둥은 백열로 탄다.
    if (this.lickCount > 0) {
      // in-place swap 압축 — aliveLicks 배열 신규 할당 제거(죽은 혀는 꼬리에 보존·재사용).
      let w = 0
      for (let r = 0; r < this.lickCount; r++) {
        const l = this.licks[r]
        l.t += dt
        const q = l.t / l.max
        if (q >= 1) continue
        l.vy *= Math.exp(-1.5 * dt) // 상승 감쇠 — 빠르게 솟다 끝에서 머문다
        l.y += l.vy * dt
        l.x += Math.sin(l.t * 15 + l.ph) * 110 * this.k * dt // 혀 전체의 좌우 일렁임 — 빠르고 크게
        // 3단 합성 높이가 단일 블롭(lickR 그대로)과 비슷하도록 밑동 반경을 줄여 잡는다.
        const rr = l.r * (1 - 0.6 * q) * 0.78
        const la =
          Math.pow(1 - q, 1.2) *
          (0.45 + 0.55 * Math.abs(Math.sin(l.t * 27 + l.ph))) *
          0.9
        for (let s = 0; s < 3; s++) {
          const f = s / 2 // 밑동 0 → 끝 1
          const seg = rr * (1 - 0.45 * f) // 테이퍼 — 끝이 가늘다
          // 표면 들끓음(반경 노이즈) — 끝 단일수록 진폭이 크고, 주파수도 높여 격하게 끓는다.
          const roil =
            1 +
            (0.2 + 0.42 * f) * Math.sin(l.t * (30 + 12 * s) + l.ph * (1.3 + s))
          // 끝 채찍 — 단마다 다른 주파수로, 끝으로 갈수록 크고 빠르게 좌우로 꺾인다.
          const sx =
            l.x +
            Math.sin(l.t * (17 + 11 * s) + l.ph + s * 1.9) *
              seg *
              (0.5 + 1.4 * f)
          const sy = l.y - s * seg * 1.1 // 위로 쌓아 혀 기둥을 만든다
          const sa = la * (1 - 0.2 * f) // 끝은 살짝 옅게(식어가는 혀끝)
          ctx.save()
          ctx.translate(sx, sy)
          ctx.scale(1, 1.5 + 0.7 * Math.sin(l.t * 20 + l.ph + s)) // 맥동 신장 — 빠르고 깊게 핥아 올리는 박동
          const r2 = seg * roil
          // 단마다 백열 심지를 품는다: 백색 심지 → 노랑 → 주황 → 적색 치마(불꽃 단면).
          const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r2)
          grad.addColorStop(0, rgba(pal.arcCore, 0.95 * sa))
          grad.addColorStop(0.35, rgba(pal.cool[0], 0.75 * sa))
          grad.addColorStop(0.7, rgba(pal.cool[1], 0.45 * sa))
          grad.addColorStop(1, rgba(pal.cool[2], 0))
          ctx.fillStyle = grad
          ctx.beginPath()
          ctx.arc(0, 0, r2, 0, TAU)
          ctx.fill()
          // 후광 — 단마다 글로우를 덧댄다(스케일 변환을 따라 늘어나 혀 모양 그대로 빛이 번진다).
          if (S.lickGlow > 0) {
            const gr = r2 * 1.9
            ctx.globalAlpha = sa * S.lickGlow
            ctx.drawImage(getGlowSprite(), -gr, -gr, gr * 2, gr * 2)
          }
          ctx.restore()
        }
        if (w !== r) {
          const tmp = this.licks[w]
          this.licks[w] = l
          this.licks[r] = tmp
        }
        w++
      }
      this.lickCount = w
    }

    ctx.globalCompositeOperation = 'source-over'

    ctx.lineCap = 'round'
    const cap = S.lenCap * S.scale * this.k
    const coreW = S.thick * this.k

    // 물리 전진 + 렌더값 산출 — 살아 있는 불티를 앞으로 swap 압축하고(죽은 것은 꼬리에 보존·재사용),
    // 렌더값(꼬리 끝·alpha·색)을 Spark 슬롯에 저장한다. 그린 패스를 두 번(글로우→코어) 돌려야 하는데,
    // 슬롯에 담아 두면 frame[]/alive[]/coolAt 의 매 프레임 새 배열 할당이 모두 사라진다(핫패스 GC 압박 제거).
    let w = 0
    for (let r = 0; r < this.sparkCount; r++) {
      const p = this.sparks[r]
      p.t += dt
      p.life = p.t / p.max
      if (p.life >= 1) continue
      // 유효 중력 — 잉걸불(buoy>0)은 수명 말기에 중력이 뒤집혀 떠오르며 사그라든다(뜨거운 공기 부력).
      p.vy += this.g * (p.buoy > 0 ? 1 - p.buoy * p.life * p.life : 1) * dt
      if (p.drag > 0) {
        // 공기 저항(지수 감쇠) — 폭발적으로 튀어나온 직후 급감속해 허공에 머문다. 실 길이가 속도에
        // 비례하므로 감속과 함께 줄무늬가 자연히 깜빡이는 점(잉걸불)으로 바뀐다.
        const f = Math.exp(-p.drag * dt)
        p.vx *= f
        p.vy *= f
      }
      if (p.flut > 0) {
        // 난류 요동 — 위상·주기를 불씨마다 달리한 저주파 좌우 가속(춤추는 표류). 드래그가 폭주를 막는다.
        p.vx += Math.sin(p.t * (3 + (p.ph % 3)) + p.ph) * p.flut * this.k * dt
      }
      p.x += p.vx * dt
      p.y += p.vy * dt
      const mag = Math.hypot(p.vx, p.vy) || 1
      const len =
        Math.min(cap, mag * S.lenFactor) * (1 - 0.3 * p.life) + 3 * this.k
      const ux = p.vx / mag
      const uy = p.vy / mag
      // 잉걸불은 더 깊게 자글거린다(타닥거림) — 빠른 불티는 기존 얕은 플리커 유지.
      const fmin = p.drag > 0 ? 0.35 : 0.62
      const flick = fmin + (1 - fmin) * Math.abs(Math.sin(p.life * 26 + p.ph))
      // 렌더값을 슬롯에 저장(두 패스가 읽는다). 수명 내내 선형으로 흐려짐(비행하며 식어 사그라듦) + 자글거림.
      p.rtx = p.x - ux * len
      p.rty = p.y - uy * len
      p.ra = flick * (1 - p.life)
      coolInto(pal.cool, p.life, p.rc)
      if (w !== r) {
        const tmp = this.sparks[w]
        this.sparks[w] = p
        this.sparks[r] = tmp
      }
      w++
    }
    this.sparkCount = w

    // 패스 1 — additive 후광 블룸: 미리 구운 글로우 스프라이트를 가산 합성으로 불티마다 blit 한다. 겹치는
    // 불티의 빛이 누적돼 발광체처럼 보인다. shadowBlur 와 달리 캐시 텍스처 복사라 임팩트 때 프레임을 안 떨군다.
    if (S.glow > 0) {
      const sprite = getGlowSprite()
      ctx.globalCompositeOperation = 'lighter'
      for (let i = 0; i < this.sparkCount; i++) {
        const p = this.sparks[i]
        const r = p.head * 2 + S.glow * this.k // 후광 반경(px) — 머리가 굵은 잉걸불일수록 크다
        ctx.globalAlpha = p.ra < 1 ? p.ra : 1
        ctx.drawImage(sprite, p.x - r, p.y - r, r * 2, r * 2)
      }
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
    }

    // 패스 2 — 또렷한 코어(글로우 위): 식어가는 화염색 줄무늬 한 겹.
    // (머리 백열 점·어두운 테두리는 제거됐다 — 어두운 테두리는 화염 속에서 재 부스러기처럼 이물감을
    //  줘서 뺐고, 배경 대비는 굵어진 코어 + 패스 1 글로우 후광이 담당한다.)
    for (let i = 0; i < this.sparkCount; i++) {
      const p = this.sparks[i]
      ctx.strokeStyle = rgba(p.rc, p.ra)
      ctx.lineWidth = coreW
      ctx.beginPath()
      ctx.moveTo(p.rtx, p.rty)
      ctx.lineTo(p.x, p.y)
      ctx.stroke()
    }
  }

  // 첫 타격의 일회성 비용(캔버스 버퍼 할당·팔레트 해석·글로우 스프라이트 굽기 + 풀 슬롯 확보)을 마운트로 옮겨
  // 첫 burst 가 프레임을 떨구지 않게 한다. 풀 사전 확보(spark()/lick() 가 슬롯 생성)는 rect 무관, backing
  // store·글로우는 레이아웃이 잡힌 뒤에만(rect 0 이면 건너뛰고 첫 burst 에서 잡는다 — 무해).
  warmup(sparkReserve = 0, lickReserve = 0) {
    for (let i = 0; i < sparkReserve; i++) this.spark(i)
    for (let i = 0; i < lickReserve; i++) this.lick(i)
    const rect = this.canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    this.syncBackingStore(rect)
    getGlowSprite()
  }

  dispose() {
    this.running = false
    if (this.raf) cancelAnimationFrame(this.raf)
    this.sparks = []
    this.sparkCount = 0
    this.licks = []
    this.lickCount = 0
  }
}
