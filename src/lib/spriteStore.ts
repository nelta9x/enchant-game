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
