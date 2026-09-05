// 효과 캔버스 호스트(프레젠테이션 전용) — 성공/파괴 도트 버스트와 망치 임팩트 불꽃을 캔버스 "한 장·rAF 루프 하나"에
// 그린다. 이전엔 시스템마다 캔버스(30rem×26rem, DPR 2)와 rAF 루프를 따로 가져 clear·합성 레이어·프레임 콜백이
// 두 배였고, 각자 emit 마다 getBoundingClientRect 로 크기를 읽어(강제 레이아웃) backing store 를 맞췄다.
//
// 책임:
//  · 크기: ResizeObserver 가 준 CSS 크기를 캐시하고 backing store 를 EFFECT_CANVAS_DPR 배로 맞춘다 — 커밋 중 레이아웃
//    읽기 없음(SpriteCanvasBinding 과 같은 규약). 루트 font-size(rem px)도 그때 함께 읽어 rem 스케일 대응 계수로 준다.
//  · 루프: 살아 있는 레이어가 있을 때만 rAF 를 돌고(wake), 전부 끝나면 캔버스를 비우고 멈춘다(평소 0 비용).
//  · 좌표: 캔버스 중심 = 검 박스 중심(0,0). 레이어는 frame 의 cx/cy 를 원점으로 px 좌표를 쓴다.
//
// DPR 1 인 이유: 이 캔버스의 내용은 글로우 블롭·도트·링처럼 흐린 형태라 픽셀 정밀도가 필요 없다. 모바일(DPR 3)에서
// 실제 부담은 메인 스레드가 아니라 GPU 채움(fill) — backing store 를 CSS 크기 그대로 두면 DPR 2 대비 채움 픽셀이
// 1/4 이다. 검 스프라이트처럼 또렷해야 하는 것은 SpriteCanvasBinding(DPR 최대 3)이 따로 그린다.
export const EFFECT_CANVAS_DPR = 1

// 레이어가 한 프레임을 그릴 때 받는 문맥. cx/cy 는 캔버스 중심(검 박스 중심), remPx 는 루트 font-size(rem 스케일).
export type EffectFrame = {
  dt: number // 직전 프레임과의 간격(초, 0.05 상한 — 탭 전환·정지 뒤 폭주 방지)
  w: number
  h: number
  cx: number
  cy: number
  dpr: number
  remPx: number
}

export type EffectLayer = {
  // 그릴 것이 남았는가 — 전부 false 면 호스트가 루프를 멈춘다.
  isAlive(): boolean
  // 한 프레임 갱신+그리기. 컨텍스트 변환은 dpr 스케일이 걸린 상태로 들어오고, 바꿨다면 되돌려 둔다(setTransform).
  draw(ctx: CanvasRenderingContext2D, frame: EffectFrame): void
}

export class EffectCanvasHost {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly layers: EffectLayer[] = []
  private readonly ro: ResizeObserver | null
  private w = 0
  private h = 0
  private remPx = 16
  private running = false
  private prev = 0
  private raf = 0

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('EffectCanvasHost: 2d context unavailable')
    this.ctx = ctx
    if (typeof ResizeObserver === 'undefined') {
      this.ro = null
      this.resize(canvas.offsetWidth, canvas.offsetHeight)
      return
    }
    this.ro = new ResizeObserver((entries) => {
      const rect = entries[entries.length - 1]?.contentRect
      if (rect) this.resize(rect.width, rect.height)
    })
    this.ro.observe(canvas)
  }

  add(layer: EffectLayer): void {
    this.layers.push(layer)
  }

  // 현재 프레임 기하(레이어가 emit/burst 시 원점·스케일을 정할 때) — 크기를 아직 모르면 w=0.
  geometry(): Pick<EffectFrame, 'w' | 'h' | 'cx' | 'cy' | 'remPx'> {
    return { w: this.w, h: this.h, cx: this.w / 2, cy: this.h / 2, remPx: this.remPx }
  }

  // 레이어가 새 입자를 냈을 때 루프를 깨운다(이미 돌고 있으면 무변화).
  wake(): void {
    if (this.running) return
    this.running = true
    this.prev = 0
    this.raf = requestAnimationFrame(this.loop)
  }

  private resize(w: number, h: number): void {
    if (w <= 0 || h <= 0) return
    this.w = w
    this.h = h
    // rem 스케일(루트 font-size) — RO 콜백은 레이아웃 뒤라 강제 레이아웃 없이 읽힌다.
    this.remPx =
      parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
    const bw = Math.round(w * EFFECT_CANVAS_DPR)
    const bh = Math.round(h * EFFECT_CANVAS_DPR)
    if (this.canvas.width !== bw || this.canvas.height !== bh) {
      this.canvas.width = bw
      this.canvas.height = bh
    }
  }

  private loop = (ts: number) => {
    if (!this.running) return
    if (!this.prev) this.prev = ts
    const dt = Math.min(0.05, (ts - this.prev) / 1000)
    this.prev = ts
    const ctx = this.ctx
    const dpr = EFFECT_CANVAS_DPR
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, this.w, this.h)
    const frame: EffectFrame = {
      dt,
      w: this.w,
      h: this.h,
      cx: this.w / 2,
      cy: this.h / 2,
      dpr,
      remPx: this.remPx,
    }
    let alive = false
    for (const layer of this.layers) {
      if (!layer.isAlive()) continue
      layer.draw(ctx, frame)
      if (layer.isAlive()) alive = true
    }
    if (!alive) {
      // 마지막 프레임을 그린 뒤 빈 캔버스로 정착시키고 멈춘다.
      ctx.clearRect(0, 0, this.w, this.h)
      this.running = false
      return
    }
    this.raf = requestAnimationFrame(this.loop)
  }

  dispose(): void {
    this.running = false
    if (this.raf) cancelAnimationFrame(this.raf)
    this.ro?.disconnect()
    this.layers.length = 0
  }
}
