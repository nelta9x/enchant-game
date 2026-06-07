import { describe, it, expect } from 'vitest'
import {
  bootstrapCommissionQueue,
  commissionPool,
  complete,
  emptyCommissionQueue,
  generateOne,
  tick,
  type CommissionQueueState,
  type BucketSettings,
  type PoolEntry,
} from './commissionQueue'

// 결정적 PRNG(mulberry32) — enhancer.test 와 동일.
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// 버킷 공통 설정 픽스처(보상 배수/가산은 아이템별이라 여기 없음). 타이밍을 결정적으로 min==max.
const SETTINGS: BucketSettings = {
  durationMinMs: 100_000,
  durationMaxMs: 100_000,
  spawnIntervalMinMs: 10_000,
  spawnIntervalMaxMs: 10_000,
}

const MAX = 3 // 글로벌 maxCommissions
const INITIAL = 2 // 글로벌 initialSpawnCount

const RNG = () => 0.3 // 상수 — min==max 라 보상/타이밍엔 무관, 단일 아이템 풀이라 선택도 고정.

// 골드 보상 PoolEntry 헬퍼 — 아이템 비용(itemId×count)을 cost 로 싣고 incentive/additive 범위를 둔다.
function entry(
  over: {
    itemId?: string
    requiredCount?: number
    weight?: number
    basePrice?: number
    incentiveMin?: number
    incentiveMax?: number
    additiveMin?: number
    additiveMax?: number
    durationMinMs?: number
    durationMaxMs?: number
  } = {},
): PoolEntry {
  const {
    itemId = 'sword_5',
    requiredCount = 1,
    weight = 1,
    basePrice = 1000,
    incentiveMin = 2.0,
    incentiveMax = 2.0,
    additiveMin = 0,
    additiveMax = 0,
    durationMinMs,
    durationMaxMs,
  } = over
  return {
    weight,
    cost: { kind: 'item', itemId, count: requiredCount },
    ...(durationMinMs !== undefined ? { durationMinMs, durationMaxMs } : {}),
    rewardKind: 'gold',
    basePrice,
    incentiveMin,
    incentiveMax,
    additiveMin,
    additiveMax,
  }
}

// 단일 아이템 풀(basePrice 1000, incentive 2.0·additive 0 고정 → reward = round(1000*2) = 2000). 결정적 선택.
const POOL: PoolEntry[] = [entry()]

function tickState(
  state: CommissionQueueState,
  now: number,
  pool: readonly PoolEntry[] = POOL,
): CommissionQueueState {
  return tick(state, now, RNG, pool, SETTINGS, MAX).state
}

// 불변식: tick 후 nextSpawnAt === null ⟺ active.length === maxCommissions.
function checkInvariant(s: CommissionQueueState): boolean {
  const full = s.active.length === MAX
  return (s.nextSpawnAt === null) === full
}

describe('emptyCommissionQueue', () => {
  it('빈 active + 즉시(now) 첫 스폰 예정', () => {
    expect(emptyCommissionQueue(0)).toEqual({
      active: [],
      nextSpawnAt: 0,
      nextId: 1,
    })
  })
})

describe('bootstrapCommissionQueue — 시작 시 initialSpawnCount 개 즉시', () => {
  it('initialSpawnCount(2) 개를 즉시 채우고 다음 1개를 간격 뒤로 예약한다', () => {
    const s = bootstrapCommissionQueue(0, RNG, POOL, SETTINGS, MAX, INITIAL)
    expect(s.active).toHaveLength(2) // 시작 시 2개
    expect(s.nextId).toBe(3)
    expect(s.nextSpawnAt).toBe(10_000) // 자리 남음(2<3) → now + interval
    expect(checkInvariant(s)).toBe(true)
  })

  it('부트스트랩 직후 tick 은 추가 스폰하지 않아 정확히 N개가 유지된다', () => {
    // 셸(start)의 "bootstrap → 즉시 _tick" 시퀀스 재현 — now 그대로 tick.
    const s = tickState(
      bootstrapCommissionQueue(0, RNG, POOL, SETTINGS, MAX, INITIAL),
      0,
    )
    expect(s.active).toHaveLength(2) // nextSpawnAt(10_000) > now(0) 라 무발화
  })

  it('initialSpawnCount 가 max 와 같으면 가득 채우고 정지한다', () => {
    const s = bootstrapCommissionQueue(0, RNG, POOL, SETTINGS, MAX, MAX)
    expect(s.active).toHaveLength(MAX)
    expect(s.nextSpawnAt).toBeNull() // 꽉 차서 정지
  })

  it('initialSpawnCount=0 이면 즉시(now) 첫 스폰 예정만 둔다(emptyCommissionQueue 와 동일)', () => {
    const s = bootstrapCommissionQueue(0, RNG, POOL, SETTINGS, MAX, 0)
    expect(s.active).toHaveLength(0)
    expect(s.nextSpawnAt).toBe(0)
  })

  it('풀이 비면 0 개 + 즉시 재시도(now)', () => {
    const s = bootstrapCommissionQueue(0, RNG, [], SETTINGS, MAX, INITIAL)
    expect(s.active).toHaveLength(0)
    expect(s.nextSpawnAt).toBe(0)
  })
})

