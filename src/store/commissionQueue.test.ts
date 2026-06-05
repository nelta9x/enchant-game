import { describe, it, expect } from 'vitest'
import type { CommissionConfig, SwordData } from '../data/types'
import {
  commissionPool,
  complete,
  emptyCommissionQueue,
  generateOne,
  tick,
} from './commissionQueue'

// 결정적 PRNG(mulberry32) — enhancer.test 와 동일. 시드가 같으면 같은 수열이라 생성이 결정적이다.
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// 테스트용 설정 픽스처. minLevel=0 으로 둬 진행도 근처 단언이 production 값(minLevel=8) 변경에 안 깨진다.
// minLevel 바닥은 별도 타깃 테스트에서 검증한다.
const CONFIG: CommissionConfig = {
  maxCommissions: 3,
  durationMinMs: 30_000,
  durationMaxMs: 60_000,
  incentiveMin: 0.1,
  incentiveMax: 2.0,
  respawnDelayMs: 10_000,
  tickIntervalMs: 250,
  minLevel: 0,
  poolLevelBelow: 5,
  poolLevelAbove: 2,
}

// 검 픽스처 — 풀/생성 테스트에 필요한 필드만 채운다.
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

// active + pending 합이 항상 maxCommissions 라는 핵심 불변식.
function totalSlots(s: { active: unknown[]; pending: unknown[] }): number {
  return s.active.length + s.pending.length
}

describe('commissionPool — 진행도 근처 + 판매가 필터', () => {
  const swords = [
    sword({ level: 0, sellPrice: null }), // 낡은 단검(자동 제외)
    sword({ level: 1, sellPrice: 150 }),
    sword({ level: 5, sellPrice: 1000 }),
    sword({ level: 8, sellPrice: 5000 }),
    sword({ level: 15, sellPrice: 50000 }),
    sword({ level: 28, sellPrice: null }), // 최종 단계(자동 제외)
  ]

  it('maxLevel 기준 [maxLevel-5, maxLevel+2] 범위만 포함', () => {
    // maxLevel=8 → [3, 10] → level 5, 8 만.
    const pool = commissionPool(swords, 8, CONFIG)
    expect(pool.map((s) => s.level).sort((a, b) => a - b)).toEqual([5, 8])
  })

  it('sellPrice === null 검은 범위 안이어도 제외(익스플로잇 방지)', () => {
    // maxLevel=2 → [-3, 4] → level 0(null), 1 후보지만 0 은 sellPrice null 로 제외.
    const pool = commissionPool(swords, 2, CONFIG)
    expect(pool.map((s) => s.id)).toEqual(['sword_1'])
  })

  it('자격 검이 없으면 빈 배열', () => {
    expect(commissionPool(swords, 100, CONFIG)).toEqual([])
  })

  it('minLevel 바닥: 그 미만 검은 진행도 범위 안이어도 제외된다', () => {
    // minLevel=8 → maxLevel=8 이면 lo=max(3,8)=8 → level 8 만(5 는 바닥 미만으로 제외).
    const config = { ...CONFIG, minLevel: 8 }
    const pool = commissionPool(swords, 8, config)
    expect(pool.map((s) => s.level)).toEqual([8])
  })

  it('minLevel 바닥: 진행도가 낮아 hi < minLevel 이면 빈 풀(초반 의뢰 없음)', () => {
    // minLevel=8, maxLevel=2 → hi=4 < 8 → 자격 검 없음.
    const config = { ...CONFIG, minLevel: 8 }
    expect(commissionPool(swords, 2, config)).toEqual([])
  })
})

describe('generateOne — 결정적 생성', () => {
  const pool = [sword({ level: 5, sellPrice: 1000 })]

  it('빈 풀이면 null', () => {
    expect(generateOne([], 0, mulberry32(1), CONFIG)).toBeNull()
  })

  it('인센티브는 [min, max], reward = round(sellPrice*(1+incentive)), expiresAt 은 now+[min,max]', () => {
    const now = 1_000_000
    const c = generateOne(pool, now, mulberry32(42), CONFIG)!
    expect(c).not.toBeNull()
    expect(c.swordId).toBe('sword_5')
    expect(c.incentive).toBeGreaterThanOrEqual(CONFIG.incentiveMin)
    expect(c.incentive).toBeLessThanOrEqual(CONFIG.incentiveMax)
    expect(c.reward).toBe(Math.round(1000 * (1 + c.incentive)))
    expect(c.createdAt).toBe(now) // 막대 비율 기준점
    expect(c.expiresAt).toBeGreaterThanOrEqual(now + CONFIG.durationMinMs)
    expect(c.expiresAt).toBeLessThanOrEqual(now + CONFIG.durationMaxMs)
  })

  it('같은 시드는 같은 결과(결정성)', () => {
    const a = generateOne(pool, 0, mulberry32(7), CONFIG)
    const b = generateOne(pool, 0, mulberry32(7), CONFIG)
    expect(a).toEqual(b)
  })
})

