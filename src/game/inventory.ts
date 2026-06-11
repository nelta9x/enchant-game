import type { ItemStack } from './types'

// 인벤토리에서 특정 itemId 보유 수량 조회(없으면 0) — 엔진(enhancer)과 뷰 어휘 허브(lib/items)가
// 공유하는 순수 헬퍼. 엔진은 DataManager 비의존이어야 하므로 이 모듈도 게임 도메인 타입만 본다
// (데이터 레이어·뷰 import 없음).
export function countOf(items: readonly ItemStack[], itemId: string): number {
  return items.find((i) => i.itemId === itemId)?.count ?? 0
}
