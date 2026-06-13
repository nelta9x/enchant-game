// 검 스프라이트 이미지 스토어(DOM·GPU 경계) — 게임 시작 시 모든 검 스프라이트를 한 번 디코드+업로드해
// GPU 상주 ImageBitmap 으로 풀링하고, get() 으로 캐시본을 돌려준다. 교체(강화)마다 새로 로드/디코드/업로드
// 하던 비용을 시작 시점으로 옮기고, 표시(SwordStage canvas)는 GPU 블릿만 하게 한다.
//
//  - 왜 ImageBitmap 인가: createImageBitmap 은 디코드+GPU 업로드를 끝낸 불변 비트맵을 만든다(오프메인).
//    이후 canvas drawImage(bitmap) 은 재디코드·재업로드 없는 블릿이라, 모바일 WebKit 의 교체 프레임
//    텍스처 업로드/레이어 churn 비용이 사라진다. HTMLImageElement 와 달리 오프스크린 디코드 증발도 없다.
//  - get() 은 never null: 미로드/없는 경로면 default.png 폴백을 돌려준다(소비측은 분기 없이 항상 그린다).
//    default.png 로드 전/실패 대비 동기 1x1 투명 캔버스를 최종 폴백으로 둔다(get 이 throw 하지 않게).
//  - createImageBitmap 미지원(구형 WebKit)이면 디코드한 HTMLImageElement 를 그대로 캐시한다 — drawImage 가
//    받으므로 표시는 되고(재페치·재디코드는 캐시로 회피) GPU 상주 이점만 없다(현행보다 나쁘지 않다).
//  - DOM(Image/createImageBitmap/canvas)을 만지므로 순수 sprites.ts(URL 변환, vitest node 안전)와 분리한다.
//  - 데이터 레이어 비의존: loadAll 은 스프라이트 파일명 목록을 받는다(DataManager 는 main 이 넘긴다).

import { defaultSpriteUrl, swordSpriteUrl } from './sprites'

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
  private cache = new Map<string, DrawableSprite>() // 검 sprite 파일명 → 그릴 수 있는 소스
  private fallback: DrawableSprite // default.png(로드 후) 또는 1x1 투명(로드 전/실패)

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

  // 검 스프라이트 1장 적재(시작검 await 용). 이미 있으면 no-op(URL 키 중복 방지).
  async load(sprite: string): Promise<void> {
    if (this.cache.has(sprite)) return
    const drawable = await decodeDrawable(swordSpriteUrl(sprite))
    if (drawable) this.cache.set(sprite, drawable)
    // 실패 시 캐시 미저장 → 이후 get() 은 default.png 폴백. 누락/오타 스프라이트를 조용히 삼키지 않게 알린다.
    else devWarn(`failed to load sprite "${sprite}"`)
  }

  // 모든 검 스프라이트를 순차 적재한다(시작 후 백그라운드 발사 — 보통 await 하지 않는다). 데이터 레이어
  // 비의존을 위해 파일명 목록을 받는다(main 이 DataManager 에서 뽑아 넘긴다).
  async loadAll(sprites: readonly string[]): Promise<void> {
    for (const sprite of sprites) await this.load(sprite)
  }

  // 그릴 소스를 돌려준다(never null) — 캐시본, 없으면 default.png 폴백. SwordStage canvas 가 drawImage 한다.
  get(sprite: string): DrawableSprite {
    return this.cache.get(sprite) ?? this.fallback
  }
}

// 앱 전역 단일 스토어(DataManager 와 같은 싱글턴 관례).
export const spriteStore = new SpriteStore()

// ⚠️ 모바일 진단용 임시 플래그 — "강화 시 검 스프라이트(비트맵 소스) 교체"가 모바일(iOS WebKit) 프레임 저하의
// 원인인지 격리하기 위한 것. true 면 drawSpriteContain 이 "처음 그린 스프라이트"로 고정해, 강화해도 검 본체
// (SwordStage)와 잔상(ShakeBurstEffect)이 같은 ImageBitmap 만 블릿한다(= 교체 비용 0). 이름·레벨 뱃지·스탯·
// 파티클·떨림 연출은 정상이다. 진단이 끝나면 false 로 되돌리거나 이 블록과 drawSpriteContain 의 가드를 지울 것.
const FREEZE_SWORD_SPRITE = true
let frozenSprite: string | null = null

// 캔버스에 스프라이트를 object-contain 으로 그린다(뷰 경계 헬퍼) — SwordStage(검 본체)와 ShakeBurstEffect(잔상)가
// 같은 블릿을 공유한다(구현 분기 방지). backing store 는 표시 크기×DPR(crisp), 보간은 nearest(픽셀아트 —
// <img> 의 imageRendering:pixelated 와 동일), 미로드/없는 경로면 get 의 default.png 폴백(never null). 그릴 게
// 없으면(컨텍스트 없음·0 크기·소스 0 크기) 조용히 반환한다.
export function drawSpriteContain(
  canvas: HTMLCanvasElement,
  sprite: string,
): void {
  // ⚠️ 진단(FREEZE_SWORD_SPRITE) — 처음 그린 스프라이트로 고정해 강화 교체를 없앤다(정의부 주석 참고).
  if (FREEZE_SWORD_SPRITE) {
    if (frozenSprite === null) frozenSprite = sprite
    sprite = frozenSprite ?? sprite
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = Math.min(3, window.devicePixelRatio || 1)
  const rect = canvas.getBoundingClientRect()
  const bw = Math.round(rect.width * dpr)
  const bh = Math.round(rect.height * dpr)
  if (bw <= 0 || bh <= 0) return
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw
    canvas.height = bh
  }
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, bw, bh)
  const src = spriteStore.get(sprite)
  // 고유(원본) 크기 — HTMLImageElement 는 naturalWidth, ImageBitmap·canvas 는 width.
  const sw = src instanceof HTMLImageElement ? src.naturalWidth : src.width
  const sh = src instanceof HTMLImageElement ? src.naturalHeight : src.height
  if (!sw || !sh) return
  const scale = Math.min(bw / sw, bh / sh)
  const dw = sw * scale
  const dh = sh * scale
  ctx.drawImage(src, (bw - dw) / 2, (bh - dh) / 2, dw, dh)
}
