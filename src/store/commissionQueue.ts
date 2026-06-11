// 의뢰(Commission)·제안 큐의 "순수 전이 코어" — 타이머/DataManager/React 의존이 전혀 없다.
// 세션 시작·만료·완료·재시작 전이를 순수 함수로만 표현해 단위 테스트가 결정적이게 한다
// (effectQueue ↔ effectStore 와 같은 분리: 로직은 여기, 시간/데이터는 commissionStore).
//
// 튜닝 설정(CommissionConfig)은 DataManager 가 데이터 파일에서 로드하고, 셸(commissionStore)이
// 이 순수 함수들에 인자로 주입한다(rng·now 주입과 동일 규율) — 그래서 코어는 DataManager 비의존이고
// 테스트는 config 픽스처를 주입해 production 값 변경에 흔들리지 않는다.
//
// 모델 — "제안 세션(배치)":
//  - active: 현재 화면에 떠 있는 한 세션의 제안들. 세션이 시작되면 서로 다른 제안 sessionSize 개를 "한 번에"
//    출제한다(풀의 서로 다른 항목 수가 그보다 적으면 있는 만큼만 — min). 세션 내 중복 제안은 없다(비복원 추출).
//  - nextSpawnAt: 다음 세션이 시작될 절대 시각. null = 세션이 떠 있는 동안(타이머 정지).
//  - 불변식(매 tick 후): nextSpawnAt === null  ⟺  active.length > 0.
//    즉 세션이 떠 있으면 타이머가 멈추고(null), 비어 있으면(세션 간 쿨다운) 다음 세션 시각을 보유한다.
//  - 세션은 "한 번에" 출제되고 도중에 보충하지 않는다(트리클 아님). 세션의 모든 제안은 하나의 통합 만료 시각
//    (expiresAt)을 공유한다 — 세션 시작 시 버킷 duration 에서 한 번 뽑아 전체 제안에 동일하게 적용한다.
//    따라서 세션은 통째로 같이 만료된다(부분 만료 없음). 카운트다운 UI 도 카드별이 아니라 세션 1개 바로 표현한다.
//  - 세션 종료 = (a) 플레이어가 하나를 선택(complete → 나머지까지 전부 제거) 또는 (b) 통째로 만료. 종료 후
//    active 가 비면 spawnInterval 쿨다운을 세고, 쿨다운이 지나면 다음 세션이 시작된다.
//  - 절대 타임스탬프만 쓰고 카운트다운 감산은 하지 않는다 — 탭 throttle·드리프트에 강하고 now 주입으로 결정적.

import type { CommissionItemEntry, Material } from '../data/types'
import { weightedIndex } from '../lib/weightedPick'

// 거래 비용은 골드 또는 아이템뿐이다('free' 는 강화 비용 전용 — 거래엔 쓰지 않는다).
export type CommissionCost = Exclude<Material, { kind: 'free' }>

// 화면에 떠 있는 거래 1건. 비용·보상·만료는 생성 시점 기준으로 정해져 freeze 된다.
// (생성 후 보유 골드가 바뀌어 다른 버킷이 되어도, 발급된 거래의 비용/보상/만료는 발급 시점 값을 유지한다 → freeze.)
//  - cost: 지불(납품)할 것 — Material(골드 또는 아이템). shop price 와 동일 타입 재사용.
//  - reward: 지불 시 받는 것 — Material(골드 계산값 또는 아이템).
export type Commission = {
  id: number
  cost: CommissionCost
  reward: Material
  createdAt: number // 생성 시각(now 기준). 타이머 막대 비율 = (expiresAt - now) / (expiresAt - createdAt).
  expiresAt: number // 절대 만료 시각(now 기준)
}

