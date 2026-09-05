import commissionRaw from '../../public/data/commission.json'
import type {
  CommissionConfig,
  CommissionItemEntry,
  ShopTier,
  TradeCost,
} from './types'
import { isRecord, makeFail } from './validate'

// 데이터 파일(commission.json)을 검증해 CommissionConfig 로 만드는 로더(loadShop 패턴 미러링).
//
// 원칙:
//  - 의뢰 튜닝 값은 코드 상수가 아니라 별도 데이터 파일(JSON)에 둔다.
//  - JSON은 컴파일 타임 타입 보장이 없으므로 로드 시점에 런타임 검증으로 형태를 강제한다.
//  - 구조뿐 아니라 *의미*도 검증한다(min ≤ max, 양수 등) — reducer(commissionQueue)가 전제하는 불변을
//    로드 시점에 보장해, 잘못 편집된 JSON 이 조용히 이상 동작하지 않고 즉시 실패하게 한다.
//
// 출제 itemId 무결성(load-bearing): 버킷의 모든 itemId 는 "판매 가능한 검 또는 아이템 카탈로그"에
// 존재해야 한다. DataManager 가 그 집합(knownItemIds = 판매 가능 검 ∪ 카탈로그)을 주입한다 —
// 이는 commissionQueue 의 런타임 sellPrice 필터를 로드 시점으로 옮긴 것으로, sword_1(판매 불가) 출제 →
// "무한 골드" 익스플로잇을 차단한다. 동시에 미지의(오타) itemId 도 여기서 즉시 실패한다.
//
// 상점 티어(load-bearing): tiers[] 의 인덱스가 곧 상점 레벨이다(tiers[0] = 시작 티어). 시작 티어는
// upgradeCost 가 없어야(null) 하고, 그 외 모든 티어는 upgradeCost(골드 또는 아이템 — 거래 비용과 같은
// 체계)가 있어야 한다. 셀렉터(commissionStore.currentTier)가 tiers[shopLevel] 로 담당 티어를 고르고,
// 상점 카드가 tiers[shopLevel + 1].upgradeCost 를 다음 업그레이드 비용으로 쓰는 전제다.
//
// parseCommissionConfig 는 순수 함수로 분리해 테스트 가능하게 두고, loadCommission 이 번들 데이터의 진입점이다.

const fail: (msg: string) => never = makeFail('Commission config')

// 유한 숫자 필드 추출(누락·비숫자·NaN·Infinity 거부).
function num(raw: Record<string, unknown>, key: string): number {
  const v = raw[key]
  if (typeof v !== 'number' || !Number.isFinite(v))
    fail(`${key} must be a finite number`)
  return v
}

// 정수이며 최소값 이상인 필드("개수/밀리초"는 정수가 자연스럽다).
function intAtLeast(
  raw: Record<string, unknown>,
  key: string,
  min: number,
): number {
  const v = num(raw, key)
  if (!Number.isInteger(v)) fail(`${key} must be an integer`)
  if (v < min) fail(`${key} must be >= ${min}`)
  return v
}

// 거래 비용 필드 파싱(items[] 항목과 상점 upgradeCost 가 공유하는 "같은 체계"):
//  - costKind 누락 시 'item'(기존 납품형 항목 호환). 'gold' 면 costAmount(정수 >= 1),
//    'item' 이면 itemId(출제 가능 집합에 존재) + requiredCount(정수 >= 1, 누락 시 1).
// 반환은 로더 내부 표현(costKind 구분 필드) — 항목은 그대로 싣고, 상점 비용은 toTradeCost 로 Material 화한다.
type ParsedCost =
  | { costKind: 'item'; itemId: string; requiredCount: number }
  | { costKind: 'gold'; costAmount: number }

function parseCost(
  raw: Record<string, unknown>,
  where: string,
  knownItemIds: ReadonlySet<string>,
): ParsedCost {
  const iint = (key: string, min: number): number => {
    const v = raw[key]
    if (typeof v !== 'number' || !Number.isFinite(v))
      fail(`${where}.${key} must be a finite number`)
    if (!Number.isInteger(v)) fail(`${where}.${key} must be an integer`)
    if (v < min) fail(`${where}.${key} must be >= ${min}`)
    return v
  }
  const costKind = raw.costKind === undefined ? 'item' : raw.costKind
  if (costKind !== 'item' && costKind !== 'gold')
    fail(`${where}.costKind must be 'item' or 'gold'`)
  if (costKind === 'gold')
    return { costKind: 'gold', costAmount: iint('costAmount', 1) }
  const itemId = raw.itemId
  if (typeof itemId !== 'string' || itemId.length === 0)
    fail(`${where}.itemId must be a non-empty string`)
  // load-bearing 무결성: 판매 가능 검 또는 카탈로그 아이템만 지불 가능(sword_1 등 비판매·미지 id 차단).
  if (!knownItemIds.has(itemId))
    fail(`${where}.itemId is not a sellable sword or catalog item: ${itemId}`)
  const requiredCount =
    raw.requiredCount === undefined ? 1 : iint('requiredCount', 1)
  return { costKind: 'item', itemId, requiredCount }
}