describe('commissionPool — entries + basePrice 결합', () => {
  const basePriceOf = (id: string): number | undefined =>
    ({ sword_5: 1000, iron_scrap: 50 })[id]
  // 입력(CommissionItemEntry)의 아이템 비용·보상종류·incentive/additive 범위.
  const inRange = {
    requiredCount: 1,
    rewardKind: 'gold' as const,
    incentiveMin: 1.0,
    incentiveMax: 2.0,
    additiveMin: 0,
    additiveMax: 100,
  }
  // 출력(PoolEntry)의 보상 부분(비용은 cost 로 분리됨, requiredCount 없음).
  const outReward = {
    rewardKind: 'gold' as const,
    incentiveMin: 1.0,
    incentiveMax: 2.0,
    additiveMin: 0,
    additiveMax: 100,
  }

  it('각 entry 의 비용(아이템)을 cost 로 옮기고 basePrice·incentive/additive 를 싣는다', () => {
    expect(
      commissionPool(
        [
          { itemId: 'sword_5', weight: 2, ...inRange },
          { itemId: 'iron_scrap', weight: 3, ...inRange },
        ],
        basePriceOf,
      ),
    ).toEqual([
      {
        weight: 2,
        cost: { kind: 'item', itemId: 'sword_5', count: 1 },
        basePrice: 1000,
        ...outReward,
      },
      {
        weight: 3,
        cost: { kind: 'item', itemId: 'iron_scrap', count: 1 },
        basePrice: 50,
        ...outReward,
      },
    ])
  })

  it('basePrice 를 못 구한 항목은 방어적으로 제외한다', () => {
    expect(
      commissionPool(
        [
          { itemId: 'sword_5', weight: 2, ...inRange },
          { itemId: 'unknown', weight: 3, ...inRange },
        ],
        basePriceOf,
      ),
    ).toEqual([
      {
        weight: 2,
        cost: { kind: 'item', itemId: 'sword_5', count: 1 },
        basePrice: 1000,
        ...outReward,
      },
    ])
  })

  it('골드 비용(costKind gold) 항목은 cost 를 골드로 싣고 basePrice 조회 없이 통과한다', () => {
    expect(
      commissionPool(
        [
          {
            costKind: 'gold',
            costAmount: 50_000,
            weight: 1,
            rewardKind: 'item',
            rewardItemId: 'sword_12',
            rewardItemCount: 1,
          },
        ],
        basePriceOf,
      ),
    ).toEqual([
      {
        weight: 1,
        cost: { kind: 'gold', amount: 50_000 },
        rewardKind: 'item',
        rewardItemId: 'sword_12',
        rewardItemCount: 1,
      },
    ])
  })

  it('빈 목록이면 빈 풀', () => {
    expect(commissionPool([], basePriceOf)).toEqual([])
  })
})

