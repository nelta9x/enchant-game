import { describe, it, expect } from 'vitest'
import type { CommissionConfig, SwordData } from '../data/types'
import {
  commissionPool,
  complete,
  emptyCommissionQueue,
  generateOne,
  tick,
  type CommissionQueueState,
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

// 테스트용 설정 픽스처. 타이밍을 결정적으로 만들기 위해 duration·interval 의 min==max 로 둔다
// (간격 10s, 지속 100s — 지속 > 2×간격 이라 3개까지 쌓인 뒤 정지하는 흐름을 깔끔히 관찰).
const CONFIG: CommissionConfig = {
  maxCommissions: 3,
  durationMinMs: 100_000,
  durationMaxMs: 100_000,
  incentiveMin: 0.1,
  incentiveMax: 2.0,
  spawnIntervalMinMs: 10_000,
  spawnIntervalMaxMs: 10_000,
  tickIntervalMs: 250,
  xpReward: 34,
  xpPenalty: 20,
  levels: [{ swordLevels: [3, 4, 5], xpToNext: 100 }],
}

const RNG = () => 0.3 // 상수 — duration/interval 은 min==max 라 영향 없고, 검 선택/인센티브만 결정.

function sword(over: Partial<SwordData> = {}): SwordData {
  const level = over.level ?? 5
  return {
    id: `sword_${level}`,
    nextId: `sword_${level + 1}`,
    level,
    nameKey: `sword.${level}.name` as SwordData['nameKey'],
    enhanceCost: { kind: 'gold', amount: 100 },
    successRate: 0.5,
    sellPrice: 1000,
    protectionTickets: 0,
    dropOnFail: null,
    notes: [],
    sprite: 'placeholder.png',
    ...over,
  }
}

const POOL = [sword({ level: 5, sellPrice: 1000 })]

function tickState(
  state: CommissionQueueState,
  now: number,
  pool: readonly SwordData[] = POOL,
): CommissionQueueState {
  return tick(state, now, RNG, pool, CONFIG).state
}

// 불변식: tick 후 nextSpawnAt === null ⟺ active.length === maxCommissions.
function checkInvariant(s: CommissionQueueState): boolean {
  const full = s.active.length === CONFIG.maxCommissions
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

describe('commissionPool — 검 단계 목록 + 판매가 필터', () => {
  const swords = [
    sword({ level: 0, sellPrice: null }),
    sword({ level: 3, sellPrice: 600 }),
    sword({ level: 4, sellPrice: 800 }),
    sword({ level: 5, sellPrice: 1000 }),
    sword({ level: 8, sellPrice: 5000 }),
  ]
  it('swordLevels 에 포함된 단계만 출제', () => {
    expect(
      commissionPool(swords, [3, 4, 5])
        .map((s) => s.level)
        .sort((a, b) => a - b),
    ).toEqual([3, 4, 5])
  })
  it('sellPrice null 검은 제외', () => {
    expect(commissionPool(swords, [0, 3]).map((s) => s.level)).toEqual([3])
  })
  it('빈 목록이면 빈 풀', () => {
    expect(commissionPool(swords, [])).toEqual([])
  })
})

describe('generateOne — 결정적 생성', () => {
  it('빈 풀이면 null', () => {
    expect(generateOne([], 0, mulberry32(1), CONFIG)).toBeNull()
  })
  it('인센티브 범위 + reward + createdAt/expiresAt', () => {
    const now = 1_000
    const c = generateOne(POOL, now, mulberry32(42), CONFIG)!
    expect(c.swordId).toBe('sword_5')
    expect(c.incentive).toBeGreaterThanOrEqual(CONFIG.incentiveMin)
    expect(c.incentive).toBeLessThanOrEqual(CONFIG.incentiveMax)
    expect(c.reward).toBe(Math.round(1000 * (1 + c.incentive)))
    expect(c.createdAt).toBe(now)
    expect(c.expiresAt).toBe(now + CONFIG.durationMinMs) // min==max
  })
  it('같은 시드는 같은 결과', () => {
    expect(generateOne(POOL, 0, mulberry32(7), CONFIG)).toEqual(
      generateOne(POOL, 0, mulberry32(7), CONFIG),
    )
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
    const { state: s2, expired } = tick(s, 100_000, RNG, POOL, CONFIG)
    expect(expired).toHaveLength(1)
    expect(expired[0].id).toBe(s.active[0].id)
    expect(s2.active).toHaveLength(2)
    expect(s2.nextSpawnAt).toBe(110_000) // 재개: now + interval
    expect(checkInvariant(s2)).toBe(true)
  })

  it('재개 후 간격이 지나면 다시 1개 채운다', () => {
    let s = tickState(emptyCommissionQueue(0), 0)
    s = tickState(s, 10_000)
    s = tickState(s, 20_000) // 꽉 참
    s = tickState(s, 100_000) // c1 만료 → 재개(next 110000), active 2
    s = tickState(s, 110_000) // c2 도 만료(exp 110000) → active 1, 그리고 스폰 발화
    expect(s.active.length).toBeGreaterThanOrEqual(1)
    expect(checkInvariant(s)).toBe(true)
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
