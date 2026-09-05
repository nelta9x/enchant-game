// 스프라이트 이미지 스토어(DOM·GPU 경계) — 게임 시작 시 스프라이트(검·아이템)를 한 번 디코드+업로드해
// GPU 상주 ImageBitmap 으로 풀링하고, get() 으로 캐시본을 돌려준다. 교체(강화·인벤토리 갱신)마다 새로
// 로드/디코드/업로드 하던 비용을 시작 시점으로 옮기고, 표시(canvas)는 GPU 블릿만 하게 한다.
//
//  - 왜 ImageBitmap 인가: createImageBitmap 은 디코드+GPU 업로드를 끝낸 불변 비트맵을 만든다(오프메인).
//    이후 canvas drawImage(bitmap) 은 재디코드·재업로드 없는 블릿이라, 모바일 WebKit 의 교체 프레임
//    텍스처 업로드/레이어 churn 비용이 사라진다. HTMLImageElement 와 달리 오프스크린 디코드 증발도 없다.
//  - 키는 스프라이트 URL 이다(검·아이템 무관) — 호출 측이 swordSpriteUrl/itemSpriteUrl 로 해석해 넘긴다.
//  - get() 은 never null: 미로드/없는 경로면 default.png 폴백을 돌려준다(소비측은 분기 없이 항상 그린다).
//    default.png 로드 전/실패 대비 동기 1x1 투명 캔버스를 최종 폴백으로 둔다(get 이 throw 하지 않게).
//  - createImageBitmap 미지원(구형 WebKit)이면 디코드한 HTMLImageElement 를 그대로 캐시한다 — drawImage 가
//    받으므로 표시는 되고(재페치·재디코드는 캐시로 회피) GPU 상주 이점만 없다(현행보다 나쁘지 않다).
//  - DOM(Image/createImageBitmap/canvas)을 만지므로 순수 sprites.ts(URL 변환, vitest node 안전)와 분리한다.
//  - 데이터 레이어 비의존: loadAll 은 URL 목록을 받는다(DataManager 는 main 이 넘긴다).

import { defaultSpriteUrl } from './sprites'

// 캔버스에 그릴 수 있는 스프라이트 소스. ImageBitmap(상시 경로) · HTMLImageElement(createImageBitmap 미지원
// 폴백) · HTMLCanvasElement(동기 투명 폴백)만 쓴다 — CanvasImageSource 보다 좁혀 width/height 접근을 보장한다.
export type DrawableSprite = ImageBitmap | HTMLImageElement | HTMLCanvasElement

const supportsImageBitmap = typeof createImageBitmap === 'function'

// 개발 중에만 콘솔 경고(운영 빌드에선 침묵) — sound.ts 의 devWarn 과 같은 관례. 스프라이트 로드 실패는
// get() 의 default.png 폴백으로 흡수돼 게임은 멈추지 않지만, 디자이너 오타·자산 누락을 조용히 삼키지 않게 알린다.
function devWarn(message: string): void {
  if (import.meta.env.DEV) console.warn(`[spriteStore] ${message}`)
}

// url 을 그릴 수 있는 소스로 디코드한다. 지원하면 GPU 상주 ImageBitmap, 아니면 디코드한 <img>.
// 실패(없는 파일·손상·디코드 거부)면 null — 호출 측이 폴백을 유지한다.
async function decodeDrawable(url: string): Promise<DrawableSprite | null> {
  const img = new Image()
  img.src = url
  try {
    await img.decode()
  } catch {
    return null
  }
  if (!supportsImageBitmap) return img
  try {
    return await createImageBitmap(img)
  } catch {
    return img // createImageBitmap 만 실패하면 디코드된 <img> 로 폴백(표시는 됨)
  }
}

class SpriteStore {
  private cache = new Map<string, DrawableSprite>() // 스프라이트 URL → 그릴 수 있는 소스
  private fallback: DrawableSprite // default.png(로드 후) 또는 1x1 투명(로드 전/실패)
  // 같은 URL 의 동시 load 를 합쳐 중복 디코드를 막는다(loadAll 백그라운드 + 표시 재그리기 요청이 겹쳐도 1회).
  private inflight = new Map<string, Promise<void>>()

  constructor() {
    // 동기 최종 폴백 — default.png 로드 전 첫 get() 도 throw 없이 그릴 게 있도록.
    const blank = document.createElement('canvas')
    blank.width = blank.height = 1
    this.fallback = blank
  }