// 로더 내부 비용 표현 → 런타임 Material(TradeCost). 상점 업그레이드 비용은 gameStore.fulfillCommission 에
// 그대로 넘기므로 로드 시점에 Material 로 바꿔 둔다(거래 항목은 셸의 commissionPool 이 같은 변환을 한다).
function toTradeCost(c: ParsedCost): TradeCost {
  return c.costKind === 'gold'
    ? { kind: 'gold', amount: c.costAmount }
    : { kind: 'item', itemId: c.itemId, count: c.requiredCount }
}

// 상점 티어 1단계 검증. 업그레이드 비용(upgradeCost) + 카드 아이콘(sprite) + 등장 아이템 목록 + 보상 범위를 검증한다.
// idx 가 0(시작 티어)이면 upgradeCost 는 없어야 하고(null/누락), 그 외 티어는 반드시 있어야 한다.
function parseTier(
  raw: unknown,
  idx: number,
  knownItemIds: ReadonlySet<string>,
): ShopTier {
  const where = `tiers[${idx}]`
  if (!isRecord(raw)) fail(`${where} must be an object`)

  // items: 비어있지 않은 배열. 각 항목은 { itemId, weight > 0, 아이템별 incentive/additive 범위 }.
  const rawItems = raw.items
  if (!Array.isArray(rawItems) || rawItems.length === 0)
    fail(`${where}.items must be a non-empty array`)
  const items: CommissionItemEntry[] = rawItems.map((it, i) => {
    const iw = `${where}.items[${i}]`
    if (!isRecord(it)) fail(`${iw} must be an object`)
    // 항목 컨텍스트를 붙인 숫자 검증 헬퍼.
    const inum = (key: string): number => {
      const v = it[key]
      if (typeof v !== 'number' || !Number.isFinite(v))
        fail(`${iw}.${key} must be a finite number`)
      return v
    }
    // 항목 컨텍스트를 붙인 정수(>= min) 검증 헬퍼 — 수량은 정수가 자연스럽다.
    const iint = (key: string, min: number): number => {
      const v = inum(key)
      if (!Number.isInteger(v)) fail(`${iw}.${key} must be an integer`)
      if (v < min) fail(`${iw}.${key} must be >= ${min}`)
      return v
    }
    const weight = it.weight
    if (typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0)
      fail(`${iw}.weight must be a finite number > 0 (got ${String(weight)})`)

    // 보상 종류 — 누락 시 'gold'(기존 의뢰는 incentive/additive 만 두면 된다).
    const rewardKind = it.rewardKind === undefined ? 'gold' : it.rewardKind
    if (rewardKind !== 'gold' && rewardKind !== 'item')
      fail(`${iw}.rewardKind must be 'gold' or 'item'`)

    // 지불(cost) — 상점 upgradeCost 와 같은 체계(parseCost): 골드(costAmount) 또는 아이템(itemId+requiredCount).
    const costFields = parseCost(it, iw, knownItemIds)
    // 골드 비용(골드로 구매)은 아이템 보상만 허용한다 — 골드 보상은 "납품 아이템"의 기준가가 필요하므로.
    if (costFields.costKind === 'gold' && rewardKind !== 'item')
      fail(
        `${iw}.costKind 'gold' requires rewardKind 'item' (gold reward needs a delivered item's base price)`,
      )

    if (rewardKind === 'item') {
      // 물물교환/구매: 지불하면 rewardItemId 를 rewardItemCount 개 지급.
      const rewardItemId = it.rewardItemId
      if (typeof rewardItemId !== 'string' || rewardItemId.length === 0)
        fail(`${iw}.rewardItemId must be a non-empty string`)
      // 지급 아이템도 출제 집합(판매 가능 검 ∪ 카탈로그 ∪ 상점 지급 아이템)에 있어야 한다.
      if (!knownItemIds.has(rewardItemId))
        fail(
          `${iw}.rewardItemId is not a sellable sword or catalog item: ${rewardItemId}`,
        )
      const rewardItemCount = iint('rewardItemCount', 1)
      return {
        weight,
        ...costFields,
        rewardKind,
        rewardItemId,
        rewardItemCount,
      }
    }

    // 골드 보상: 아이템별 보상 배수/가산 범위(여기 도달하면 costKind 는 항상 'item').
    const incentiveMin = inum('incentiveMin')
    const incentiveMax = inum('incentiveMax')
    const additiveMin = inum('additiveMin')
    const additiveMax = inum('additiveMax')
    if (incentiveMin < 0) fail(`${iw}.incentiveMin must be >= 0`)
    if (incentiveMin > incentiveMax)
      fail(`${iw}.incentiveMin must be <= incentiveMax`)
    if (additiveMin < 0) fail(`${iw}.additiveMin must be >= 0`)
    if (additiveMin > additiveMax)
      fail(`${iw}.additiveMin must be <= additiveMax`)

    return {
      weight,
      ...costFields,
      rewardKind,
      incentiveMin,
      incentiveMax,
      additiveMin,
      additiveMax,
    }
  })

  // 업그레이드 비용. 시작 티어(idx 0)는 비용이 없어야 하고(null/누락), 그 외 티어는 반드시 객체여야 한다.
  // 비용은 items[] 의 지불과 같은 체계(parseCost) — 골드(costAmount) 또는 아이템(itemId+requiredCount).
  const rawCost = raw.upgradeCost
  let upgradeCost: TradeCost | null
  if (idx === 0) {
    if (rawCost !== undefined && rawCost !== null)
      fail(`${where}.upgradeCost must be absent on the first (starting) tier`)
    upgradeCost = null
  } else {
    if (!isRecord(rawCost))
      fail(`${where}.upgradeCost must be an object (gold or item cost)`)
    upgradeCost = toTradeCost(
      parseCost(rawCost, `${where}.upgradeCost`, knownItemIds),
    )
  }

  // 상점 카드 아이콘 파일명(비어있지 않은 문자열). 파일 존재는 로드 시점에 알 수 없으니(브라우저) 테스트가 검증한다.
  const sprite = raw.sprite
  if (typeof sprite !== 'string' || sprite.length === 0)
    fail(`${where}.sprite must be a non-empty string (shop icon file name)`)

  return { upgradeCost, sprite, items }
}