// 출제 풀 1항목 — 셸이 버킷 items[] 의 비용(cost)을 해석하고 (골드 보상이면) basePrice 를 붙여 만든다.
// 비용/보상 산정값이 아이템별이라 PoolEntry 가 그 값을 들고 다닌다(코어는 DataManager 비의존 유지).
// 시간 제한은 항목별이 아니라 세션 공통(BucketSettings.duration)이다 — 세션의 모든 제안이 같은 만료를 공유한다.
export type PoolEntry = {
  weight: number
  cost: CommissionCost // 해석된 비용(골드 또는 아이템) — 항목별 고정
} & (
  | {
      rewardKind: 'gold'
      basePrice: number
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

// 제안 1건 생성에 필요한 버킷 공통 설정 묶음 — 셸이 현재 버킷에서 합성해 주입한다.
// (보상 배수/가산은 아이템별이라 여기 없고 PoolEntry 에 있다. 세션 크기 등 글로벌도 별도 인자.)
export type BucketSettings = {
  durationMinMs: number
  durationMaxMs: number
  spawnIntervalMinMs: number
  spawnIntervalMaxMs: number
}

export type CommissionQueueState = {
  active: Commission[]
  nextSpawnAt: number | null // 다음 세션 시작 예정 절대 시각. null = 세션이 떠 있음(정지).
  nextId: number // 다음 제안에 부여할 id(1 부터 — 0 은 "없음" 센티넬)
}

// 빈 상태 + 즉시(now) 세션 시작 예정 → 첫 tick 에서 한 세션이 바로 출제되고, 이후는 모델대로 굴러간다.
// (셸 부트스트랩은 bootstrapCommissionQueue 로 시작 즉시 한 세션을 채운다 — 빈 바를 한 쿨다운 내내 두지 않으려는 선택.)
export function emptyCommissionQueue(now: number): CommissionQueueState {
  return { active: [], nextSpawnAt: now, nextId: 1 }
}

// 시작 부트스트랩: 시작 시 첫 세션을 즉시 채운다(제안 sessionSize 개를 한 번에). 풀이 비면 0개 + 즉시 재시도.
// rng 는 spawnSession 의 소비 순서(아래)를 그대로 따른다(결정성).
export function bootstrapCommissionQueue(
  now: number,
  rng: () => number,
  pool: readonly PoolEntry[],
  settings: BucketSettings,
  sessionSize: number,
): CommissionQueueState {
  const { offers, nextId } = spawnSession(
    now,
    rng,
    pool,
    settings,
    sessionSize,
    1,
  )
  if (offers.length > 0) return { active: offers, nextSpawnAt: null, nextId }
  // 풀이 비면(방어) 즉시 재시도 예정만 둔다 — emptyCommissionQueue 와 동일.
  return { active: [], nextSpawnAt: now, nextId: 1 }
}

// 다음 세션(쿨다운) 시각 = now + [spawnIntervalMinMs, spawnIntervalMaxMs] 무작위. rng 1회 소비.
function nextSpawnTime(
  now: number,
  rng: () => number,
  settings: BucketSettings,
): number {
  return (
    now +
    settings.spawnIntervalMinMs +
    rng() * (settings.spawnIntervalMaxMs - settings.spawnIntervalMinMs)
  )
}

// 출제 풀(순수 — DataManager 비의존). 버킷 items[] 의 각 itemId 에 basePrice 를 붙여 PoolEntry[] 로 만든다.
// basePrice 를 못 구한 항목(basePriceOf 가 undefined)은 방어적으로 제외한다 — 로드 검증이 itemId 존재를
// 보장하므로 실제로는 걸리지 않지만(판매 가능 검·카탈로그만 출제 가능), 코어 단독으로도 안전하게 유지한다.
export function commissionPool(
  entries: readonly CommissionItemEntry[],
  basePriceOf: (itemId: string) => number | undefined,
): PoolEntry[] {
  const pool: PoolEntry[] = []
  for (const e of entries) {
    // 비용 해석: 골드 비용(골드로 구매) 또는 아이템 납품.
    const cost: CommissionCost =
      e.costKind === 'gold'
        ? { kind: 'gold', amount: e.costAmount }
        : { kind: 'item', itemId: e.itemId, count: e.requiredCount }
    if (e.rewardKind === 'item') {
      // 아이템 보상은 basePrice 가 필요 없다 — 고정 아이템을 그대로 싣는다(비용은 골드/아이템 무엇이든).
      pool.push({
        weight: e.weight,
        cost,
        rewardKind: 'item',
        rewardItemId: e.rewardItemId,
        rewardItemCount: e.rewardItemCount,
      })
      continue
    }
    // 골드 보상: basePrice 는 "납품 아이템"의 기준가 → 골드 보상은 아이템 비용에만 허용된다(로더 강제).
    // 방어: 골드 비용인데 골드 보상인 항목은 코어 단독에서도 제외(basePrice 없음).
    if (cost.kind !== 'item') continue
    const basePrice = basePriceOf(cost.itemId)
    if (basePrice === undefined) continue
    pool.push({
      weight: e.weight,
      cost,
      rewardKind: 'gold',
      basePrice,
      incentiveMin: e.incentiveMin,
      incentiveMax: e.incentiveMax,
      additiveMin: e.additiveMin,
      additiveMax: e.additiveMax,
    })
  }
  return pool
}

// 가중치 선택 1회(weightedIndex 공유 구현). rng 1회 소비. 빈 풀이면 null(rng 소비 없음).
function selectEntry(
  pool: readonly PoolEntry[],
  rng: () => number,
): PoolEntry | null {
  const idx = weightedIndex(pool, (e) => e.weight, rng)
  return idx < 0 ? null : pool[idx]
}

// 세션 공통 만료 시각 1회 뽑기 — now + [durationMinMs, durationMaxMs] 무작위. rng 1회 소비.
// spawnSession 은 세션당 한 번 호출해 모든 제안에 같은 값을 적용하고(통합 만료), generateOne 은 단건에 적용한다.
function rollExpiry(
  now: number,
  rng: () => number,
  settings: BucketSettings,
): number {
  return (
    now +
    (settings.durationMinMs +
      rng() * (settings.durationMaxMs - settings.durationMinMs))
  )
}

// 주어진 항목으로 제안 1건의 내용(id 제외 — 발급은 호출자가 한다)을 만든다. 선택·만료 뽑기는 하지 않는다
// (항목은 이미 고른 것, expiresAt 는 세션 공통이라 호출자가 rollExpiry 로 한 번 뽑아 주입한다).
// rng 소비(결정성): 골드 보상이면 1) incentive  2) additive (총 2회), 아이템 보상이면 0회(보상 고정).
// 골드 보상 = round((basePrice + additive) * incentive), 아이템 보상 = 고정 아이템. 발급 시점에 freeze.
function makeOffer(
  entry: PoolEntry,
  now: number,
  rng: () => number,
  expiresAt: number,
): Omit<Commission, 'id'> {
  let reward: Material
  if (entry.rewardKind === 'gold') {
    // 1) incentive(보상 배수)  2) additive(보상 가산) — 선택된 아이템의 범위.
    const incentive =
      entry.incentiveMin + rng() * (entry.incentiveMax - entry.incentiveMin)
    const additive =
      entry.additiveMin + rng() * (entry.additiveMax - entry.additiveMin)
    reward = {
      kind: 'gold',
      amount: Math.round((entry.basePrice + additive) * incentive),
    }
  } else {
    reward = {
      kind: 'item',
      itemId: entry.rewardItemId,
      count: entry.rewardItemCount,
    }
  }
  return { cost: entry.cost, reward, createdAt: now, expiresAt }
}

// 제안 1건의 내용 생성(id 제외) — 가중치 선택 + 만료 + 내용. 풀이 비면 null. (단건 생성 진입점 — 테스트·내부용.)
// rng 소비 순서(결정성): 1) selectEntry(가중치 선택)  2) rollExpiry(만료)  3~) makeOffer(보상).
// spawnSession 과 동일한 "선택 → 만료 → 보상" 순서를 따른다(세션은 만료를 한 번만, 여기는 단건이라 1건에).
export function generateOne(
  pool: readonly PoolEntry[],
  now: number,
  rng: () => number,
  settings: BucketSettings,
): Omit<Commission, 'id'> | null {
  const chosen = selectEntry(pool, rng)
  if (chosen === null) return null
  const expiresAt = rollExpiry(now, rng, settings)
  return makeOffer(chosen, now, rng, expiresAt)
}

// 비복원 가중 추출 — 풀에서 서로 다른 항목을 최대 count 개 고른다(세션 내 중복 제거의 핵심).
// 매 픽마다 남은 항목들의 가중치로 하나를 골라(weightedIndex 공유 구현) 빼낸다.
// rng 는 픽 수(min(count, 풀 길이))만큼 소비한다.
// "서로 다른 제안" = 서로 다른 풀 항목(같은 itemId 라도 비용/보상 조합이 다르면 다른 항목 = 다른 선택지).
export function pickDistinctEntries(
  pool: readonly PoolEntry[],
  rng: () => number,
  count: number,
): PoolEntry[] {
  const remaining = pool.slice()
  const chosen: PoolEntry[] = []
  const n = Math.min(count, remaining.length)
  for (let k = 0; k < n; k += 1) {
    const idx = weightedIndex(remaining, (e) => e.weight, rng)
    chosen.push(remaining[idx])
    remaining.splice(idx, 1)
  }
  return chosen
}

// 한 세션 출제: 서로 다른 항목 min(sessionSize, 풀 길이) 개를 골라 각각 제안 1건으로 만든다.
// 세션의 모든 제안은 하나의 통합 만료 시각(expiresAt)을 공유한다 — rollExpiry 를 세션당 한 번만 호출해
// 전체에 같은 값을 적용한다(통합 지속시간 바). rng 소비 순서(결정성):
//   1) pickDistinctEntries 가 픽 수만큼(선택)  2) rollExpiry(세션 공통 만료, 1회)  3) 고른 순서대로 makeOffer(보상).
// 즉 "선택을 먼저 전부 → 만료 1회 → 항목별 보상". 풀이 비면(픽 0개) 만료를 뽑지 않고 빈 세션을 반환한다.
export function spawnSession(
  now: number,
  rng: () => number,
  pool: readonly PoolEntry[],
  settings: BucketSettings,
  sessionSize: number,
  startId: number,
): { offers: Commission[]; nextId: number } {
  const entries = pickDistinctEntries(pool, rng, sessionSize)
  // 빈 풀(픽 0개)이면 만료 rng 를 소비하지 않고 즉시 빈 세션 — 호출자(tick/bootstrap)의 재시도 경로와 결정성 유지.
  if (entries.length === 0) return { offers: [], nextId: startId }
  // 세션 공통 만료를 한 번만 뽑아 모든 제안에 동일하게 적용한다(통합 지속시간).
  const expiresAt = rollExpiry(now, rng, settings)
  const offers: Commission[] = []
  let nextId = startId
  for (const e of entries) {
    offers.push({ ...makeOffer(e, now, rng, expiresAt), id: nextId })
    nextId += 1
  }
  return { offers, nextId }
}

// 시간 전진. 순서가 중요하다:
//  1) 만료: active 중 now 도달분을 제거(expired 로 반환 — 셸은 단순히 제거만 한다).
//  2) 세션이 아직 떠 있으면(active.length > 0) 타이머는 정지(null) 유지 — 도중 보충 없음.
//  3) 세션이 비었으면:
//     - 방금 비었는데(nextSpawnAt === null) 쿨다운을 안 세고 있었다면 지금부터 spawnInterval 을 센다.
//       (만료로 전부 빠졌거나, complete 로 세션이 끝나(active=[], nextSpawnAt=null) 다음 tick 에 들어온 경우)
//     - 쿨다운 시각에 도달(now >= nextSpawnAt)하면 다음 세션을 시작한다(제안 sessionSize 개 한 번에).
//       풀이 비어 못 만들면 즉시(now) 재시도로 둔다.
//     - 아직 쿨다운 전이면 그대로 대기.
//
// tick 후 불변식: nextSpawnAt === null ⟺ active.length > 0.
// 완료(complete)는 세션 전체를 active 에서 비우므로 expired 에 잡히지 않는다(만료/완료 이중계산 없음).
// 백그라운드로 오래 묶여 여러 쿨다운이 지났어도 복귀 tick 에 한 세션만 시작한다(상대 스케줄링).
export function tick(
  state: CommissionQueueState,
  now: number,
  rng: () => number,
  pool: readonly PoolEntry[],
  settings: BucketSettings,
  sessionSize: number,
): { state: CommissionQueueState; expired: Commission[] } {
  // 1) 만료 처리
  const active: Commission[] = []
  const expired: Commission[] = []
  for (const c of state.active) {
    if (now >= c.expiresAt) expired.push(c)
    else active.push(c)
  }

  const nextId = state.nextId

  // 2) 세션이 아직 떠 있으면 타이머 정지 유지.
  if (active.length > 0) {
    return { state: { active, nextSpawnAt: null, nextId }, expired }
  }

  // 3) 세션이 비어 있음 — 쿨다운/시작 처리.
  let nextSpawnAt = state.nextSpawnAt
  if (nextSpawnAt === null) {
    // 방금 비었다(만료 또는 직전 complete) → 지금부터 쿨다운을 센다.
    nextSpawnAt = nextSpawnTime(now, rng, settings)
    return { state: { active, nextSpawnAt, nextId }, expired }
  }
  if (now >= nextSpawnAt) {
    // 쿨다운 끝 → 다음 세션 시작.
    const spawned = spawnSession(now, rng, pool, settings, sessionSize, nextId)
    if (spawned.offers.length > 0) {
      return {
        state: {
          active: spawned.offers,
          nextSpawnAt: null,
          nextId: spawned.nextId,
        },
        expired,
      }
    }
    // 풀이 비어 못 만들면 즉시 재시도(보류) — 다음 tick 에 다시 시도.
    return { state: { active, nextSpawnAt: now, nextId }, expired }
  }
  // 아직 쿨다운 전 — 대기.
  return { state: { active, nextSpawnAt, nextId }, expired }
}

// 제안 선택(세션 종료): 고른 id 가 active 에 있으면 세션 전체(나머지 제안 포함)를 비운다 — "하나를 고르면
// 이번 세션은 끝난다". nextSpawnAt 은 건드리지 않는다(null 유지) → 다음 tick 이 쿨다운을 세서 재시작한다
// (nextSpawnAt 을 읽는 곳은 tick 뿐이라 그 사이 불변식의 과도기 위반은 관측되지 않는다). 없는 id 면 무변화.
export function complete(
  state: CommissionQueueState,
  id: number,
): CommissionQueueState {
  if (!state.active.some((c) => c.id === id)) return state
  return { ...state, active: [] }
}