describe('generateOne — 결정적 생성 + 새 보상 공식', () => {
  it('빈 풀이면 null', () => {
    expect(generateOne([], 0, mulberry32(1), SETTINGS)).toBeNull()
  })

  it('reward = round((basePrice + additive) * incentive), 만료 시각', () => {
    const now = 1_000
    const c = generateOne(POOL, now, mulberry32(42), SETTINGS)!
    expect(c.cost).toEqual({ kind: 'item', itemId: 'sword_5', count: 1 })
    // incentive 2.0, additive 0 (min==max) → (1000 + 0) * 2 = 2000 (Material 골드)
    expect(c.reward).toEqual({ kind: 'gold', amount: 2000 })
    expect(c.createdAt).toBe(now)
    expect(c.expiresAt).toBe(now + SETTINGS.durationMinMs) // min==max
  })

  it('additive 가 incentive 곱하기 전에 더해진다((base+additive)*incentive)', () => {
    // 아이템별 additive 100 고정, incentive 2.0 고정 → (1000 + 100) * 2 = 2200
    const pool = [entry({ additiveMin: 100, additiveMax: 100 })]
    const c = generateOne(pool, 0, mulberry32(7), SETTINGS)!
    expect(c.reward).toEqual({ kind: 'gold', amount: 2200 })
  })

  it('incentive/additive 는 선택된 아이템의 범위를 쓴다(아이템별 보상)', () => {
    // 두 아이템: a 는 incentive 1·additive 0(보상=base), b 는 incentive 3·additive 0(보상=base*3).
    const a = entry({
      itemId: 'a',
      weight: 1,
      basePrice: 100,
      incentiveMin: 1,
      incentiveMax: 1,
    })
    const b = entry({
      itemId: 'b',
      weight: 1,
      basePrice: 100,
      incentiveMin: 3,
      incentiveMax: 3,
    })
    // rng=0 → 'a' 선택 → (100+0)*1 = 100
    expect(generateOne([a, b], 0, () => 0, SETTINGS)!.reward).toEqual({
      kind: 'gold',
      amount: 100,
    })
    // rng=0.6 → r=1.2 → 'b' 선택 → (100+0)*3 = 300 (a 의 범위가 아니라 b 의 범위 적용)
    expect(generateOne([a, b], 0, () => 0.6, SETTINGS)!.reward).toEqual({
      kind: 'gold',
      amount: 300,
    })
  })

  it('아이템 보상(물물교환): 고정 아이템을 freeze 하고 requiredCount 를 싣는다', () => {
    // faded_fluorescent ×2 납품 → sword_12 1개 지급(골드 산정 없음).
    const itemPool: PoolEntry[] = [
      {
        cost: { kind: 'item', itemId: 'faded_fluorescent', count: 2 },
        weight: 1,
        rewardKind: 'item',
        rewardItemId: 'sword_12',
        rewardItemCount: 1,
      },
    ]
    const c = generateOne(itemPool, 1_000, mulberry32(42), SETTINGS)!
    expect(c.cost).toEqual({ kind: 'item', itemId: 'faded_fluorescent', count: 2 })
    expect(c.reward).toEqual({ kind: 'item', itemId: 'sword_12', count: 1 })
    expect(c.expiresAt).toBe(1_000 + SETTINGS.durationMinMs) // min==max
  })

  it('항목 전용 duration 오버라이드가 있으면 버킷 기본값 대신 그 값으로 만료를 잡는다', () => {
    // SETTINGS.duration 은 100_000(min==max)인데, 항목 오버라이드 5_000 이 우선해야 한다.
    const pool: PoolEntry[] = [
      {
        cost: { kind: 'item', itemId: 'x', count: 1 },
        weight: 1,
        durationMinMs: 5_000,
        durationMaxMs: 5_000,
        rewardKind: 'item',
        rewardItemId: 'sword_1',
        rewardItemCount: 1,
      },
    ]
    const c = generateOne(pool, 1_000, mulberry32(1), SETTINGS)!
    expect(c.expiresAt).toBe(1_000 + 5_000) // 버킷 100_000 이 아니라 항목 5_000
  })

  it('같은 시드는 같은 결과', () => {
    expect(generateOne(POOL, 0, mulberry32(7), SETTINGS)).toEqual(
      generateOne(POOL, 0, mulberry32(7), SETTINGS),
    )
  })

  it('가중치 선택: rng 가 누적 구간에 떨어진 아이템을 고른다', () => {
    const pool: PoolEntry[] = [
      entry({ itemId: 'a', weight: 1, basePrice: 100 }),
      entry({ itemId: 'b', weight: 3, basePrice: 100 }),
    ]
    // total = 4. rng=0 → r=0 < 1 → 'a'(첫 구간).
    expect(generateOne(pool, 0, () => 0, SETTINGS)!.cost).toEqual({
      kind: 'item',
      itemId: 'a',
      count: 1,
    })
    // rng=0.3 → r=1.2; a 구간(1) 지나 b 구간 → 'b'.
    expect(generateOne(pool, 0, () => 0.3, SETTINGS)!.cost).toEqual({
      kind: 'item',
      itemId: 'b',
      count: 1,
    })
    // rng≈1 → 마지막 구간 'b'.
    expect(generateOne(pool, 0, () => 0.999, SETTINGS)!.cost).toEqual({
      kind: 'item',
      itemId: 'b',
      count: 1,
    })
  })
})

