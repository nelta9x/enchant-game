import { describe, it, expect } from 'vitest'
import {
  attempt,
  bootstrapCommissionQueue,
  commissionPool,
  complete,
  emptyCommissionQueue,
  generateOne,
  pickDistinctEntries,
  refresh,
  rollAttempts,
  spawnSession,
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

// 버킷 공통 설정 픽스처 — 갱신 후보를 단일 값(3)으로 두어 rollAttempts 가 결정적이게 한다.
const SETTINGS: BucketSettings = { refreshWeights: [{ value: 3, weight: 1 }] }

const SESSION = 3 // 글로벌 세션 크기(한 세션에 한 번에 출제할 제안 수)

const RNG = () => 0.3 // 상수 — 가중치 동일이라 비복원 추출 순서가 결정적.

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
  } = over
  return {
    weight,
    cost: { kind: 'item', itemId, count: requiredCount },
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

// 불변식: 0 <= attemptsRemaining <= attemptsTotal.
function checkInvariant(s: CommissionQueueState): boolean {
  return s.attemptsRemaining >= 0 && s.attemptsRemaining <= s.attemptsTotal
}

const ids = (s: CommissionQueueState): number[] => s.active.map((c) => c.id)

describe('emptyCommissionQueue', () => {
  it('빈 active + 카운터 0', () => {
    expect(emptyCommissionQueue()).toEqual({
      active: [],
      attemptsRemaining: 0,
      attemptsTotal: 0,
      nextId: 1,
    })
  })
})

describe('bootstrapCommissionQueue — 시작 즉시 첫 세션', () => {
  it('첫 세션을 즉시 채운다(서로 다른 제안 SESSION 개) + 갱신 카운터를 뽑는다', () => {
    const s = bootstrapCommissionQueue(RNG, POOL3, SETTINGS, SESSION)
    expect(s.active).toHaveLength(3)
    expect(new Set(s.active.map((c) => costId(c.cost))).size).toBe(3) // 중복 없음
    // 단일 후보(3) → 총·남은 카운터 모두 3.
    expect(s.attemptsTotal).toBe(3)
    expect(s.attemptsRemaining).toBe(3)
    expect(s.nextId).toBe(4)
    expect(checkInvariant(s)).toBe(true)
  })

  it('풀의 서로 다른 항목이 SESSION 보다 적으면 있는 만큼만(min)', () => {
    const s = bootstrapCommissionQueue(RNG, POOL, SETTINGS, SESSION) // 단일 항목
    expect(s.active).toHaveLength(1)
    expect(s.attemptsTotal).toBeGreaterThan(0)
    expect(checkInvariant(s)).toBe(true)
  })

  it('풀이 비면 0개 + 카운터 0(다음 시도에 재시도)', () => {
    const s = bootstrapCommissionQueue(RNG, [], SETTINGS, SESSION)
    expect(s.active).toHaveLength(0)
    expect(s.attemptsRemaining).toBe(0)
    expect(s.attemptsTotal).toBe(0)
  })
})

describe('rollAttempts — 갱신 카운터 가중 추첨', () => {
  it('단일 후보면 그 value 를 반환한다', () => {
    expect(
      rollAttempts(RNG, { refreshWeights: [{ value: 4, weight: 1 }] }),
    ).toBe(4)
  })

  it('후보 범위(값) 안의 정수를 돌려준다', () => {
    const settings: BucketSettings = {
      refreshWeights: [1, 2, 3, 4, 5].map((value) => ({ value, weight: 1 })),
    }
    const rng = mulberry32(99)
    for (let i = 0; i < 50; i += 1) {
      const v = rollAttempts(rng, settings)
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(1)
      expect(v).toBeLessThanOrEqual(5)
    }
  })

  it('weight 가 큰 후보가 더 자주 나온다(분포 방향)', () => {
    const settings: BucketSettings = {
      refreshWeights: [
        { value: 1, weight: 1 },
        { value: 5, weight: 9 },
      ],
    }
    const rng = mulberry32(7)
    let heavy = 0
    let light = 0
    for (let i = 0; i < 500; i += 1) {
      if (rollAttempts(rng, settings) === 5) heavy += 1
      else light += 1
    }
    expect(heavy).toBeGreaterThan(light)
  })

  it('같은 시드는 같은 값', () => {
    const settings: BucketSettings = {
      refreshWeights: [
        { value: 1, weight: 1 },
        { value: 5, weight: 1 },
      ],
    }
    expect(rollAttempts(mulberry32(3), settings)).toBe(
      rollAttempts(mulberry32(3), settings),
    )
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
    const { offers, nextId } = spawnSession(RNG, POOL3, 3, 5)
    expect(offers).toHaveLength(3)
    expect(offers.map((o) => o.id)).toEqual([5, 6, 7])
    expect(nextId).toBe(8)
    expect(new Set(offers.map((o) => costId(o.cost))).size).toBe(3) // 중복 없음
  })

  it('풀의 항목이 적으면 있는 만큼만 출제한다(short session)', () => {
    // 단일 항목 풀 → 1개.
    expect(spawnSession(RNG, POOL, 3, 1).offers).toHaveLength(1)
    // 서로 다른 2개 풀, sessionSize 3 → 2개(min). 중복 없이.
    const twoPool = [entry({ itemId: 'a' }), entry({ itemId: 'b' })]
    const { offers } = spawnSession(RNG, twoPool, 3, 1)
    expect(offers).toHaveLength(2)
    expect(new Set(offers.map((o) => costId(o.cost))).size).toBe(2)
  })

  it('풀이 비면 빈 세션', () => {
    expect(spawnSession(RNG, [], 3, 1)).toEqual({
      offers: [],
      nextId: 1,
    })
  })
})

describe('generateOne — 결정적 단건 생성 + 보상 공식(세션 내부 빌딩블록)', () => {
  it('빈 풀이면 null', () => {
    expect(generateOne([], mulberry32(1))).toBeNull()
  })

  it('reward = round((basePrice + additive) * incentive)', () => {
    const c = generateOne(POOL, mulberry32(42))!
    expect(c.cost).toEqual({ kind: 'item', itemId: 'sword_5', count: 1 })
    // incentive 2.0, additive 0 (min==max) → (1000 + 0) * 2 = 2000 (Material 골드)
    expect(c.reward).toEqual({ kind: 'gold', amount: 2000 })
  })

  it('additive 가 incentive 곱하기 전에 더해진다((base+additive)*incentive)', () => {
    const pool = [entry({ additiveMin: 100, additiveMax: 100 })]
    const c = generateOne(pool, mulberry32(7))!
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
    expect(generateOne([a, b], () => 0)!.reward).toEqual({
      kind: 'gold',
      amount: 100,
    })
    // rng=0.6 → r=1.2 → 'b' 선택 → (100+0)*3 = 300
    expect(generateOne([a, b], () => 0.6)!.reward).toEqual({
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
    const c = generateOne(itemPool, mulberry32(42))!
    expect(c.cost).toEqual({
      kind: 'item',
      itemId: 'faded_fluorescent',
      count: 2,
    })
    expect(c.reward).toEqual({ kind: 'item', itemId: 'sword_12', count: 1 })
  })

  it('같은 시드는 같은 결과', () => {
    expect(generateOne(POOL, mulberry32(7))).toEqual(
      generateOne(POOL, mulberry32(7)),
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

describe('refresh — 새 세션 갱신', () => {
  it('세션을 한 번에 출제하고 갱신 카운터를 뽑는다(총=남음)', () => {
    const s = refresh(RNG, POOL3, SETTINGS, SESSION, 1)
    expect(s.active).toHaveLength(3)
    expect(new Set(s.active.map((c) => costId(c.cost))).size).toBe(3)
    expect(s.attemptsTotal).toBe(3) // 단일 후보
    expect(s.attemptsRemaining).toBe(3)
    expect(s.nextId).toBe(4)
    expect(checkInvariant(s)).toBe(true)
  })

  it('카운터는 refreshWeights 후보 범위 안에서 뽑힌다', () => {
    const settings: BucketSettings = {
      refreshWeights: [
        { value: 1, weight: 1 },
        { value: 5, weight: 1 },
      ],
    }
    const s = refresh(mulberry32(5), POOL3, settings, SESSION, 1)
    expect([1, 5]).toContain(s.attemptsTotal)
    expect(s.attemptsRemaining).toBe(s.attemptsTotal)
  })

  it('풀이 비면 빈 세션 + 카운터 0(nextId 유지)', () => {
    const s = refresh(RNG, [], SETTINGS, SESSION, 7)
    expect(s.active).toHaveLength(0)
    expect(s.attemptsRemaining).toBe(0)
    expect(s.attemptsTotal).toBe(0)
    expect(s.nextId).toBe(7)
  })
})

describe('attempt — 강화 시도 반영(차감/갱신)', () => {
  it('카운터가 1보다 크면 1 줄이고 세션은 그대로 둔다', () => {
    const s = refresh(RNG, POOL3, SETTINGS, SESSION, 1) // remaining 3
    const before = ids(s)
    const s2 = attempt(s, RNG, POOL3, SETTINGS, SESSION)
    expect(s2.attemptsRemaining).toBe(2)
    expect(s2.attemptsTotal).toBe(3)
    expect(ids(s2)).toEqual(before) // 같은 세션(ids 동일)
    expect(checkInvariant(s2)).toBe(true)
  })

  it('카운터가 1에서 0으로 떨어지는 시도에 세션을 통째로 갱신한다(새 ids)', () => {
    const s = refresh(RNG, POOL3, SETTINGS, SESSION, 1)
    const one: CommissionQueueState = { ...s, attemptsRemaining: 1 }
    const s2 = attempt(one, RNG, POOL3, SETTINGS, SESSION)
    expect(s2.active).toHaveLength(3)
    // 새 세션이라 id 가 직전 세션과 겹치지 않는다(단조 증가).
    for (const id of ids(s2)) expect(ids(one)).not.toContain(id)
    expect(s2.attemptsRemaining).toBe(s2.attemptsTotal) // 새로 가득
    expect(checkInvariant(s2)).toBe(true)
  })

  it('빈-풀 상태(카운터 0)에서 풀이 차 있으면 다음 시도가 세션을 연다', () => {
    const empty = emptyCommissionQueue() // attemptsRemaining 0
    const s = attempt(empty, RNG, POOL3, SETTINGS, SESSION)
    expect(s.active).toHaveLength(3)
    expect(s.attemptsRemaining).toBe(s.attemptsTotal)
    expect(checkInvariant(s)).toBe(true)
  })
})

describe('complete — 제안 선택 시 세션 카드 전부 제거(바만 남김, 갱신 아님)', () => {
  it('고른 id 가 있으면 세션 카드를 전부 비우고 카운터는 그대로 둔다', () => {
    const s = refresh(RNG, POOL3, SETTINGS, SESSION, 1) // 3개, remaining 3
    const target = s.active[1].id
    const s2 = complete(s, target)
    expect(s2.active).toHaveLength(0) // 고른 것 + 나머지 전부 사라짐
    // 카운터는 불변 — 갱신은 강화 시도로 카운터가 0 이 될 때만(바만 남는다).
    expect(s2.attemptsRemaining).toBe(3)
    expect(s2.attemptsTotal).toBe(3)
    expect(checkInvariant(s2)).toBe(true)
  })

  it('없는 id 는 무변화', () => {
    const s = refresh(RNG, POOL3, SETTINGS, SESSION, 1)
    expect(complete(s, 9999)).toBe(s)
  })
})
