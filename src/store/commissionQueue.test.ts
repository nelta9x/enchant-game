import { describe, it, expect } from 'vitest'
import {
  bootstrapCommissionQueue,
  commissionPool,
  complete,
  emptyCommissionQueue,
  generateOne,
  pickDistinctEntries,
  spawnSession,
  tick,
  type Commission,
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

const SESSION = 3 // 글로벌 세션 크기(한 세션에 한 번에 출제할 제안 수)

const RNG = () => 0.3 // 상수 — min==max 라 보상/타이밍엔 무관. 가중치 동일이라 비복원 추출 순서도 결정적.

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

// 단일 항목 풀(basePrice 1000, incentive 2.0·additive 0 고정 → reward = round(1000*2) = 2000). 결정적 선택.
const POOL: PoolEntry[] = [entry()]

// 서로 다른 항목 3개 풀(비용 itemId 가 a/b/c 로 다름) — 풀 세션(SESSION=3) 검증용.
const POOL3: PoolEntry[] = [
  entry({ itemId: 'a' }),
  entry({ itemId: 'b' }),
  entry({ itemId: 'c' }),
]

// 비용 아이템 id(헬퍼) — PoolEntry/cost 의 납품 itemId(골드 비용이면 'gold').
const costEntryId = (e: PoolEntry): string =>
  e.cost.kind === 'item' ? e.cost.itemId : 'gold'
const costId = (cost: Commission['cost']): string =>
  cost.kind === 'item' ? cost.itemId : 'gold'

function tickState(
  state: CommissionQueueState,
  now: number,
  pool: readonly PoolEntry[] = POOL3,
): CommissionQueueState {
  return tick(state, now, RNG, pool, SETTINGS, SESSION).state
}

// 불변식: tick 후 nextSpawnAt === null ⟺ active.length > 0(세션이 떠 있음).
function checkInvariant(s: CommissionQueueState): boolean {
  return (s.nextSpawnAt === null) === (s.active.length > 0)
}

describe('emptyCommissionQueue', () => {
  it('빈 active + 즉시(now) 첫 세션 예정', () => {
    expect(emptyCommissionQueue(0)).toEqual({
      active: [],
      nextSpawnAt: 0,
      nextId: 1,
    })
  })
})

describe('bootstrapCommissionQueue — 시작 즉시 첫 세션', () => {
  it('첫 세션을 즉시 채운다(서로 다른 제안 SESSION 개) + 타이머 정지(null)', () => {
    const s = bootstrapCommissionQueue(0, RNG, POOL3, SETTINGS, SESSION)
    expect(s.active).toHaveLength(3)
    expect(new Set(s.active.map((c) => costId(c.cost))).size).toBe(3) // 중복 없음
    expect(s.nextSpawnAt).toBeNull() // 세션이 떠 있음
    expect(s.nextId).toBe(4)
    expect(checkInvariant(s)).toBe(true)
  })

  it('풀의 서로 다른 항목이 SESSION 보다 적으면 있는 만큼만(min)', () => {
    const s = bootstrapCommissionQueue(0, RNG, POOL, SETTINGS, SESSION) // 단일 항목
    expect(s.active).toHaveLength(1)
    expect(s.nextSpawnAt).toBeNull()
    expect(checkInvariant(s)).toBe(true)
  })

  it('풀이 비면 0개 + 즉시 재시도(now)', () => {
    const s = bootstrapCommissionQueue(0, RNG, [], SETTINGS, SESSION)
    expect(s.active).toHaveLength(0)
    expect(s.nextSpawnAt).toBe(0)
  })
})

describe('pickDistinctEntries — 비복원 가중 추출(세션 내 중복 제거)', () => {
  it('서로 다른 항목을 count 개 고른다(중복 없음)', () => {
    const picked = pickDistinctEntries(POOL3, RNG, 3)
    expect(picked).toHaveLength(3)
    expect(new Set(picked.map(costEntryId)).size).toBe(3)
  })

  it('count 가 풀 길이보다 크면 풀 길이로 제한된다(short session)', () => {
    expect(pickDistinctEntries(POOL3, RNG, 10)).toHaveLength(3)
    expect(pickDistinctEntries(POOL, RNG, 3)).toHaveLength(1)
  })

  it('빈 풀이면 빈 배열', () => {
    expect(pickDistinctEntries([], RNG, 3)).toEqual([])
  })

  it('가중치를 따른다(첫 픽: rng 가 누적 구간에 떨어진 항목)', () => {
    const a = entry({ itemId: 'a', weight: 1 })
    const b = entry({ itemId: 'b', weight: 3 })
    // total 4. rng=0 → r=0 < 1 → 'a'.
    expect(costEntryId(pickDistinctEntries([a, b], () => 0, 1)[0])).toBe('a')
    // rng=0.3 → r=1.2 → 'a' 구간(1) 지나 'b'.
    expect(costEntryId(pickDistinctEntries([a, b], () => 0.3, 1)[0])).toBe('b')
  })
})

describe('spawnSession — 한 세션 배치 출제', () => {
  it('서로 다른 제안 min(sessionSize, 풀) 개를 한 번에, id 는 startId 부터 단조 증가', () => {
    const { offers, nextId } = spawnSession(0, RNG, POOL3, SETTINGS, 3, 5)
    expect(offers).toHaveLength(3)
    expect(offers.map((o) => o.id)).toEqual([5, 6, 7])
    expect(nextId).toBe(8)
    expect(new Set(offers.map((o) => costId(o.cost))).size).toBe(3) // 중복 없음
    for (const o of offers) {
      expect(o.createdAt).toBe(0)
      expect(o.expiresAt).toBe(100_000) // now + duration(min==max)
    }
  })

  it('풀의 항목이 적으면 있는 만큼만 출제한다(short session)', () => {
    // 단일 항목 풀 → 1개.
    expect(spawnSession(0, RNG, POOL, SETTINGS, 3, 1).offers).toHaveLength(1)
    // 서로 다른 2개 풀, sessionSize 3 → 2개(min). 중복 없이.
    const twoPool = [entry({ itemId: 'a' }), entry({ itemId: 'b' })]
    const { offers } = spawnSession(0, RNG, twoPool, SETTINGS, 3, 1)
    expect(offers).toHaveLength(2)
    expect(new Set(offers.map((o) => costId(o.cost))).size).toBe(2)
  })

  it('풀이 비면 빈 세션', () => {
    expect(spawnSession(0, RNG, [], SETTINGS, 3, 1)).toEqual({
      offers: [],
      nextId: 1,
    })
  })
})

describe('generateOne — 결정적 단건 생성 + 보상 공식(세션 내부 빌딩블록)', () => {
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
    const pool = [entry({ additiveMin: 100, additiveMax: 100 })]
    const c = generateOne(pool, 0, mulberry32(7), SETTINGS)!
    expect(c.reward).toEqual({ kind: 'gold', amount: 2200 }) // (1000 + 100) * 2
  })

  it('incentive/additive 는 선택된 아이템의 범위를 쓴다(아이템별 보상)', () => {
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
    // rng=0.6 → r=1.2 → 'b' 선택 → (100+0)*3 = 300
    expect(generateOne([a, b], 0, () => 0.6, SETTINGS)!.reward).toEqual({
      kind: 'gold',
      amount: 300,
    })
  })

  it('아이템 보상(물물교환): 고정 아이템을 freeze 하고 requiredCount 를 싣는다', () => {
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
})

describe('commissionPool — entries + basePrice 결합', () => {
  const basePriceOf = (id: string): number | undefined =>
    ({ sword_5: 1000, iron_scrap: 50 })[id]
  const inReward = {
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
          { itemId: 'sword_5', requiredCount: 1, weight: 2, ...inReward },
          { itemId: 'iron_scrap', requiredCount: 1, weight: 3, ...inReward },
        ],
        basePriceOf,
      ),
    ).toEqual([
      {
        weight: 2,
        cost: { kind: 'item', itemId: 'sword_5', count: 1 },
        basePrice: 1000,
        ...inReward,
      },
      {
        weight: 3,
        cost: { kind: 'item', itemId: 'iron_scrap', count: 1 },
        basePrice: 50,
        ...inReward,
      },
    ])
  })

  it('basePrice 를 못 구한 항목은 방어적으로 제외한다', () => {
    expect(
      commissionPool(
        [
          { itemId: 'sword_5', requiredCount: 1, weight: 2, ...inReward },
          { itemId: 'unknown', requiredCount: 1, weight: 3, ...inReward },
        ],
        basePriceOf,
      ),
    ).toEqual([
      {
        weight: 2,
        cost: { kind: 'item', itemId: 'sword_5', count: 1 },
        basePrice: 1000,
        ...inReward,
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

describe('tick — 제안 세션 모델', () => {
  it('빈 큐(즉시 예정)에서 첫 tick 에 한 세션이 통째로 등장하고 타이머가 멈춘다', () => {
    const s = tickState(emptyCommissionQueue(0), 0)
    expect(s.active).toHaveLength(3)
    expect(s.nextSpawnAt).toBeNull()
    expect(checkInvariant(s)).toBe(true)
  })

  it('세션이 떠 있는 동안 추가 tick 은 보충하지 않는다(트리클 아님)', () => {
    let s = tickState(emptyCommissionQueue(0), 0) // 세션 3개
    s = tickState(s, 5_000)
    expect(s.active).toHaveLength(3)
    expect(s.nextSpawnAt).toBeNull()
  })

  it('세션이 전부 만료되면 expired 를 반환하고 쿨다운을 세기 시작한다', () => {
    const s = tickState(emptyCommissionQueue(0), 0) // 만료 100000
    const { state: s2, expired } = tick(s, 100_000, RNG, POOL3, SETTINGS, SESSION)
    expect(expired).toHaveLength(3)
    expect(s2.active).toHaveLength(0)
    expect(s2.nextSpawnAt).toBe(110_000) // now + interval(10000)
    expect(checkInvariant(s2)).toBe(true)
  })

  it('쿨다운이 지나면 다음 세션이 시작된다(새 id)', () => {
    let s = tickState(emptyCommissionQueue(0), 0) // ids 1,2,3
    s = tickState(s, 100_000) // 전부 만료 → nextSpawnAt 110000
    expect(s.active).toHaveLength(0)
    s = tickState(s, 110_000) // 쿨다운 끝 → 새 세션
    expect(s.active).toHaveLength(3)
    expect(s.active.map((c) => c.id)).toEqual([4, 5, 6])
    expect(s.nextSpawnAt).toBeNull()
    expect(checkInvariant(s)).toBe(true)
  })

  it('쿨다운 전이면 대기(세션 없음 유지)', () => {
    let s = tickState(emptyCommissionQueue(0), 0)
    s = tickState(s, 100_000) // nextSpawnAt 110000
    s = tickState(s, 105_000) // 아직 전
    expect(s.active).toHaveLength(0)
    expect(s.nextSpawnAt).toBe(110_000)
  })

  it('일부만 만료되면 남은 제안으로 세션이 계속된다(보충/쿨다운 없음)', () => {
    // 항목 a 는 50_000 에 만료, b·c 는 100_000 에 만료(항목별 duration 오버라이드).
    const staggerPool: PoolEntry[] = [
      entry({ itemId: 'a', durationMinMs: 50_000, durationMaxMs: 50_000 }),
      entry({ itemId: 'b' }),
      entry({ itemId: 'c' }),
    ]
    const s = tickState(emptyCommissionQueue(0), 0, staggerPool)
    const { state: s2, expired } = tick(s, 60_000, RNG, staggerPool, SETTINGS, SESSION)
    expect(expired).toHaveLength(1) // a 만 만료
    expect(s2.active).toHaveLength(2) // b·c 남음
    expect(s2.nextSpawnAt).toBeNull() // 세션 계속 — 보충도 쿨다운도 없음
    expect(checkInvariant(s2)).toBe(true)
  })

  it('풀이 비면 세션 시작을 보류한다(즉시 재시도)', () => {
    const s = tickState(emptyCommissionQueue(0), 0, []) // 빈 풀
    expect(s.active).toHaveLength(0)
    expect(s.nextSpawnAt).toBe(0) // 과거 시각 유지 → 다음 tick 재시도
  })
})

describe('complete — 제안 선택 시 세션 전체 종료', () => {
  it('고른 id 가 있으면 세션의 모든 제안을 비운다(하나를 고르면 세션 끝)', () => {
    const s = tickState(emptyCommissionQueue(0), 0) // 3개
    const id = s.active[1].id
    const s2 = complete(s, id)
    expect(s2.active).toHaveLength(0) // 나머지까지 전부 사라짐
    expect(s2.nextSpawnAt).toBeNull() // complete 는 그대로 둠(다음 tick 이 쿨다운)
  })

  it('complete 후 다음 tick 이 쿨다운을 세고, 쿨다운이 지나면 새 세션을 연다', () => {
    const s = tickState(emptyCommissionQueue(0), 0)
    const s2 = complete(s, s.active[0].id)
    const s3 = tickState(s2, 5_000) // 비었고 nextSpawnAt null → 쿨다운 세팅
    expect(s3.active).toHaveLength(0)
    expect(s3.nextSpawnAt).toBe(15_000) // 5000 + interval(10000)
    expect(checkInvariant(s3)).toBe(true)
    const s4 = tickState(s3, 15_000) // 새 세션
    expect(s4.active).toHaveLength(3)
    expect(checkInvariant(s4)).toBe(true)
  })

  it('없는 id 는 무변화', () => {
    const s = tickState(emptyCommissionQueue(0), 0)
    expect(complete(s, 9999)).toBe(s)
  })
})
