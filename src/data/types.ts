import type { TranslationKey } from '../i18n/locales/ko'

// 강화 비용. 골드 / 아이템(잡템·재료검) / 무료 세 가지 형태.
//  - gold: 골드 amount 소모
//  - item: itemId 아이템을 count 개 소모(재료검·잡템 등)
//  - free: 비용 없음
export type Material =
  | { kind: 'gold'; amount: number }
  | { kind: 'item'; itemId: string; count: number }
  | { kind: 'free' }

// 강화 실패(파괴) 시 드랍되는 아이템 + 수량(언어 중립). null = 드랍 없음.
// 구조는 인벤토리 한 칸(ItemStack)과 같지만 데이터 레이어 독립을 위해 별도로 둔다.
export type Drop = { itemId: string; count: number }

// 상점 판매 항목(언어 중립). 항목 식별자(id)는 지급 itemId와 분리한다 —
// 같은 itemId를 서로 다른 가격(골드 / 아이템)으로 여러 항목에서 팔 수 있기 때문이다.
// 표시명은 데이터에 박지 않고 itemId → lib/items의 itemDisplayName으로 해석한다.
// 새 항목은 이 카탈로그 + (검이 아니면) lib/items 표시명 매핑·번역을 갖춰야 한다(무결성은 시드 테스트가 강제).
//  - id: 상점 항목 식별자(SKU, 구매 대상 — dedup/조회 키)
//  - itemId: 구매 시 인벤토리(items)에 지급되는 아이템 id
//  - price: 1개당 가격 — Material(gold / item / free) 재사용
export type ShopItem = {
  id: string
  itemId: string
  price: Material
}

// 의뢰(Commission) 시스템 튜닝 설정(언어 중립). 코드 상수가 아니라 데이터 파일(commission.json)에 두고
// DataManager 가 로드 시 검증한다. 순수 reducer(commissionQueue)는 이 값을 인자로 주입받아 쓴다.
//  - maxCommissions: 동시 유지 의뢰 수(불변식 active+pending === 이 값)
//  - durationMin/MaxMs: 의뢰 시간 제한 범위(생성 시 이 구간에서 무작위)
//  - incentiveMin/Max: 판매가 대비 보상 인센티브 범위(예: 0.1~2.0 = +10%~+200%)
//  - respawnDelayMs: 의뢰가 사라진 뒤 빈 슬롯이 다시 채워지기까지의 딜레이
//  - tickIntervalMs: 셸(commissionStore)이 시간을 전진시키는 주기(만료/스폰 감지 해상도)
//  - minLevel: 출제 검의 절대 최소 레벨(이 미만 검은 진행도와 무관하게 의뢰에 나오지 않는다)
//  - poolLevelBelow/Above: "진행도 근처" 범위 — 최고검 레벨 기준 [max(maxLv-below, minLevel), maxLv+above]
export type CommissionConfig = {
  maxCommissions: number
  durationMinMs: number
  durationMaxMs: number
  incentiveMin: number
  incentiveMax: number
  respawnDelayMs: number
  tickIntervalMs: number
  minLevel: number
  poolLevelBelow: number
  poolLevelAbove: number
}

// 검의 특수 플래그(언어 중립 태그). 표시가 필요하면 i18n에서 해석한다.
//  - storable(보관필요): 고단계 강화 재료로도 쓰일 수 있는 검
//  - easyBug(이지버그): Easy 모드 버그성 특수 단계
export type SwordNote = 'storable' | 'easyBug'

// 검 정의 데이터(언어 중립).
// 표시명은 코드에 박지 않고 nameKey(i18n 키)로 두어 표시 시점에 t()로 해석한다.
// enhanceCost / successRate 가 null 이면 더 이상 강화할 수 없는 최종 단계(terminal)다.
export type SwordData = {
  // 검 식별자 = 인벤토리 itemId. 검은 이 id로 조회한다(레벨을 문자열에서 파싱하지 않는다).
  id: string
  // 강화 성공 시 되는 검의 id. null = 최종 단계(다음 검 없음). 진행은 level±1이 아니라 이 링크로 결정된다.
  nextId: string | null
  // 표시(+N)·밸런스·정렬용 속성(식별자가 아님 — 식별은 id).
  level: number
  nameKey: TranslationKey
  enhanceCost: Material | null // null = 최종 단계(강화 불가)
  successRate: number | null // 0~1, null = 최종 단계
  sellPrice: number | null // null = 판매 불가
  protectionTickets: number | 'disabled' // 'disabled' = 파괴보호장치 사용 불가
  dropOnFail: Drop | null // 파괴 시 드랍되는 아이템 + 수량, null = 없음
  notes: SwordNote[]
  // 스프라이트 파일명(예: 'rusty_dagger.png'). 전용 스프라이트가 없는 단계는
  // 로더가 마지막(최고 단계) 보유 스프라이트로 채운다(임시). 디렉토리/URL은 뷰에서 해석.
  sprite: string
}
