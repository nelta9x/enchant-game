import { dataManager } from '../data/DataManager'
import { PROTECTION_TICKET_ID } from '../game/enhancer'
import type { TranslationKey } from '../i18n'

// 파괴보호장치 itemId 의 정식 출처는 엔진(enhancer)이다. 엔진은 DataManager 비의존이라
// 상수를 거기 두고, 뷰·아이템 어휘 계층은 엔진을 직접 import 하지 않고 이 허브를
// 통해 같은 상수를 참조한다(재노출).
export { PROTECTION_TICKET_ID }

// 보유 수량 조회(countOf)의 정식 출처는 게임 도메인(game/inventory — 엔진과 공유)이다.
// PROTECTION_TICKET_ID 와 같은 이유로 이 허브를 통해 재노출한다.
export { countOf } from '../game/inventory'

// 파괴보호장치 표시명 키 — carve-out. 거래 제안 보상으로만 얻는 특수 소비재라 basePrice 가 의미 없어
// 카탈로그(items.json)에 넣지 않는다(출제 집합 등록은 DataManager 가 명시적으로 처리). 재료(철조각 등)는 카탈로그에 있다.
// 동적 문자열로 t()를 호출하면 TranslationKey 타입을 벗어나므로 알려진 itemId만 리터럴 키로 매핑한다.
const ITEM_NAME_KEYS: Record<string, TranslationKey> = {
  [PROTECTION_TICKET_ID]: 'item.protection_ticket',
}

// 파괴보호장치 전용 스프라이트 — carve-out(위와 동일 사유). 재료 스프라이트는 items.json(ItemData.sprite)에 있다.
const ITEM_SPRITES: Record<string, string> = {
  [PROTECTION_TICKET_ID]: 'protection_ticket.png',
}

// itemId → 전용 스프라이트 파일명(없으면 undefined). URL 조립은 호출 측(ItemIcon)이 itemSpriteUrl 로 한다.
// 검(SwordData.sprite)은 호출 측이 따로 처리하므로 여기선 카탈로그(items.json) → 잔존 맵(파괴보호장치) 순으로 본다.
export function itemSpriteName(itemId: string): string | undefined {
  return dataManager.getItemById(itemId)?.sprite ?? ITEM_SPRITES[itemId]
}

// itemId → 표시명. 검(getSwordById)은 검 이름으로, 재료(getItemById)는 카탈로그 nameKey로,
// 그 외(파괴보호장치)는 잔존 맵의 item.<id> 키로 해석한다. 미지의 id는 원문 그대로(방어).
export function itemDisplayName(
  itemId: string,
  t: (key: TranslationKey) => string,
): string {
  const sword = dataManager.getSwordById(itemId)
  if (sword) return t(sword.nameKey)
  const item = dataManager.getItemById(itemId)
  if (item) return t(item.nameKey)
  const key = ITEM_NAME_KEYS[itemId]
  return key ? t(key) : itemId
}

// itemId가 표시명으로 해석 가능한지 — 존재하는 검 id(getSwordById)이거나 카탈로그 아이템(getItemById)이거나
// 알려진 아이템 키(ITEM_NAME_KEYS)면 true. false면 itemDisplayName이 원문 itemId를 그대로 반환(미번역)한다.
// itemDisplayName과 동일한 해석 경로를 따르며, 상점·의뢰 등 카탈로그 itemId의 데이터↔i18n 무결성 검증에 쓴다.
export function isDisplayableItemId(itemId: string): boolean {
  if (dataManager.getSwordById(itemId) !== undefined) return true
  if (dataManager.getItemById(itemId) !== undefined) return true
  return itemId in ITEM_NAME_KEYS
}
