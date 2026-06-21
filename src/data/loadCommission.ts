import commissionRaw from '../../public/data/commission.json'
import type {
  CommissionConfig,
  CommissionItemEntry,
  GoldBucket,
  RefreshWeight,
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
// 골드 버킷 커버리지(load-bearing): buckets[] 는 보유 골드 [0, ∞) 를 빈틈·겹침 없이 덮어야 한다 —
// 첫 버킷 minGold=0, 연속(buckets[i].minGold === buckets[i-1].maxGold), 마지막 maxGold=null(=∞).
// 셀렉터(commissionStore.currentBucket)가 maxGold 만으로 담당 버킷을 고를 수 있게 하는 전제다.
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

// 골드 버킷 1구간 검증. 담당 골드 구간(minGold/maxGold) + 등장 아이템 목록 + 보상·시간 범위를 검증한다.
function parseBucket(
  raw: unknown,
  idx: number,
  knownItemIds: ReadonlySet<string>,
): GoldBucket {
  const where = `buckets[${idx}]`
  if (!isRecord(raw)) fail(`${where} must be an object`)

  // 버킷 컨텍스트(where)를 붙인 숫자/정수 검증 헬퍼 — 에러 메시지로 어느 버킷·필드인지 즉시 알 수 있게.
  const fnum = (key: string): number => {
    const v = raw[key]
    if (typeof v !== 'number' || !Number.isFinite(v))
      fail(`${where}.${key} must be a finite number`)
    return v
  }
  const fint = (key: string, min: number): number => {
    const v = fnum(key)
    if (!Number.isInteger(v)) fail(`${where}.${key} must be an integer`)
    if (v < min) fail(`${where}.${key} must be >= ${min}`)
    return v
  }

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

    // 지불(cost) 종류 — 누락 시 'item'(기존 납품형 의뢰 호환).
    const costKind = it.costKind === undefined ? 'item' : it.costKind
    if (costKind !== 'item' && costKind !== 'gold')
      fail(`${iw}.costKind must be 'item' or 'gold'`)
    // 골드 비용(골드로 구매)은 아이템 보상만 허용한다 — 골드 보상은 "납품 아이템"의 기준가가 필요하므로.
    if (costKind === 'gold' && rewardKind !== 'item')
      fail(
        `${iw}.costKind 'gold' requires rewardKind 'item' (gold reward needs a delivered item's base price)`,
      )

    // 비용 필드 — 골드 비용은 costAmount(정수 >=1), 아이템 비용은 itemId + requiredCount.
    const costFields:
      | { costKind: 'item'; itemId: string; requiredCount: number }
      | { costKind: 'gold'; costAmount: number } =
      costKind === 'gold'
        ? { costKind: 'gold', costAmount: iint('costAmount', 1) }
        : (() => {
            const itemId = it.itemId
            if (typeof itemId !== 'string' || itemId.length === 0)
              fail(`${iw}.itemId must be a non-empty string`)
            // load-bearing 무결성: 판매 가능 검 또는 카탈로그 아이템만 납품 가능(sword_1 등 비판매·미지 id 차단).
            if (!knownItemIds.has(itemId))
              fail(
                `${iw}.itemId is not a sellable sword or catalog item: ${itemId}`,
              )
            const requiredCount =
              it.requiredCount === undefined ? 1 : iint('requiredCount', 1)
            return { costKind: 'item', itemId, requiredCount }
          })()

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

  // 담당 골드 구간. minGold 는 정수 >= 0. maxGold 는 null(=∞, 마지막 버킷) 또는 정수 >= 1.
  const minGold = fint('minGold', 0)
  const maxGold = raw.maxGold === null ? null : fint('maxGold', 1)

  // refreshWeights: 세션 갱신까지의 강화 시도 횟수 후보(가중 추첨). 비어있지 않은 배열.
  // 각 항목 { value: 정수 >= 1, weight: 유한수 > 0 } — items[] 의 weight 검증 관례를 그대로 따른다.
  const rawWeights = raw.refreshWeights
  if (!Array.isArray(rawWeights) || rawWeights.length === 0)
    fail(`${where}.refreshWeights must be a non-empty array`)
  const refreshWeights: RefreshWeight[] = rawWeights.map((rw, i) => {
    const rwWhere = `${where}.refreshWeights[${i}]`
    if (!isRecord(rw)) fail(`${rwWhere} must be an object`)
    const value = rw.value
    if (typeof value !== 'number' || !Number.isFinite(value))
      fail(`${rwWhere}.value must be a finite number`)
    if (!Number.isInteger(value)) fail(`${rwWhere}.value must be an integer`)
    if (value < 1) fail(`${rwWhere}.value must be >= 1`)
    const weight = rw.weight
    if (typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0)
      fail(
        `${rwWhere}.weight must be a finite number > 0 (got ${String(weight)})`,
      )
    return { value, weight }
  })

  // 의미(범위·관계) 검증 — reducer 가 전제하는 불변.
  if (maxGold !== null && minGold >= maxGold)
    fail(`${where}.minGold must be < maxGold`)

  return {
    minGold,
    maxGold,
    items,
    refreshWeights,
  }
}

// 순수 검증기: 임의 입력(unknown)을 검증된 CommissionConfig 로 변환한다.
// 글로벌 시스템 파라미터(maxCommissions=세션 크기 / unlockAtLevel) + 골드 버킷 정의(buckets[])를 검증한다.
// knownItemIds: 출제 가능 itemId 집합(판매 가능 검 ∪ 아이템 카탈로그) — 버킷 itemId 무결성 검증에 쓴다.
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
  // 제안 강제 갱신 1회 비용(골드). 정수 >= 0(0 = 무료). unlockAtLevel 과 동일하게 필수+검증으로 둬
  // 누락/오타가 조용히 새지 않고 로드 시점에 즉시 실패하게 한다.
  const refreshCost = intAtLeast(raw, 'refreshCost', 0)

  // buckets: 비어있지 않은 배열. 각 버킷은 parseBucket 으로 검증.
  const rawBuckets = raw.buckets
  if (!Array.isArray(rawBuckets) || rawBuckets.length === 0)
    fail('buckets must be a non-empty array (gold 0 bucket = buckets[0])')
  const buckets = rawBuckets.map((b, i) => parseBucket(b, i, knownItemIds))

  // 커버리지 불변: [0, ∞) 를 빈틈·겹침 없이 덮어야 한다(셀렉터가 maxGold 만으로 담당 버킷을 고르는 전제).
  //  - 첫 버킷 minGold === 0.
  //  - 연속: buckets[i].minGold === buckets[i-1].maxGold (앞 버킷 maxGold 가 null 이면 비말단인데 ∞ → 실패).
  //  - 마지막 버킷 maxGold === null(=∞).
  if (buckets[0].minGold !== 0) fail('buckets[0].minGold must be 0')
  for (let i = 1; i < buckets.length; i += 1) {
    const prevMax = buckets[i - 1].maxGold
    if (prevMax === null)
      fail(
        `buckets[${i - 1}].maxGold must not be null (only the last bucket spans to infinity)`,
      )
    if (buckets[i].minGold !== prevMax)
      fail(
        `buckets[${i}].minGold must equal buckets[${i - 1}].maxGold (contiguous, no gap/overlap)`,
      )
  }
  if (buckets[buckets.length - 1].maxGold !== null)
    fail('the last bucket maxGold must be null (spans to infinity)')

  return { maxCommissions, unlockAtLevel, refreshCost, buckets }
}

// 게임 시작 시 호출되는 로드 진입점. 번들된 데이터 파일을 검증해 CommissionConfig 로 만든다.
// knownItemIds 는 DataManager 가 검·아이템 카탈로그 적재 후 만들어 주입한다.
export function loadCommission(
  knownItemIds: ReadonlySet<string>,
): CommissionConfig {
  return parseCommissionConfig(commissionRaw, knownItemIds)
}
