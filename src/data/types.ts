import type { TranslationKey } from '../i18n/locales/ko'

// 강화 비용. 골드 / 아이템(잡템·재료검) / 무료 세 가지 형태.
//  - gold: 골드 amount 소모
//  - item: itemId 아이템을 count 개 소모(재료검·잡템 등)
//  - free: 비용 없음
export type Material =
  | { kind: 'gold'; amount: number }
  | { kind: 'item'; itemId: string; count: number }
  | { kind: 'free' }

// 강화 비용으로 추가 소모되는 아이템 1건(언어 중립). enchantCost(단일 Material)와 함께 소모된다 —
// "골드 + 재료 여러 종" 같은 복합 비용을 표현하기 위한 보조 목록(SwordData.enchantCostItems).
// Material 은 한 강화당 한 종류만 표현하므로(상점 price 와 공유), 그 union 을 건드리지 않고
// 검 강화에 한정해 추가 아이템 요구를 둔다.
//  - itemId / count: 추가로 소모할 아이템과 수량(count 는 양의 정수). 검(재료검)·잡템 모두 가능.
export type ItemCost = { itemId: string; count: number }

// 강화 실패(파괴) 시 드랍될 수 있는 아이템 후보 1건(언어 중립). 파괴 시 후보마다 chance 로 독립
// 추첨해(가중 추첨 아님) 통과한 것들이 동시에 떨어진다 — 한 번에 0~N종이 산출될 수 있다.
//  - itemId / count: 떨어질 아이템과 그 수량(count 는 양의 정수, 확률 통과 시 고정 수량)
//  - chance: 이 후보가 떨어질 독립 확률(0 < chance <= 1). 1 = 항상. successRate 와 같은 0~1 표기.
// 구조의 itemId/count 부분은 인벤토리 한 칸(ItemStack)과 같지만 데이터 레이어 독립을 위해 별도로 둔다.
export type Drop = { itemId: string; count: number; chance: number }

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
// "시퀀스 타이밍"(언제 망치가 닿고, 언제 다시 강화 가능한지)만 데이터로 둔다 — 개별 파티클의 "모양"
// 상수(분출 반경·파티클 비행 시간 등)는 프레젠테이션 코드에 남긴다(경계는 loadAnimation 주석 참고).
// 떨림 길이(ms)는 결과별로 검 데이터(SwordData.shake)에 두며, 강화 1회의 연출 타임라인은
// enhanceTimeline.ts 가 이 animation 값 + 그 떨림 시간으로 도출한다(단일 출처).
//  - hammerImpactMs: 강화 시작(t=0)부터 망치가 검에 닿기까지(정수 >= 0). 떨림 시작·Hit 불꽃·'캉' 타격음의
//    공통 앵커. 망치 윈드업(대기)은 고정이라 이 값은 매회 동일(랜덤이 아님).
//  - hammerSnapMs: 닿기 직전 빠르게 내리꽂는 스냅(내려치기) 길이(holdUntil→impact). 윈드업이 아니라
//    "내려치는 동작" 자체의 길이다 — 이 값을 키우면 내려치기가 느려진다. 모션의 "모양" 중 디자이너가
//    데이터로 만지는 값(HammerShape 로 변환돼 흐른다).
//  - hammerHoldAfterMs: 임팩트 직후 그 자세를 유지하는 정지 시간.
//  - hammerFadeoutMs: 정지 후 제자리에서 사라지는 페이드아웃 길이.
//  - hammerFaceOffset: 임팩트 폭발(Hit 불꽃)이 터지는 지점 — 망치 "스프라이트 공간"(회전 전, 본체
//    96px 기준 px, x+ 오른쪽 · y+ 아래)에서 스프라이트 중심 기준 오프셋. 임팩트 자세로 회전돼 더해지므로
//    (hammerSwing.impactTipOffset) 임팩트 각도를 튜닝해도 폭발이 같은 부위를 따라간다. 호라드릭 망치는
//    머리 블록이 이미지 좌상단이라 타격면은 음수 x(왼쪽)·음수 y(위) — 예: {x:-56, y:-16}.
//  - reEnhanceGuardMs: 성공/실패 버스트 발생 후 다시 강화할 수 있기까지의 입력 잠금(ms, 정수 >= 0).
//    UI 가드 전용(게임 로직 불변) — 0 = 버스트 즉시 재강화 가능.
//  - enhanceParticlesEnabled / hammerSwingEnabled / hammerSmearEnabled: 연출 on/off 플래그. false 면
//    해당 연출이 마운트조차 되지 않는다(순수 프레젠테이션 게이트 — 게임 로직·타임라인·잠금·사운드는 영향 없음).
//      · enhanceParticlesEnabled: 강화 파티클(임팩트 불꽃 캔버스 HitSparkCanvas + 성공/파괴 버스트 캔버스
//        ParticlePool — 풀이 없으면 버스트 emit 은 자동 no-op).
//      · hammerSwingEnabled: 망치 본체 내려치기 스윙(motion.img). false 면 망치 자체가 안 보이고 하위
//        스미어도 함께 사라진다 — 임팩트 앵커(떨림·Hit 불꽃·'캉' 타격음)는 GameScreen 타임라인이 독립 구동.
//      · hammerSmearEnabled: 망치 스윙 모션 블러 스미어(궤적 잔상 캔버스). hammerSwingEnabled 가 true 일 때만 의미.
//  - particlePoolReserve: 파티클 객체 풀을 시작(warmup) 시 미리 확보할 슬롯 수. 첫 버스트(특히 고레벨 대형
//    도트 버스트)도 객체를 새로 만들지 않게 한다 — 연사 GC 압박을 0으로. 풀은 이보다 큰 버스트가 오면 lazily
//    더 늘되 줄지는 않는다(상한이 아니라 사전 확보치). dots = 보통 최고 레벨 버스트 입자 수(particleCount(maxLevel)),
//    hitSparks = 한 타격의 불티+잉걸불 수, hitLicks = 불혀 수. 0 이면 사전 확보 없이 lazily 성장(이전 동작).
export type AnimationConfig = {
  hammerImpactMs: number
  hammerSnapMs: number
  hammerHoldAfterMs: number
  hammerFadeoutMs: number
  hammerFaceOffset: { x: number; y: number }
  reEnhanceGuardMs: number
  enhanceParticlesEnabled: boolean
  hammerSwingEnabled: boolean
  hammerSmearEnabled: boolean
  particlePoolReserve: { dots: number; hitSparks: number; hitLicks: number }
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

// 제안 갱신 후보 1개(가중 추첨). value = 한 세션이 버티는 강화 시도 횟수, weight = 추첨 빈도(기본 1).
// 세션 시작 시 버킷의 refreshWeights 에서 weight 비례로 하나를 골라 그 value 를 세션 카운터로 삼는다.
// 후보 값의 범위(최소/최대)와 각 값의 빈도가 전부 데이터(commission.json)로 표현된다 — 균등하게 하려면
// 모든 weight 를 1 로 둔다(예: 값 1~5 각 weight 1 = 1~5 균등).
export type RefreshWeight = {
  value: number // 갱신까지의 강화 시도 횟수(정수 >= 1)
  weight: number // 추첨 가중치(> 0)
}

// 의뢰 골드 버킷 1구간(언어 중립). 플레이어의 보유 골드 구간마다 출제 아이템·갱신 분포를 독립 설정한다.
// 버킷들은 [0, ∞) 를 빈틈·겹침 없이 덮어야 한다(로더가 강제): 첫 버킷 minGold=0, 연속, 마지막 maxGold=null.
//  - minGold: 담당 골드 구간 하한(포함). 검증 전용 — 셀렉터는 maxGold 만 본다.
//  - maxGold: 상한(미포함). null = ∞(마지막 버킷).
//  - items: 이 버킷에서 출제될 아이템 목록(itemId + weight + 아이템별 incentive/additive). 비어있지 않음
//  - refreshWeights: 세션이 갱신되기까지의 강화 시도 횟수 후보(가중 추첨). 세션 시작 시 여기서 하나를 뽑아
//    세션 카운터로 삼고, 강화 시도마다 1씩 차감해 0 이 되면 세션 전체가 새로 갱신된다(시간이 아니라 시도 기반).
//    비어있지 않음.
export type GoldBucket = {
  minGold: number
  maxGold: number | null
  items: CommissionItemEntry[]
  refreshWeights: RefreshWeight[]
}

// 의뢰(Commission) 시스템 튜닝 설정(언어 중립). 코드 상수가 아니라 데이터 파일(commission.json)에 두고
// DataManager 가 로드 시 검증한다. 순수 reducer(commissionQueue)는 이 값을 인자로 주입받아 쓴다.
// 시스템 파라미터(아래 2개)는 버킷과 무관한 글로벌이고, 나머지 튜닝값은 전부 buckets[] 안에 골드 구간별로 둔다.
//  - maxCommissions: 한 "제안 세션"에 한 번에 출제되는 제안 수(=세션 크기). 세션 발생 시 서로 다른 제안을
//    이만큼 한 번에 출제하고, 풀의 서로 다른 항목 수가 이보다 적으면 있는 만큼만 낸다(min). 플레이어가 그중
//    하나를 선택(납품)하면 이번 세션의 카드가 전부 사라지고 갱신 바만 남는다 — 새 제안은 갱신 카운터가 0 이 될 때 뜬다.
//  - unlockAtLevel: 제안 기능이 활성화되는 최소 "도달 강화 레벨"(gameStore.maxLevelReached 기준, 단조 high-water-mark).
//    플레이어가 이 레벨에 한 번이라도 도달하기 전에는 제안이 전혀 출제되지 않는다(초반엔 재화가 없어 활용 불가 — 의도된 잠금).
//    maxLevelReached 는 파괴·판매로 내려가지 않으므로(달성=영구) 한 번 해제되면 다시 잠기지 않는다. 0 = 처음부터 활성.
//    데이터 파일(commission.json)에서 조절한다(코드 상수 아님).
//  - refreshCost: 제안 세션을 강제로 갱신(상단 갱신 버튼)할 때 1회 차감되는 골드. 정수 >= 0(0 = 무료).
//    잠금 해제 후에만 갱신할 수 있고, 보유 골드가 이 값 이상일 때만 동작한다(commissionStore.refreshNow).
//  - buckets: 보유 골드 구간별 정의([0,∞) 를 덮는 연속 버킷 — buckets[0] 이 골드 0 구간).
export type CommissionConfig = {
  maxCommissions: number
  unlockAtLevel: number
  refreshCost: number
  buckets: GoldBucket[]
}

// 검의 특수 플래그(언어 중립 태그). 표시가 필요하면 i18n에서 해석한다.
//  - storable(보관필요): 고단계 강화 재료로도 쓰일 수 있는 검
export type SwordNote = 'storable'

// 강화 결과별 검 "덜덜 떨림" 길이(ms). 키 4종은 EnhanceOutcome(game/types)과 손으로 맞춘 1:1 대응이다
// (data→game 의존을 피해 Record 로 묶지 않는다). 소비처(GameScreen)가 result.outcome 으로 직접 인덱싱하므로,
// EnhanceOutcome 에 결과가 늘면 그 인덱싱 지점(sword.shake[result.outcome])이 컴파일 에러로 드러낸다.
// 망치가 닿는 순간(animation.hammerImpactMs)부터 이 길이만큼 떤 뒤 결과가 공개된다(enhanceTimeline).
// 값이 0 이하면 그 결과에선 검이 떨지 않는다(떨림 없음 — 즉시 임팩트 시점에 공개/버스트).
// 폴백·기본값 없음: 검 데이터에 shake 또는 어느 한 키라도 없으면 로더가 throw 한다(데이터 명시 강제).
//  - success: 성공   - protected: 파괴보호 발동   - whiff: 헛방   - destroyed: 파괴
export type SwordShake = {
  success: number
  protected: number
  whiff: number
  destroyed: number
}

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
  // 강화 시 enchantCost 와 함께 소모되는 추가 아이템 요구. 빈 배열 = 추가 요구 없음(기본).
  // "골드 + 재료 여러 종"처럼 Material(단일 종류)로 표현 못 하는 복합 비용을 위해 둔다 —
  // 엔진은 enchantCost(골드/아이템) + 이 목록을 모두 충족해야 강화 가능하고, 성공/헛방/방지/파괴
  // 어느 결과든 (방지의 파괴보호장치처럼) 함께 차감한다. 최종 단계(enchantCost null)는 항상 [].
  enchantCostItems: ItemCost[]
  successRate: number | null // 0~1, null = 최종 단계
  sellPrice: number | null // null = 판매 불가
  protectionTickets: number | 'disabled' // 'disabled' = 파괴보호장치 사용 불가
  // 강화 실패(파괴보호 미사용) 시 헛방(파괴 없는 실패) vs 파괴를 가르는 가중치. 성공/실패 1차 판정은
  // successRate 가 그대로 담당하고, 실패했을 때만 이 둘로 2차 추첨한다(둘 다 비음 정수, 합 > 0).
  whiffWeight: number // 헛방(검 보존) 가중치
  destroyWeight: number // 파괴 가중치
  // 파괴 시 드랍될 수 있는 아이템 후보 목록. 빈 배열 = 드랍 없음. 후보마다 chance 로 독립 추첨하므로
  // 파괴 1회에 0~N종이 동시에 떨어질 수 있다(엔진이 통과분을 ItemStack[]로 산출).
  dropOnFail: Drop[]
  notes: SwordNote[]
  // 강화 결과별 떨림 길이(ms) — 성공/파괴보호/헛방/파괴 각각 별도. 데이터에 없으면 로더가 throw(폴백 없음).
  shake: SwordShake
  // 스프라이트 파일명(예: 'rusty_dagger.png'). 전용 스프라이트가 없는 단계는
  // 로더가 마지막(최고 단계) 보유 스프라이트로 채운다(임시). 디렉토리/URL은 뷰에서 해석.
  sprite: string
}