  // 폴백(default.png)을 적재한다 — 시작 시 await 해 두면 get() 이 항상 의미 있는 폴백을 돌려준다.
  // 실패 시 동기 투명 폴백을 유지한다(throw 안 함).
  async loadDefault(): Promise<void> {
    const drawable = await decodeDrawable(defaultSpriteUrl())
    if (drawable) this.fallback = drawable
    // 실패 시 동기 1x1 투명 폴백 유지(throw 안 함) — 다만 default.png 누락/손상은 디자이너가 봐야 하니 알린다.
    else devWarn('failed to load default sprite (sprites/default.png)')
  }

  // 스프라이트가 풀에 적재됐는지 — 소비측(SpriteCanvas·SwordStage)이 첫 페인트에 폴백을 그렸는지 판별해
  // 로드 후 재그리기를 건다.
  has(url: string): boolean {
    return this.cache.has(url)
  }

  // 스프라이트 1장 적재(시작검 await·표시 재그리기·on-demand 용). 캐시되면 즉시 resolve, 적재 중이면 같은
  // 약속을 공유한다(중복 디코드 방지). 실패 시 캐시 미저장 → 다음 load 가 재시도하고 get() 은 그때까지 폴백.
  load(url: string): Promise<void> {
    if (this.cache.has(url)) return Promise.resolve()
    const existing = this.inflight.get(url)
    if (existing) return existing
    const p = (async () => {
      const drawable = await decodeDrawable(url)
      if (drawable) this.cache.set(url, drawable)
      // 누락/오타 스프라이트를 조용히 삼키지 않게 알린다(실패 시 캐시 미저장 → get() 은 default.png 폴백).
      else devWarn(`failed to load sprite "${url}"`)
      this.inflight.delete(url)
    })()
    this.inflight.set(url, p)
    return p
  }

  // URL 목록을 순차 적재한다(시작 후 백그라운드 발사 — 보통 await 하지 않는다). 데이터 레이어 비의존을
  // 위해 URL 목록을 받는다(main 이 DataManager 에서 뽑아 swordSpriteUrl/itemSpriteUrl 로 해석해 넘긴다).
  async loadAll(urls: readonly string[]): Promise<void> {
    for (const url of urls) await this.load(url)
  }

  // 그릴 소스를 돌려준다(never null) — 캐시본, 없으면 default.png 폴백. canvas 소비측이 drawImage 한다.
  get(url: string): DrawableSprite {
    return this.cache.get(url) ?? this.fallback
  }
}

// 앱 전역 단일 스토어(DataManager 와 같은 싱글턴 관례).
export const spriteStore = new SpriteStore()

// 캔버스 CSS 크기(px) — ResizeObserver 가 준 값을 그대로 쓴다(레이아웃 강제 읽기 없음).
export type CanvasCssSize = { width: number; height: number }

// 캔버스에 스프라이트를 object-contain 으로 그린다(순수 블릿). backing store 는 표시 크기×DPR(crisp), 보간은
// nearest(픽셀아트 — <img> 의 imageRendering:pixelated 와 동일), 미로드/없는 경로면 get 의 default.png 폴백
// (never null). 그릴 게 없으면(컨텍스트 없음·0 크기·소스 0 크기) 조용히 반환한다.
// 표시 크기는 호출자가 준다 — 여기서 offsetWidth 를 읽지 않는다. 한 커밋에서 여러 캔버스가 "크기 읽기 →
// backing store 쓰기"를 번갈아 하면 강제 동기 레이아웃이 캔버스 수만큼 반복되던(탭 태스크의 1/3) 스래시를
// 구조적으로 막기 위해, 크기 측정은 SpriteCanvasBinding 의 ResizeObserver 한 곳이 소유한다.
export function drawSpriteContain(
  canvas: HTMLCanvasElement,
  url: string,
  size: CanvasCssSize,
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = Math.min(3, window.devicePixelRatio || 1)
  const bw = Math.round(size.width * dpr)
  const bh = Math.round(size.height * dpr)
  if (bw <= 0 || bh <= 0) return
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw
    canvas.height = bh
  }
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, bw, bh)
  const src = spriteStore.get(url)
  const sw = src instanceof HTMLImageElement ? src.naturalWidth : src.width
  const sh = src instanceof HTMLImageElement ? src.naturalHeight : src.height
  if (!sw || !sh) return
  const scale = Math.min(bw / sw, bh / sh)
  const dw = sw * scale
  const dh = sh * scale
  ctx.drawImage(src, (bw - dw) / 2, (bh - dh) / 2, dw, dh)
}

