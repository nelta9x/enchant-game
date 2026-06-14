// 도메인 어휘에서 '검(Sword)'은 단계 정의 그 자체다 — 한 단계가 곧 하나의 검 종류이고,
// 검에는 인스턴스별 상태가 없다(원작과 동일). 정식 데이터 타입은 데이터 레이어의
// SwordData이며, 런타임에서 보유/현재 검은 검의 id로 식별하고 정의는
// DataManager.getSwordById로 해석한다(원칙 2).

// 인벤토리 한 칸(아이템 + 수량). 모든 종류의 아이템을 itemId로 식별해 담는다.
// number 키 Record는 직렬화/순회 시 키가 문자열로 바뀌는 함정이 있어 배열로 모델링한다.
export type ItemStack = { itemId: string; count: number }

// 플레이어 진행 상태(런타임). 정의가 아니라 식별자(itemId / 검 id)만 보유하고,
// 실제 검 정의는 DataManager.getSwordById로 해석한다(원칙 2).
//
// 인벤토리는 종류별로 나누지 않고 단일 items 로 둔다 — 일반적인 인벤토리이며,
// 새 아이템 종류(워프권 등)가 생겨도 itemId만 추가하면 되어 확장에 유리하다.
//
// itemId 네임스페이스 규약(아이템 카탈로그 = 스프린트 4 에서 타입/런타임으로 제약 예정):
//   - 검:    검 자신의 id(SwordData.id)    (예: `sword_19` — 검은 id로 조회, 레벨을 파싱하지 않는다)
//   - 잡템:  고유 slug                  (예: `iron_scrap` — swords.json 의 드랍/재료 itemId와 동일)
//   - 파괴보호장치: `protection_ticket`
//   - 워프권: `warp_ticket_<level>`      (스프린트 5)
//
// gold(통화)와 currentSwordId(강화 슬롯에 장착된 검)은 인벤토리와 구분해 둔다.
export type PlayerState = {
  // 보유 골드(통화 — 아이템 아님).
  gold: number
  // 현재 강화 슬롯의 검 id. null = 보유 검 없음(시작 전 · 파산). 정의는 DataManager.getSwordById로 해석.
  currentSwordId: string | null
  // 모든 보유 아이템(재료 검 · 잡템 · 파괴보호장치 · 워프권 등) — itemId로 식별.
  items: ItemStack[]
  // 파괴로 떨어졌지만 아직 "수집되지 않은" 드랍(검 아래 흩뿌림 연출 대기분). items 와 분리해,
  // 마우스로 스치거나(개별) 일정 시간 후(자동) 수집될 때 collectDrop 으로 items 로 옮긴다.
  // 연출이 끝날 때 미수집분은 flushDrops 로 일괄 items 에 합산해 유실을 막는다(손실 0 보장).
  pendingDrops: ItemStack[]
  // 한 번이라도 도달한 최고 강화 레벨(단조 — 내려가지 않는 high-water-mark). 파괴·판매로 시작 검(+1)이 돼도
  // 유지되어 "최대 몇강까지 갔는지 / 목표(최고 검 레벨)까지 얼마나 남았는지"를 보여주는 데 쓴다.
  // currentSwordId(현재 장착 검)와 별개의 누적 기록이며, gameStore 가 currentSwordId 상승을 단일 지점에서 반영한다.
  maxLevelReached: number
}

// 강화 1회 시도에 소모되는 재료(호출자가 인벤토리에서 차감하는 데 사용).
// 골드 + 아이템(강화비용 아이템 · 소모된 파괴보호장치 등).
export type ConsumedMaterials = { gold: number; items: ItemStack[] }

// 강화 1회 시도의 결과 — '새 상태'가 아니라 '무슨 일이 일어났는가'를 서술하는 이벤트.
// outcome 으로 구별되는 판별 유니온이라 불가능한 상태가 타입상 표현되지 않는다
// (예: 파괴인데 toId 존재, 성공인데 drops 존재 등은 만들 수 없음).
// 검은 id 로만 식별한다 — 표시용 레벨이 필요하면 소비자가 DataManager.getSwordById(id).level 로 해석한다
// (순수 엔진은 다른 검을 조회할 수 없으므로 결과에 레벨을 담지 않는다).
//  - consumed: 차감할 재료   - drops: 산출된 아이템(파괴 조각 등)   - toId: 결과 검 id
export type EnhanceOutcome = 'success' | 'protected' | 'whiff' | 'destroyed'

export type EnhanceResult =
  | {
      // 성공: 다음 검으로.
      outcome: 'success'
      fromId: string
      toId: string // = sword.nextId (강화된 검)
      consumed: ConsumedMaterials
      drops: ItemStack[] // 항상 [] — 성공 시 드랍 없음
    }
  | {
      // 실패했으나 파괴보호장치로 검 보존(같은 검 유지).
      outcome: 'protected'
      fromId: string
      toId: string // = fromId (보존)
      consumed: ConsumedMaterials // 강화비용 + 소모된 파괴보호장치
      protectionUsed: number
      drops: ItemStack[] // 항상 [] — 방지 시 드랍 없음
    }
  | {
      // 실패했으나 파괴 없이 강화만 빗나감(헛방) — 검 보존(같은 검 유지).
      // 파괴보호장치와 달리 추가 소모 없이, 강화 비용만 소모하고 검이 살아남는다.
      outcome: 'whiff'
      fromId: string
      toId: string // = fromId (보존)
      consumed: ConsumedMaterials // 강화 비용(헛방도 비용은 소모)
      drops: ItemStack[] // 항상 [] — 파괴가 아니므로 드랍 없음
    }
  | {
      // 실패 + 검 파괴.
      outcome: 'destroyed'
      fromId: string
      toId: null // 검 소멸
      consumed: ConsumedMaterials
      drops: ItemStack[] // dropOnFail 있으면 [{ ...dropOnFail }], 없으면 []
    }
