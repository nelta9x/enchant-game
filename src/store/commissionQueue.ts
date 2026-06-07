// 의뢰(Commission) 큐의 "순수 전이 코어" — 타이머/DataManager/React 의존이 전혀 없다.
// 생성·만료·완료·재생성 전이를 순수 함수로만 표현해 단위 테스트가 결정적이게 한다
// (effectQueue ↔ effectStore 와 같은 분리: 로직은 여기, 시간/데이터는 commissionStore).
//
// 튜닝 설정(CommissionConfig)은 DataManager 가 데이터 파일에서 로드하고, 셸(commissionStore)이
// 이 순수 함수들에 인자로 주입한다(rng·now 주입과 동일 규율) — 그래서 코어는 DataManager 비의존이고
// 테스트는 config 픽스처를 주입해 production 값 변경에 흔들리지 않는다.
//
// 모델 — "단일 스폰 타이머":
//  - active: 현재 화면에 떠 있는 의뢰들(각자 절대 만료 시각 expiresAt). 최대 maxCommissions 개.
//  - nextSpawnAt: 다음 1개가 등장할 절대 시각. null = 타이머 정지(슬롯이 꽉 차 신규 스폰을 멈춤).
//  - 불변식(매 tick 후): nextSpawnAt === null  ⟺  active.length === maxCommissions.
//    즉 자리가 비면 타이머가 돌고(시각 보유), 꽉 차면 멈춘다(null). 만료는 정지와 무관하게 계속 일어난다.
//  - 의뢰는 spawnInterval 간격으로 "1개씩" 등장한다(한 tick 에 1개). 꽉 차면 멈췄다가 한 자리 비면
//    그 시점부터 다시 간격을 세어 1개씩 채운다.
//  - 절대 타임스탬프만 쓰고 카운트다운 감산은 하지 않는다 — 탭 throttle·드리프트에 강하고 now 주입으로 결정적.