// 캔버스 1장과 스프라이트 URL 을 묶는 바인딩(React 무관 DOM 헬퍼) — 검 본체(SwordStage)·잔상(ShakeAfterimage)·
// 아이템 아이콘(SpriteCanvas)이 공유한다. 책임:
//  · 크기: ResizeObserver 가 준 contentRect 를 캐시해 그린다. 마운트 프레임엔 RO 초기 콜백(레이아웃 뒤·페인트 전)
//    이 첫 그림을 그리고, 이후 URL 교체는 캐시된 크기로 즉시 그린다 — 어느 경로도 offsetWidth 를 읽지 않아
//    강제 레이아웃이 없다(리사이즈·rem 스케일 변화는 RO 가 다시 그린다).
//  · 자가 치유: 스프라이트가 아직 풀에 없으면 폴백을 그리고 적재 즉시 한 번 더 그린다(그 사이 URL 이 또 바뀌지
//    않았을 때만). load 는 적재 완료/캐시 히트에 resolve 하고 동시 호출을 합친다(중복 디코드 없음).
//  · 중복 없음: 같은 URL·같은 크기로 이미 "실물"을 그렸으면 다시 그리지 않는다(이전 구현은 URL 교체마다 effect
//    1회 + RO 초기 콜백 1회 = 2회). 폴백을 그린 뒤의 적재 완료 재그리기는 중복이 아니다(drawnReal).
// ResizeObserver 가 없는 환경(테스트 등)은 offsetWidth 1회 읽기로 폴백한다.
export class SpriteCanvasBinding {
  private readonly canvas: HTMLCanvasElement
  private readonly ro: ResizeObserver | null
  private size: CanvasCssSize | null = null
  private url: string | null = null
  private drawnUrl: string | null = null
  private drawnSize: CanvasCssSize | null = null
  // 마지막 그림이 "실물"이었는지(적재된 스프라이트) — 폴백(default.png)을 그린 상태면 false. 중복 방지의 조건:
  // 폴백을 그렸다면 적재 완료 후 반드시 한 번 더 그려야 한다(이 플래그 없이 has(url) 만 보면, RO 가 디코드보다
  // 먼저 끝난 경우 적재 후 재그리기가 "같은 URL·같은 크기·적재됨"으로 오판돼 폴백이 영구히 남는다).
  private drawnReal = false
  private disposed = false

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    if (typeof ResizeObserver === 'undefined') {
      this.ro = null
      this.size = { width: canvas.offsetWidth, height: canvas.offsetHeight }
      return
    }
    this.ro = new ResizeObserver((entries) => {
      const rect = entries[entries.length - 1]?.contentRect
      if (!rect) return
      this.size = { width: rect.width, height: rect.height }
      this.draw()
    })
    this.ro.observe(canvas)
  }

  // 그릴 스프라이트를 정한다(같은 URL 이면 무변화). 크기를 이미 알면 즉시 그리고, 아니면 RO 초기 콜백이 그린다.
  setSprite(url: string): void {
    if (this.disposed || this.url === url) return
    this.url = url
    this.draw()
    if (!spriteStore.has(url)) {
      void spriteStore.load(url).then(() => {
        if (!this.disposed && this.url === url) this.draw()
      })
    }
  }

  private draw(): void {
    const { url, size } = this
    if (url === null || size === null) return
    if (
      this.drawnUrl === url &&
      this.drawnReal &&
      this.drawnSize !== null &&
      this.drawnSize.width === size.width &&
      this.drawnSize.height === size.height
    ) {
      return // 같은 스프라이트·같은 크기·이미 실물로 그림 — 중복 블릿 없음
    }
    // has() 는 drawSpriteContain 이 get() 으로 실물/폴백 중 무엇을 그릴지와 같은 시점의 판정이다.
    const real = spriteStore.has(url)
    drawSpriteContain(this.canvas, url, size)
    this.drawnUrl = url
    this.drawnSize = size
    this.drawnReal = real
  }

  dispose(): void {
    this.disposed = true
    this.ro?.disconnect()
  }
}
