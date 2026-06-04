import { dataManager } from '../data/DataManager'
import { PROTECTION_TICKET_ID } from '../game/enhancer'
import type { TranslationKey } from '../i18n'
import type { ItemStack } from '../game/types'

// 방지권 itemId 의 정식 출처는 엔진(enhancer)이다. 엔진은 DataManager 비의존이라
// 상수를 거기 두고, 뷰·아이템 어휘 계층은 엔진을 직접 import 하지 않고 이 허브를
// 통해 같은 상수를 참조한다(재노출).
export { PROTECTION_TICKET_ID }

// 검이 아닌 아이템(방지권 · 잡템) → 표시명 i18n 키 매핑.
// 동적 문자열로 t()를 호출하면 TranslationKey 타입을 벗어나므로, 알려진 itemId만
// 리터럴 키로 매핑해 타입 안전하게 해석한다. (검 재료는 SwordData.nameKey로 해석)
const ITEM_NAME_KEYS: Record<string, TranslationKey> = {
  [PROTECTION_TICKET_ID]: 'item.protection_ticket',
  iron_scrap: 'item.iron_scrap',
  faded_fluorescent: 'item.faded_fluorescent',
  flame_sword_handle: 'item.flame_sword_handle',
}

// 검이 아닌 아이템(방지권·잡템) → 전용 스프라이트 파일명(public/sprites/items/) 매핑.
// 전용 PNG 가 있는 아이템만 등록한다 — 미등록 아이템은 ItemIcon 이 토큰 아이콘(방패/보석)으로 폴백한다.
// (검 스프라이트는 SwordData.sprite, 골드 코인은 Coin 컴포넌트가 직접 참조)
const ITEM_SPRITES: Record<string, string> = {
  [PROTECTION_TICKET_ID]: 'protection_ticket.png',
  iron_scrap: 'iron_scrap.png',
  faded_fluorescent: 'faded_fluorescent.png',
  flame_sword_handle: 'flame_sword_handle.png',
}

// itemId → 전용 스프라이트 파일명(없으면 undefined). URL 조립은 호출 측(ItemIcon)이 itemSpriteUrl 로 한다.
export function itemSpriteName(itemId: string): string | undefined {
  return ITEM_SPRITES[itemId]
}

// 인벤토리에서 특정 itemId 보유 수량 조회(없으면 0).
export function countOf(items: readonly ItemStack[], itemId: string): number {
  return items.find((i) => i.itemId === itemId)?.count ?? 0
}

// itemId → 표시명. 검(getSwordById로 해석)은 DataManager의 검 이름으로,
// 그 외(방지권·잡템)는 item.<id> 키로 해석한다. 미지의 id는 원문 그대로(방어).
export function itemDisplayName(
  itemId: string,
  t: (key: TranslationKey) => string,
): string {
  const sword = dataManager.getSwordById(itemId)
  if (sword) return t(sword.nameKey)
  const key = ITEM_NAME_KEYS[itemId]
  return key ? t(key) : itemId
}

// itemId가 표시명으로 해석 가능한지 — 존재하는 검 id(getSwordById)이거나
// 알려진 아이템 키(ITEM_NAME_KEYS)면 true. false면 itemDisplayName이 원문 itemId를
// 그대로 반환(미번역)한다. itemDisplayName과 동일한 해석 경로를 따르며,
// 상점 등 카탈로그 itemId의 데이터↔i18n 무결성 검증(시드 테스트)에 사용한다.
export function isDisplayableItemId(itemId: string): boolean {
  if (dataManager.getSwordById(itemId) !== undefined) return true
  return itemId in ITEM_NAME_KEYS
}