import type { CommissionItemEntry, Material } from '../data/types'

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
export type PoolEntry = {
  weight: number
  cost: CommissionCost // 해석된 비용(골드 또는 아이템) — 항목별 고정
  // 선택: 이 항목 전용 시간 제한(없으면 BucketSettings 의 duration 사용).
  durationMinMs?: number
  durationMaxMs?: number
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

// 의뢰 1건 생성에 필요한 버킷 공통 설정 묶음 — 셸이 현재 버킷에서 합성해 주입한다.
// (보상 배수/가산은 아이템별이라 여기 없고 PoolEntry 에 있다. 글로벌 maxCommissions 등도 별도 인자.)
export type BucketSettings = {
  durationMinMs: number
  durationMaxMs: number
  spawnIntervalMinMs: number
  spawnIntervalMaxMs: number
}

export type CommissionQueueState = {
  active: Commission[]
  nextSpawnAt: number | null // 다음 스폰 예정 절대 시각. null = 꽉 차서 정지.
  nextId: number // 다음 의뢰에 부여할 id(1 부터 — 0 은 "없음" 센티넬)
}

// 부트스트랩: 빈 상태 + 즉시(now) 첫 스폰 예정 → 첫 tick 에서 1개가 바로 등장하고, 이후 간격대로 1개씩 채운다.
// (빈 바를 한 간격 내내 방치하지 않으려는 선택 — 첫 1개는 즉시, 나머지는 spawnInterval 간격.)
export function emptyCommissionQueue(now: number): CommissionQueueState {
  return { active: [], nextSpawnAt: now, nextId: 1 }
}

// 시작 부트스트랩: initialSpawnCount 개(max·풀 한도 내)를 시작 시 즉시 채우고, 자리가 남으면 다음 1개를
// spawnInterval 간격 뒤로 예약한다. emptyCommissionQueue 의 "첫 1개 즉시"를 "첫 N개 즉시"로 일반화한 것.
//  - 채운 개수 == max → 정지(nextSpawnAt = null).
//  - 0 < 채운 개수 < max → 다음 1개를 간격 뒤로 예약(nextSpawnAt = now + 간격). 그래서 셸이 부트스트랩
//    직후 tick 을 돌려도 now < nextSpawnAt 이라 추가 스폰이 일어나지 않아 정확히 N개가 유지된다.
//  - 채운 개수 == 0(initialSpawnCount=0 이거나 풀이 비었음) → 즉시 재시도(nextSpawnAt = now) — emptyCommissionQueue 와 동일.
// rng 는 generateOne 4회 + (자리 남을 때) nextSpawnTime 1회 순서로 소비한다(결정성).
export function bootstrapCommissionQueue(
  now: number,
  rng: () => number,
  pool: readonly PoolEntry[],
  settings: BucketSettings,
  maxCommissions: number,
  initialSpawnCount: number,
): CommissionQueueState {
  const target = Math.min(initialSpawnCount, maxCommissions)
  const active: Commission[] = []
  let nextId = 1
  for (let i = 0; i < target; i += 1) {
    const made = generateOne(pool, now, rng, settings)
    if (!made) break // 풀이 비면 만든 만큼만 두고 중단(즉시 재시도 분기로 떨어진다).
    active.push({ ...made, id: nextId })
    nextId += 1
  }

  const nextSpawnAt =
    active.length >= maxCommissions
      ? null
      : active.length === 0
        ? now
        : nextSpawnTime(now, rng, settings)
  return { active, nextSpawnAt, nextId }
}

// 다음 스폰 시각 = now + [spawnIntervalMinMs, spawnIntervalMaxMs] 무작위. rng 1회 소비. 간격은 현재 버킷 설정.
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
    // 아이템별 duration 오버라이드(있으면)를 그대로 옮긴다.
    const dur =
      e.durationMinMs !== undefined
        ? { durationMinMs: e.durationMinMs, durationMaxMs: e.durationMaxMs }
        : {}
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
        ...dur,
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
      ...dur,
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

// 의뢰 1건의 내용 생성(id 제외 — 발급은 tick 이 한다). 풀이 비면 null.
// rng 소비는 가중치 선택 직후 보상 종류로 분기한다(결정성):
//   1) 가중치 선택
//   - 골드 보상: 2) incentive  3) additive  4) duration  (총 4회 — 기존과 동일)
//   - 아이템 보상: 2) duration  (incentive/additive 안 뽑음 — 보상이 고정)
// 골드 보상 = round((basePrice + additive) * incentive), 아이템 보상 = 고정 아이템. 발급 시점에 freeze.
export function generateOne(
  pool: readonly PoolEntry[],
  now: number,
  rng: () => number,
  settings: BucketSettings,
): Omit<Commission, 'id'> | null {
  if (pool.length === 0) return null
  // 1) 가중치 선택 — total*rng() 를 누적 구간에 떨어뜨린다(weight 합 제약 없음).
  const total = pool.reduce((s, e) => s + e.weight, 0)
  let r = rng() * total
  let chosen = pool[pool.length - 1] // 부동소수 오차로 루프가 안 잡으면 마지막으로 폴백.
  for (const e of pool) {
    if (r < e.weight) {
      chosen = e
      break
    }
    r -= e.weight
  }
  // 보상 산정 — 골드는 incentive/additive 를 뽑아 동적 산정, 아이템은 고정.
  let reward: Material
  if (chosen.rewardKind === 'gold') {
    // 2) incentive(보상 배수)  3) additive(보상 가산) — 선택된 아이템의 범위.
    const incentive =
      chosen.incentiveMin + rng() * (chosen.incentiveMax - chosen.incentiveMin)
    const additive =
      chosen.additiveMin + rng() * (chosen.additiveMax - chosen.additiveMin)
    reward = {
      kind: 'gold',
      amount: Math.round((chosen.basePrice + additive) * incentive),
    }
  } else {
    reward = {
      kind: 'item',
      itemId: chosen.rewardItemId,
      count: chosen.rewardItemCount,
    }
  }
  // 시간 제한 → 절대 만료 시각(골드는 4번째, 아이템은 2번째 rng). 항목 전용 duration 이 있으면 그것을 쓴다.
  const durationMinMs = chosen.durationMinMs ?? settings.durationMinMs
  const durationMaxMs = chosen.durationMaxMs ?? settings.durationMaxMs
  const expiresAt =
    now + (durationMinMs + rng() * (durationMaxMs - durationMinMs))
  return {
    cost: chosen.cost,
    reward,
    createdAt: now,
    expiresAt,
  }
}

// 시간 전진. 순서가 중요하다:
//  1) 만료: active 중 now 도달분을 제거(expired 로 반환 — 셸은 단순히 제거만 한다).
//  2) 재개: 만료/완료로 자리가 비어 active < max 인데 타이머가 멈춰(null) 있었다면, 지금부터 다시
//     spawnInterval 을 세기 시작한다(nextSpawnAt = now + 간격). "한 자리 비면 타이머가 다시 돈다".
//  3) 스폰: 타이머가 돌고(시각 보유) now 도달 + 자리 있으면 1개 등장. 등장 후 자리가 남으면 다음 간격을,
//     꽉 차면 정지(null)한다. 풀이 비어 만들지 못하면 시각을 유지하고 다음 tick 에 재시도(보류).
//
// tick 후 불변식: nextSpawnAt === null ⟺ active.length === max.
// 완료(complete)는 active 에서 이미 제거되므로 expired 에 잡히지 않는다(만료/완료 이중계산 없음).
// 백그라운드로 오래 묶여 여러 간격이 지났어도 복귀 tick 에 1개만 스폰한다(상대 스케줄링 — 트리클이 의도).
export function tick(
  state: CommissionQueueState,
  now: number,
  rng: () => number,
  pool: readonly PoolEntry[],
  settings: BucketSettings,
  maxCommissions: number,
): { state: CommissionQueueState; expired: Commission[] } {
  const max = maxCommissions

  // 1) 만료 처리
  const active: Commission[] = []
  const expired: Commission[] = []
  for (const c of state.active) {
    if (now >= c.expiresAt) expired.push(c)
    else active.push(c)
  }

  let nextSpawnAt = state.nextSpawnAt
  let nextId = state.nextId

  // 2) 재개: 자리가 비었는데 멈춰 있었다면(꽉 차서 null) 지금부터 다시 간격을 센다.
  if (nextSpawnAt === null && active.length < max) {
    nextSpawnAt = nextSpawnTime(now, rng, settings)
  }

  // 3) 스폰: 타이머가 돌고 도달 + 자리 있으면 1개 등장(한 tick 에 1개). 재개로 막 세팅된 경우
  //    nextSpawnAt > now 라 이번 tick 엔 발화하지 않는다 → 재개·발화가 같은 tick 에 안 겹친다.
  if (nextSpawnAt !== null && now >= nextSpawnAt && active.length < max) {
    const made = generateOne(pool, now, rng, settings)
    if (made) {
      active.push({ ...made, id: nextId })
      nextId += 1
      // 자리가 남으면 다음 간격을, 꽉 차면 정지.
      nextSpawnAt =
        active.length < max ? nextSpawnTime(now, rng, settings) : null
    }
    // made 가 null(풀 비었음)이면 nextSpawnAt(과거 시각)을 그대로 둬 다음 tick 에 재시도한다.
  } else if (active.length >= max) {
    // 방어: 자리가 없으면 항상 정지(불변식 유지).
    nextSpawnAt = null
  }

  return { state: { active, nextSpawnAt, nextId }, expired }
}

// 의뢰 완료: active 에서 id 를 제거하기만 한다. 자리가 비면 타이머 재개는 다음 tick(≤tickInterval)이 처리한다
// (nextSpawnAt 을 읽는 곳은 tick 뿐이라 그 사이 불변식의 과도기 위반은 관측되지 않는다). 없는 id 면 무변화.
export function complete(
  state: CommissionQueueState,
  id: number,
): CommissionQueueState {
  if (!state.active.some((c) => c.id === id)) return state
  return { ...state, active: state.active.filter((c) => c.id !== id) }
}
