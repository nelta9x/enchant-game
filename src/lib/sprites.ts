// 스프라이트 파일명 → 실제 로드 가능한 URL 변환(뷰/런타임 경계).
//
// 검 스프라이트는 public/sprites/swords/ 에 정적 자산으로 둔다.
// 데이터 레이어(SwordData.sprite)는 파일명만 들고 있고, 디렉토리 경로와
// 배포 베이스 경로(import.meta.env.BASE_URL)는 여기서 해석한다.
// → 데이터/로직은 환경 비의존(테스트 용이)으로 유지하고, URL 조립만 뷰 경계에서 처리.

const SWORD_SPRITE_DIR = 'sprites/swords/'
// 아이템 스프라이트(코인 등 비-검 자산)는 public/sprites/items/ 에 둔다.
const ITEM_SPRITE_DIR = 'sprites/items/'
// UI 전용 스프라이트(상점 카드 아이콘 등 아이템이 아닌 픽셀아트)는 public/sprites/ui/ 에 둔다.
const UI_SPRITE_DIR = 'sprites/ui/'
// 폴백(없는/미로드 스프라이트) 기본 이미지는 public/sprites/ 루트에 둔다.
const DEFAULT_SPRITE = 'sprites/default.png'

// BASE_URL 은 항상 '/'로 끝난다(Vite 규약). GitHub Pages 등 하위 경로 배포에서도 동작.
export function swordSpriteUrl(filename: string): string {
  return `${import.meta.env.BASE_URL}${SWORD_SPRITE_DIR}${filename}`
}

// 아이템 스프라이트(예: 'gold_coin.png') URL. 검과 동일하게 BASE_URL 을 여기서 해석한다.
export function itemSpriteUrl(filename: string): string {
  return `${import.meta.env.BASE_URL}${ITEM_SPRITE_DIR}${filename}`
}

// UI 스프라이트 목록(이름 → 파일명). 여기 등록된 파일은 public/sprites/ui/ 에 실제로 있어야 한다
// (sprites.test 가 존재를 검증 — 파일명 오타·누락으로 깨진 아이콘이 배포되지 않게).
export const UI_SPRITES = {
  shop: 'shop.png', // 상점 카드(CommissionBar ShopCard) 아이콘
} as const
export type UiSpriteName = keyof typeof UI_SPRITES

// UI 스프라이트 상대 경로(public 기준) — 테스트의 파일 존재 검증과 URL 조립이 같은 경로를 쓴다.
export function uiSpritePath(name: UiSpriteName): string {
  return `${UI_SPRITE_DIR}${UI_SPRITES[name]}`
}

// UI 스프라이트 URL. 아이템·검과 같은 SpriteCanvas 경로로 그리되 카탈로그와는 무관한 장식 자산.
export function uiSpriteUrl(name: UiSpriteName): string {
  return `${import.meta.env.BASE_URL}${uiSpritePath(name)}`
}

// 폴백 기본 스프라이트(default.png) URL. SpriteStore 가 없는/미로드 스프라이트 자리에 그린다.
export function defaultSpriteUrl(): string {
  return `${import.meta.env.BASE_URL}${DEFAULT_SPRITE}`
}
