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

// 아이템 카탈로그 1건(언어 중립). 검이 아닌 아이템(철조각 등 재료)의 메타데이터를 데이터 파일(items.json)에 둔다.
// 표시명은 데이터에 박지 않고 id → i18n 키(item.<id>)로 파생한다(검의 nameKey 파생 패턴 미러).
//  - id: 인벤토리 itemId(= 카탈로그 키)
//  - basePrice: 의뢰 보상 산정 기준가(>= 0). 검은 sellPrice 를 기준가로 쓰므로 여기 등록하지 않는다.
//  - nameKey: 표시명 i18n 키(id 에서 파생)
//  - sprite: 전용 스프라이트 파일명(없으면 null → ItemIcon 토큰 폴백)
export type ItemData = {
  id: string
  basePrice: number
  nameKey: TranslationKey
  sprite: string | null
}

// 플로팅 텍스트 연출 데이터(언어 중립). "이벤트 타이밍" 키 → 후보 텍스트 목록. 이벤트가 뜨면 후보 중
// weight 비례로 한 줄을 골라(pickFloatingText) 무기 근처에 띄운다(데이터 기반 — 코드 상수가 아니라
// floatingText.json). 문구는 데이터에 박지 않고 i18n 키(TranslationKey)로 두어 표시 시점에 t()로
// 해석한다(검·아이템의 nameKey 파생 패턴 미러).
//  - text: 표시 문구 i18n 키
//  - weight: 후보 간 상대 가중치(>0). 합이 1이 아니어도 됨 — pickFloatingText 가 정규화해 1개 선택.
export type FloatingTextEntry = { text: TranslationKey; weight: number }

// 이벤트 타이밍 키(예: 'enhanceFail') → 후보 엔트리 목록. 빈 배열 = 아직 안 채운 슬롯(미표시).
export type FloatingTextData = Record<string, FloatingTextEntry[]>

// 강화 연출 시퀀스의 타이밍 설정(코드 상수가 아니라 별도 데이터 파일 animation.json 에서 적재).
// "시퀀스 타이밍"(언제 망치가 닿고, 떨림이 얼마나 가고, 언제 다시 강화 가능한지)만 데이터로 둔다 —
// 개별 파티클·모션의 "모양" 상수(분출 반경·파티클 비행 시간 등)는 프레젠테이션 코드에 남긴다(경계는
// loadAnimation 주석 참고). 강화 1회의 연출 타임라인은 enhanceTimeline.ts 가 이 값 + 매회 랜덤 떨림
// 시간으로 도출한다(단일 출처).
//  - hammerImpactMs: 강화 시작(t=0)부터 망치가 검에 닿기까지(정수 >= 0). 떨림 시작·Hit 불꽃·'캉' 타격음의
//    공통 앵커. 망치 윈드업은 고정이라 이 값은 매회 동일(랜덤이 아님).
//  - weaponShakeMinMs / weaponShakeMaxMs: 망치가 닿은 뒤 무기가 덜덜 떠는 시간 범위(ms). 매 강화마다
//    이 구간에서 무작위로 뽑는다(min <= max, 둘 다 정수 >= 0). 떨림이 끝나는 순간 성공/실패 버스트가 터진다.
//  - reEnhanceGuardMs: 성공/실패 버스트 발생 후 다시 강화할 수 있기까지의 입력 잠금(ms, 정수 >= 0).
//    UI 가드 전용(게임 로직 불변) — 0 = 버스트 즉시 재강화 가능.
export type AnimationConfig = {
  hammerImpactMs: number
  weaponShakeMinMs: number
  weaponShakeMaxMs: number
  reEnhanceGuardMs: number
}

// 의뢰 버킷에서 출제될 거래 1종(언어 중립). 등장 확률(weight) + "지불(cost)" + "보상(reward)"을 아이템별로 둔다.
// 거래는 비용·보상이 각각 골드 또는 아이템이라 4조합이 가능하다(단 골드 비용은 아이템 보상만 — 아래 제약).
//
// 지불(cost):
//  - costKind 'item'(기본, 누락 시): itemId 아이템을 requiredCount 개 납품(검·재료). 로더가 requiredCount 누락 시 1로 정규화.
//  - costKind 'gold': 골드 costAmount 를 지불(골드로 아이템 구매). itemId/requiredCount 없음.
// 보상(reward):
//  - rewardKind 'gold': basePrice·incentive·additive 로 골드를 동적 산정(reward = round((basePrice + additive) * incentive)).
//    basePrice 는 "납품 아이템"의 기준가라 골드 보상은 아이템 비용(costKind 'item')에만 허용된다(로더 강제).
//  - rewardKind 'item': 납품/지불하면 rewardItemId 를 rewardItemCount 개 지급(골드 산정 없음).
// (costKind/rewardKind 누락 시 로더가 각각 'item'/'gold' 로 정규화 — 기존 골드 의뢰는 itemId+incentive/additive 만 두면 된다.)
export type CommissionItemEntry = {
  weight: number
} & (
  | { costKind?: 'item'; itemId: string; requiredCount: number }
  | { costKind: 'gold'; costAmount: number }
) &
  (
    | {
        rewardKind: 'gold'
        incentiveMin: number
        incentiveMax: number
        additiveMin: number
        additiveMax: number
      }
    | {
        rewardKind: 'item'
        rewardItemId: string
        rewardItemCount: number
      }
  )

