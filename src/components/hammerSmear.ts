// 망치 스윙 모션 블러 스미어의 캔버스 렌더러(프레젠테이션 전용) — 순수 코어(hammerTrail.TrailHistory)가
// 계산한 자국(포즈+알파)들을 매 프레임 흰 망치 실루엣으로 다시 찍는다. HammerStrike 가 본체 motion.img
// 의 onUpdate 포즈를 push 로 흘려 주고, 빠른 스냅에서만 자국이 쌓여(속도 게이트) rAF 루프가 돈다 —
// 자국이 수명을 다하면 루프가 멈추고 캔버스를 비운다(평소 0 비용, HitSparkSystem 과 같은 수명 규약).
//
// 합성 핵심: 최신 자국부터 역순으로 destination-over 로 찍는다 — 이미 칠해진(더 최신) 픽셀 밑으로만
// 깔리므로, 겹치는 픽셀엔 항상 "가장 최신 자국의 알파"만 남아 겹침 누적으로 타는 핫스팟 없이 머리→꼬리
// 그라데이션이 깨끗하게 나온다(빈 캔버스에선 source-over 와 동일하게 동작).
//
// 실루엣은 스프라이트를 오프스크린에 1회 구워(불투명 픽셀을 토큰 색으로 치환) drawImage 로 복사한다.
// 색은 @theme 토큰(--color-hammer-trail)을 런타임 1회 해석(hitSparks 의 팔레트 캐시와 같은 규약 —
// 런타임 테마 전환 도입 시 무효화 필요).

import { TrailHistory, type TrailPose } from './hammerTrail'

const DEG2RAD = Math.PI / 180

let trailColor: string | null = null
function resolveTrailColor(): string {
  if (trailColor) return trailColor
  trailColor = getComputedStyle(document.documentElement)
    .getPropertyValue('--color-hammer-trail')
    .trim()
  return trailColor
}

export class HammerSmearSystem {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private spriteUrl: string
  private history = new TrailHistory()
  private silhouette: HTMLCanvasElement | null = null // 흰 실루엣(1회 구움) — 로드 전엔 자국을 안 그린다
  private spriteSize = 0 // 본체 img 의 렌더 한 변(px, 정사각 박스) — begin 이 측정값을 받는다
  private w = 0 // 캔버스 CSS 크기 — begin/warmup 에서 동기화
  private h = 0
  private bw = 0 // backing store 픽셀 크기(리사이즈 감지)
  private bh = 0
  private dpr = 1
  private running = false
  private raf = 0

  constructor(canvas: HTMLCanvasElement, spriteUrl: string) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('HammerSmearSystem: 2d context unavailable')
    this.ctx = ctx
    this.spriteUrl = spriteUrl
  }

  // 첫 강화의 일회성 비용(실루엣 굽기·버퍼 할당·토큰 해석)을 마운트로 옮긴다. 레이아웃 전(rect 0)이면
  // 버퍼는 건너뛰고 첫 begin 에서 잡는다(무해).
  warmup() {
    if (!this.silhouette) {
      const img = new Image()
      img.onload = () => {
        const off = document.createElement('canvas')
        off.width = img.naturalWidth
        off.height = img.naturalHeight
        const g = off.getContext('2d')
        if (!g) return
        g.drawImage(img, 0, 0)
        // 불투명 픽셀만 토큰 색으로 치환 — DOM 시절의 filter: brightness(0) invert(1) 을 대체한다.
        g.globalCompositeOperation = 'source-in'
        g.fillStyle = resolveTrailColor()
        g.fillRect(0, 0, off.width, off.height)
        this.silhouette = off
      }
      img.src = this.spriteUrl
    }
    this.syncSize()
  }

  // 새 강화 1회의 시작 — 자국·캔버스를 즉시 비워(연사 하드 컷: 스미어는 항상 1세트) 펜을 새로 찍게 한다.
  // spriteSizePx 는 본체 img 의 실측 렌더 크기(rem 반응 스케일 반영) — 자국 스탬프가 본체와 같은 크기.
  begin(spriteSizePx: number) {
    this.history.reset()
    this.spriteSize = spriteSizePx
    this.syncSize()
    this.clear()
  }

  // 본체의 프레임 포즈를 펜에 흘린다(매 프레임, motion onUpdate). 빠른 구간에서 자국이 생기면(살아남)
  // rAF 루프를 깨운다 — 느린 윈드업·정지에선 자국이 없어 루프도 안 돈다.
  push(pose: TrailPose) {
    const now = performance.now()
    this.history.push(now, pose)
    if (!this.running && this.history.isAlive(now)) {
      this.running = true
      this.raf = requestAnimationFrame(this.loop)
    }
  }

  private loop = (ts: number) => {
    if (!this.running) return
    this.draw(ts)
    if (!this.history.isAlive(ts)) {
      // 마지막 draw 가 이미 빈 캔버스를 남겼다(매 프레임 clear 후 자국만 찍으므로).
      this.running = false
      return
    }
    this.raf = requestAnimationFrame(this.loop)
  }

  private draw(nowMs: number) {
    this.clear()
    const sil = this.silhouette
    if (!sil || this.w <= 0 || this.spriteSize <= 0) return
    const stamps = this.history.stamps(nowMs)
    if (stamps.length === 0) return
    // 본체 img(object-contain·정사각 박스)와 같은 맞춤 — 비율 유지로 박스 안에 들어가는 크기.
    const fit = Math.min(
      this.spriteSize / sil.width,
      this.spriteSize / sil.height,
    )
    const dw = sil.width * fit
    const dh = sil.height * fit
    const ctx = this.ctx
    ctx.imageSmoothingEnabled = false // 본체의 imageRendering: pixelated 와 같은 결
    ctx.globalCompositeOperation = 'destination-over'
    // 최신(머리)부터 역순으로 — 겹친 픽셀엔 최신 자국의 알파만 남는다(파일 머리 주석 참고).
    for (let i = stamps.length - 1; i >= 0; i--) {
      const s = stamps[i]
      ctx.globalAlpha = s.alpha
      // 좌표 관례: 캔버스 중심 = 검 박스 중심(0,0), 포즈 x/y 는 그 중심 기준 px — 본체 transform 과 동일.
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
      ctx.translate(this.w / 2 + s.pose.x, this.h / 2 + s.pose.y)
      ctx.rotate(s.pose.rotate * DEG2RAD)
      ctx.scale(s.pose.scale, s.pose.scale)
      ctx.drawImage(sil, -dw / 2, -dh / 2, dw, dh)
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }

  private clear() {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0)
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
  }

  // dpr 기준 backing store 픽셀 크기를 맞춘다(크기 변화 시에만 재설정 — HitSparkSystem 과 동일 관례).
  private syncSize() {
    const rect = this.canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    this.dpr = Math.min(2, window.devicePixelRatio || 1)
    const bw = Math.round(rect.width * this.dpr)
    const bh = Math.round(rect.height * this.dpr)
    if (bw !== this.bw || bh !== this.bh) {
      this.canvas.width = bw
      this.canvas.height = bh
      this.bw = bw
      this.bh = bh
    }
    this.w = rect.width
    this.h = rect.height
  }

  dispose() {
    this.running = false
    if (this.raf) cancelAnimationFrame(this.raf)
    this.history.reset()
  }
}