// 순수 검증기: 임의 입력(unknown)을 검증된 CommissionConfig 로 변환한다.
// 글로벌 시스템 파라미터(maxCommissions=세션 크기 / unlockAtLevel / sessionAttempts) + 상점 티어 정의(tiers[])를 검증한다.
// knownItemIds: 출제 가능 itemId 집합(판매 가능 검 ∪ 아이템 카탈로그) — 티어 itemId·업그레이드 비용 무결성 검증에 쓴다.
export function parseCommissionConfig(
  raw: unknown,
  knownItemIds: ReadonlySet<string>,
): CommissionConfig {
  if (!isRecord(raw)) fail('config root must be an object')

  // maxCommissions = 한 세션에 한 번에 출제되는 제안 수(세션 크기). 풀의 서로 다른 항목 수가 이보다 적으면
  // 있는 만큼만 출제하므로(min), 여기서는 1 이상만 강제한다(버킷별 항목 수와의 관계는 강제하지 않는다).
  const maxCommissions = intAtLeast(raw, 'maxCommissions', 1)
  // 제안 활성화 도달 레벨(maxLevelReached 기준). 정수 >= 0(0 = 처음부터 활성). 다른 글로벌 필드와 같이
  // 필수+검증으로 둔다 — 누락/오타가 조용히 0(항상 활성)으로 새지 않고 로드 시점에 즉시 실패하게.
  const unlockAtLevel = intAtLeast(raw, 'unlockAtLevel', 0)
  // 세션 갱신 주기(한 세션이 버티는 강화 시도 횟수). 정수 >= 1 고정값 — 세그먼트 바의 총 칸 수.
  // unlockAtLevel 과 동일하게 필수+검증으로 둬 누락/오타가 조용히 새지 않고 로드 시점에 즉시 실패하게 한다.
  const sessionAttempts = intAtLeast(raw, 'sessionAttempts', 1)

  // tiers: 비어있지 않은 배열. 각 티어는 parseTier 로 검증(인덱스 0 = 시작 티어, 비용 없음 / 그 외 비용 필수).
  const rawTiers = raw.tiers
  if (!Array.isArray(rawTiers) || rawTiers.length === 0)
    fail('tiers must be a non-empty array (starting tier = tiers[0])')
  const tiers = rawTiers.map((t, i) => parseTier(t, i, knownItemIds))

  return { maxCommissions, unlockAtLevel, sessionAttempts, tiers }
}

// 게임 시작 시 호출되는 로드 진입점. 번들된 데이터 파일을 검증해 CommissionConfig 로 만든다.
// knownItemIds 는 DataManager 가 검·아이템 카탈로그 적재 후 만들어 주입한다.
export function loadCommission(
  knownItemIds: ReadonlySet<string>,
): CommissionConfig {
  return parseCommissionConfig(commissionRaw, knownItemIds)
}