// 의뢰 골드 버킷 1구간(언어 중립). 플레이어의 보유 골드 구간마다 출제 아이템·시간을 독립 설정한다.
// 버킷들은 [0, ∞) 를 빈틈·겹침 없이 덮어야 한다(로더가 강제): 첫 버킷 minGold=0, 연속, 마지막 maxGold=null.
//  - minGold: 담당 골드 구간 하한(포함). 검증 전용 — 셀렉터는 maxGold 만 본다.
//  - maxGold: 상한(미포함). null = ∞(마지막 버킷).
//  - items: 이 버킷에서 출제될 아이템 목록(itemId + weight + 아이템별 incentive/additive). 비어있지 않음
//  - durationMin/MaxMs: 세션 1개의 시간 제한 범위(세션 시작 시 이 구간에서 한 번 무작위). 세션의 모든 제안이
//    이 하나의 만료 시각을 공유해 통째로 같이 만료된다(통합 지속시간 — 카드별이 아니라 세션 1개 바로 표현).
//  - spawnIntervalMin/MaxMs: 세션과 세션 사이 쿨다운 범위(이 구간에서 무작위). 세션이 끝나면(선택 또는
//    전부 만료) 이 간격만큼 비운 뒤 다음 세션이 시작된다.
export type GoldBucket = {
  minGold: number
  maxGold: number | null
  items: CommissionItemEntry[]
  durationMinMs: number
  durationMaxMs: number
  spawnIntervalMinMs: number
  spawnIntervalMaxMs: number
}

// 의뢰(Commission) 시스템 튜닝 설정(언어 중립). 코드 상수가 아니라 데이터 파일(commission.json)에 두고
// DataManager 가 로드 시 검증한다. 순수 reducer(commissionQueue)는 이 값을 인자로 주입받아 쓴다.
// 시스템 파라미터(아래 2개)는 버킷과 무관한 글로벌이고, 나머지 튜닝값은 전부 buckets[] 안에 골드 구간별로 둔다.
//  - maxCommissions: 한 "제안 세션"에 한 번에 출제되는 제안 수(=세션 크기). 세션 발생 시 서로 다른 제안을
//    이만큼 한 번에 출제하고, 풀의 서로 다른 항목 수가 이보다 적으면 있는 만큼만 낸다(min). 플레이어가 그중
//    하나를 선택(납품)하면 나머지가 사라지며 세션이 끝나고, spawnInterval 쿨다운 뒤 다음 세션이 시작된다.
//  - tickIntervalMs: 셸(commissionStore)이 시간을 전진시키는 주기(만료/세션 시작 감지 해상도)
//  - unlockAtLevel: 제안 기능이 활성화되는 최소 "도달 강화 레벨"(gameStore.maxLevelReached 기준, 단조 high-water-mark).
//    플레이어가 이 레벨에 한 번이라도 도달하기 전에는 제안이 전혀 출제되지 않는다(초반엔 재화가 없어 활용 불가 — 의도된 잠금).
//    maxLevelReached 는 파괴·판매로 내려가지 않으므로(달성=영구) 한 번 해제되면 다시 잠기지 않는다. 0 = 처음부터 활성.
//    데이터 파일(commission.json)에서 조절한다(코드 상수 아님).
//  - buckets: 보유 골드 구간별 정의([0,∞) 를 덮는 연속 버킷 — buckets[0] 이 골드 0 구간).
export type CommissionConfig = {
  maxCommissions: number
  tickIntervalMs: number
  unlockAtLevel: number
  buckets: GoldBucket[]
}

// 검의 특수 플래그(언어 중립 태그). 표시가 필요하면 i18n에서 해석한다.
//  - storable(보관필요): 고단계 강화 재료로도 쓰일 수 있는 검
//  - easyBug(이지버그): Easy 모드 버그성 특수 단계
export type SwordNote = 'storable' | 'easyBug'

// 검 정의 데이터(언어 중립).
// 표시명은 코드에 박지 않고 nameKey(i18n 키)로 두어 표시 시점에 t()로 해석한다.
// enchantCost / successRate 가 null 이면 더 이상 강화할 수 없는 최종 단계(terminal)다.
export type SwordData = {
  // 검 식별자 = 인벤토리 itemId. 검은 이 id로 조회한다(레벨을 문자열에서 파싱하지 않는다).
  id: string
  // 강화 성공 시 되는 검의 id. null = 최종 단계(다음 검 없음). 진행은 level±1이 아니라 이 링크로 결정된다.
  nextId: string | null
  // 표시(+N)·밸런스·정렬용 속성(식별자가 아님 — 식별은 id).
  level: number
  nameKey: TranslationKey
  enchantCost: Material | null // null = 최종 단계(강화 불가)
  successRate: number | null // 0~1, null = 최종 단계
  sellPrice: number | null // null = 판매 불가
  protectionTickets: number | 'disabled' // 'disabled' = 파괴보호장치 사용 불가
  dropOnFail: Drop | null // 파괴 시 드랍되는 아이템 + 수량, null = 없음
  notes: SwordNote[]
  // 스프라이트 파일명(예: 'rusty_dagger.png'). 전용 스프라이트가 없는 단계는
  // 로더가 마지막(최고 단계) 보유 스프라이트로 채운다(임시). 디렉토리/URL은 뷰에서 해석.
  sprite: string
}