describe('tick — 만료/스폰/불변식', () => {
  const pool = [sword({ level: 5, sellPrice: 1000 })]

  it('부트스트랩 후 첫 tick 에 maxCommissions 개가 모두 생성된다', () => {
    const s0 = emptyCommissionQueue(0, CONFIG.maxCommissions)
    expect(totalSlots(s0)).toBe(CONFIG.maxCommissions)
    expect(s0.active).toHaveLength(0)

    const s1 = tick(s0, 0, mulberry32(1), pool, CONFIG)
    expect(s1.active).toHaveLength(CONFIG.maxCommissions)
    expect(s1.pending).toHaveLength(0)
    expect(totalSlots(s1)).toBe(CONFIG.maxCommissions)
  })

  it('만료된 의뢰는 expiresAt + respawnDelay 로 재생성 예약된다', () => {
    const s1 = tick(
      emptyCommissionQueue(0, CONFIG.maxCommissions),
      0,
      mulberry32(1),
      pool,
      CONFIG,
    )
    // 가장 먼저 만료되는 의뢰 시각 직후로 전진.
    const minExpire = Math.min(...s1.active.map((c) => c.expiresAt))
    const s2 = tick(s1, minExpire, mulberry32(2), pool, CONFIG)
    // 만료분은 즉시 재스폰되지 않는다(스폰 시각 = expiresAt + delay > now).
    const expiredCount = s1.active.filter((c) => c.expiresAt <= minExpire).length
    expect(expiredCount).toBeGreaterThanOrEqual(1)
    expect(s2.pending.length).toBe(expiredCount)
    expect(s2.pending).toContain(minExpire + CONFIG.respawnDelayMs)
    expect(totalSlots(s2)).toBe(CONFIG.maxCommissions)
  })

  it('만료 + 스폰이 한 tick 에 겹쳐도 합 불변식 유지', () => {
    let s = tick(
      emptyCommissionQueue(0, CONFIG.maxCommissions),
      0,
      mulberry32(1),
      pool,
      CONFIG,
    )
    // 모든 의뢰가 만료되고 재생성 시각도 지난 시점으로 크게 전진.
    const farFuture = CONFIG.durationMaxMs + CONFIG.respawnDelayMs + 1
    s = tick(s, farFuture, mulberry32(3), pool, CONFIG)
    expect(totalSlots(s)).toBe(CONFIG.maxCommissions)
    expect(s.active).toHaveLength(CONFIG.maxCommissions) // 전부 만료 후 전부 재스폰
  })

  it('풀이 비면 스폰을 보류하고 pending 을 유지한다(크래시 없음)', () => {
    const s = tick(
      emptyCommissionQueue(0, CONFIG.maxCommissions),
      0,
      mulberry32(1),
      [],
      CONFIG,
    )
    expect(s.active).toHaveLength(0)
    expect(s.pending).toHaveLength(CONFIG.maxCommissions)
    expect(totalSlots(s)).toBe(CONFIG.maxCommissions)
  })

  it('id 는 단조 증가하며 부여된다', () => {
    const s = tick(
      emptyCommissionQueue(0, CONFIG.maxCommissions),
      0,
      mulberry32(1),
      pool,
      CONFIG,
    )
    const ids = s.active.map((c) => c.id).sort((a, b) => a - b)
    expect(ids).toEqual([1, 2, 3])
    expect(s.nextId).toBe(4)
  })
})

describe('complete — 완료 후 재생성 예약', () => {
  const pool = [sword({ level: 5, sellPrice: 1000 })]

  it('active 에서 제거하고 now + respawnDelay 스폰 예약', () => {
    const s1 = tick(
      emptyCommissionQueue(0, CONFIG.maxCommissions),
      0,
      mulberry32(1),
      pool,
      CONFIG,
    )
    const id = s1.active[0].id
    const s2 = complete(s1, id, 5_000, CONFIG)
    expect(s2.active.some((c) => c.id === id)).toBe(false)
    expect(s2.active).toHaveLength(CONFIG.maxCommissions - 1)
    expect(s2.pending).toContain(5_000 + CONFIG.respawnDelayMs)
    expect(totalSlots(s2)).toBe(CONFIG.maxCommissions)
  })

  it('없는 id 는 무변화', () => {
    const s1 = tick(
      emptyCommissionQueue(0, CONFIG.maxCommissions),
      0,
      mulberry32(1),
      pool,
      CONFIG,
    )
    expect(complete(s1, 9999, 5_000, CONFIG)).toBe(s1)
  })
})
