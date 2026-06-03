import type { SwordData } from '../data/types'

// 도메인 어휘에서 '검(Sword)'은 단계 정의 그 자체다 — 단계가 곧 검 종류이고,
// 검에는 인스턴스별 상태가 없다(원작과 동일). 정식 데이터 타입은 데이터 레이어의
// SwordData이며, 런타임에서 보유/현재 검은 '단계(level)'로 식별하고 정의는
// DataManager로 해석한다(원칙 2). 여기서는 도메인 별칭으로만 노출한다.
export type Sword = SwordData

// 인벤토리 한 칸(아이템 + 수량). 모든 종류의 아이템을 itemId로 식별해 담는다.
// number 키 Record는 직렬화/순회 시 키가 문자열로 바뀌는 함정이 있어 배열로 모델링한다.
export type ItemStack = { itemId: string; count: number }

// 플레이어 진행 상태(런타임). 정의가 아니라 식별자(itemId / 단계)만 보유하고,
// 실제 검 정의는 DataManager로 해석한다(원칙 2).
//
// 인벤토리는 종류별로 나누지 않고 단일 items 로 둔다 — 일반적인 인벤토리이며,
// 새 아이템 종류(워프권 등)가 생겨도 itemId만 추가하면 되어 확장에 유리하다.
//
// itemId 네임스페이스 규약(아이템 카탈로그 = 스프린트 4 에서 타입/런타임으로 제약 예정):
//   - 검:    `sword_<level>`            (예: `sword_19`. 레벨이 곧 정체성, 로케일 독립)
//   - 잡템:  고유 slug                  (예: `evil_soul` — swords.json 의 드랍/재료 itemId와 동일)
//   - 방지권: `protection_ticket`
//   - 워프권: `warp_ticket_<level>`      (스프린트 5)
//
// gold(통화)와 currentSwordLevel(강화 슬롯에 장착된 검)은 인벤토리와 구분해 둔다.
export type PlayerState = {
  // 보유 골드(통화 — 아이템 아님).
  gold: number
  // 현재 강화 슬롯의 검 단계. null = 보유 검 없음(시작 전 · 파산).
  currentSwordLevel: number | null
  // 모든 보유 아이템(재료 검 · 잡템 · 방지권 · 워프권 등) — itemId로 식별.
  items: ItemStack[]
}

// 강화 1회 시도에 소모되는 재료(호출자가 인벤토리에서 차감하는 데 사용).
// 골드 + 아이템(강화비용 아이템 · 소모된 방지권 등).
export type ConsumedMaterials = { gold: number; items: ItemStack[] }

// 강화 1회 시도의 결과 — '새 상태'가 아니라 '무슨 일이 일어났는가'를 서술하는 이벤트.
// outcome 으로 구별되는 판별 유니온이라 불가능한 상태가 타입상 표현되지 않는다
// (예: 파괴인데 toLevel 존재, 성공인데 drops 존재 등은 만들 수 없음).
//  - consumed: 차감할 재료   - drops: 산출된 아이템(파괴 조각 등)   - toLevel: 결과 검 단계
export type EnhanceOutcome = 'success' | 'protected' | 'destroyed'

export type EnhanceResult =
  | {
      // 성공: 단계 +1.
      outcome: 'success'
      fromLevel: number
      toLevel: number // = fromLevel + 1 (강화된 검)
      consumed: ConsumedMaterials
      drops: ItemStack[] // 항상 [] — 성공 시 드랍 없음
    }
  | {
      // 실패했으나 방지권으로 검 보존(단계 유지).
      outcome: 'protected'
      fromLevel: number
      toLevel: number // = fromLevel (보존)
      consumed: ConsumedMaterials // 강화비용 + 소모된 방지권
      protectionUsed: number
      drops: ItemStack[] // 항상 [] — 방지 시 드랍 없음
    }
  | {
      // 실패 + 검 파괴.
      outcome: 'destroyed'
      fromLevel: number
      toLevel: null // 검 소멸
      consumed: ConsumedMaterials
      drops: ItemStack[] // dropItemOnFail 있으면 [{ itemId, count: 1 }], 없으면 []
    }
