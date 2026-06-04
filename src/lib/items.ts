import { dataManager } from '../data/DataManager'
import type { TranslationKey } from '../i18n'
import type { ItemStack } from '../game/types'

// 검 재료 itemId 규약: `sword_<level>` (레벨이 곧 정체성, 로케일 독립).
const SWORD_ITEM_RE = /^sword_(\d+)$/

// 검이 아닌 아이템(방지권 · 잡템) → 표시명 i18n 키 매핑.
// 동적 문자열로 t()를 호출하면 TranslationKey 타입을 벗어나므로, 알려진 itemId만
// 리터럴 키로 매핑해 타입 안전하게 해석한다. (검 재료는 SwordData.nameKey로 해석)
const ITEM_NAME_KEYS: Record<string, TranslationKey> = {
  protection_ticket: 'item.protection_ticket',
  iron_scrap: 'item.iron_scrap',
  faded_fluorescent: 'item.faded_fluorescent',
  flame_sword_handle: 'item.flame_sword_handle',
  evil_soul: 'item.evil_soul',
}

// 인벤토리에서 특정 itemId 보유 수량 조회(없으면 0).
export function countOf(items: readonly ItemStack[], itemId: string): number {
  return items.find((i) => i.itemId === itemId)?.count ?? 0
}

// itemId → 표시명. 검 재료(sword_<level>)는 DataManager의 검 이름으로,
// 그 외(방지권·잡템)는 item.<id> 키로 해석한다. 미지의 id는 원문 그대로(방어).
export function itemDisplayName(
  itemId: string,
  t: (key: TranslationKey) => string,
): string {
  const m = SWORD_ITEM_RE.exec(itemId)
  if (m) {
    const sword = dataManager.getSwordByLevel(Number(m[1]))
    if (sword) return t(sword.nameKey)
  }
  const key = ITEM_NAME_KEYS[itemId]
  return key ? t(key) : itemId
}

// itemId가 검 재료면 해당 레벨을, 아니면 null. (인벤토리 행에서 '+레벨' 표시용)
export function swordItemLevel(itemId: string): number | null {
  const m = SWORD_ITEM_RE.exec(itemId)
  return m ? Number(m[1]) : null
}

// itemId가 표시명으로 해석 가능한지 — 존재하는 검 단계(sword_<level>)이거나
// 알려진 아이템 키(ITEM_NAME_KEYS)면 true. false면 itemDisplayName이 원문 itemId를
// 그대로 반환(미번역)한다. itemDisplayName과 동일한 해석 경로를 따르며,
// 상점 등 카탈로그 itemId의 데이터↔i18n 무결성 검증(시드 테스트)에 사용한다.
export function isDisplayableItemId(itemId: string): boolean {
  const lvl = swordItemLevel(itemId)
  if (lvl !== null) return dataManager.getSwordByLevel(lvl) !== undefined
  return itemId in ITEM_NAME_KEYS
}