describe('tick — 단일 스폰 타이머', () => {
  it('첫 tick 에 1개만 즉시 등장하고 다음 간격을 예약한다', () => {
    const s = tickState(emptyCommissionQueue(0), 0)
    expect(s.active).toHaveLength(1) // 한 번에 1개
    expect(s.nextSpawnAt).toBe(10_000) // now + interval
    expect(checkInvariant(s)).toBe(true)
  })

  it('간격마다 1개씩 등장한다(한 tick 에 1개)', () => {
    let s = tickState(emptyCommissionQueue(0), 0) // active 1, next 10000
    s = tickState(s, 5_000) // 아직 간격 전 → 변화 없음
    expect(s.active).toHaveLength(1)
    s = tickState(s, 10_000) // active 2, next 20000
    expect(s.active).toHaveLength(2)
    expect(s.nextSpawnAt).toBe(20_000)
  })

  it('3개가 꽉 차면 타이머가 멈춘다(nextSpawnAt null)', () => {
    let s = tickState(emptyCommissionQueue(0), 0)
    s = tickState(s, 10_000)
    s = tickState(s, 20_000) // 3번째 → 꽉 참
    expect(s.active).toHaveLength(3)
    expect(s.nextSpawnAt).toBeNull() // 정지
    expect(checkInvariant(s)).toBe(true)
    // 꽉 찬 동안 추가 tick 은 스폰하지 않는다.
    const s2 = tickState(s, 30_000)
    expect(s2.active).toHaveLength(3)
    expect(s2.nextSpawnAt).toBeNull()
  })

  it('한 자리가 비면(만료) 타이머가 다시 돌고 expired 를 반환한다', () => {
    let s = tickState(emptyCommissionQueue(0), 0) // c1 exp 100000
    s = tickState(s, 10_000) // c2 exp 110000
    s = tickState(s, 20_000) // c3 exp 120000, 꽉 참(null)
    // c1 만료 시점(100000)으로 전진.
    const { state: s2, expired } = tick(s, 100_000, RNG, POOL, SETTINGS, MAX)
    expect(expired).toHaveLength(1)
    expect(expired[0].id).toBe(s.active[0].id)
    expect(s2.active).toHaveLength(2)
    expect(s2.nextSpawnAt).toBe(110_000) // 재개: now + interval
    expect(checkInvariant(s2)).toBe(true)
  })

  it('풀이 비면 스폰을 보류한다(nextSpawnAt 유지, 크래시 없음)', () => {
    const s = tickState(emptyCommissionQueue(0), 0, []) // 빈 풀
    expect(s.active).toHaveLength(0)
    expect(s.nextSpawnAt).toBe(0) // 과거 시각 유지 → 다음 tick 재시도
  })

  it('id 는 단조 증가하며 부여된다', () => {
    let s = tickState(emptyCommissionQueue(0), 0)
    s = tickState(s, 10_000)
    s = tickState(s, 20_000)
    expect(s.active.map((c) => c.id)).toEqual([1, 2, 3])
    expect(s.nextId).toBe(4)
  })
})

describe('complete — active 에서 제거', () => {
  it('id 를 제거한다(nextSpawnAt 은 건드리지 않음 — 다음 tick 이 재개 처리)', () => {
    let s = tickState(emptyCommissionQueue(0), 0)
    s = tickState(s, 10_000)
    s = tickState(s, 20_000) // 꽉 참, nextSpawnAt null
    const id = s.active[1].id
    const s2 = complete(s, id)
    expect(s2.active.some((c) => c.id === id)).toBe(false)
    expect(s2.active).toHaveLength(2)
    expect(s2.nextSpawnAt).toBeNull() // complete 는 그대로 둠
    // 다음 tick 이 자리 빔을 감지해 타이머를 재개한다.
    const s3 = tickState(s2, 25_000)
    expect(s3.nextSpawnAt).toBe(35_000) // 25000 + interval
    expect(checkInvariant(s3)).toBe(true)
  })

  it('없는 id 는 무변화', () => {
    const s = tickState(emptyCommissionQueue(0), 0)
    expect(complete(s, 9999)).toBe(s)
  })
})
