import { describe, it, expect } from 'vitest'
import { parseCommissionConfig, loadCommission } from './loadCommission'

// 최소 유효 설정 헬퍼. override 로 개별 필드만 바꿔 검증 경로를 테스트한다.
// parseCommissionConfig 는 unknown 을 받으므로 의도적으로 잘못된 값도 흘려보낼 수 있다.
function cfg(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    maxCommissions: 3,
    durationMinMs: 30_000,
    durationMaxMs: 60_000,
    incentiveMin: 0.1,
    incentiveMax: 2.0,
    spawnIntervalMinMs: 30_000,
    spawnIntervalMaxMs: 120_000,
    tickIntervalMs: 250,
    xpReward: 34,
    xpPenalty: 20,
    levels: [
      { swordLevels: [3, 4, 5], xpToNext: 100 },
      { swordLevels: [4, 5, 6], xpToNext: 110 },
    ],
    ...over,
  }
}

describe('parseCommissionConfig — 구조 검증', () => {
  it('유효한 설정을 그대로 파싱한다', () => {
    expect(parseCommissionConfig(cfg())).toEqual({
      maxCommissions: 3,
      durationMinMs: 30_000,
      durationMaxMs: 60_000,
      incentiveMin: 0.1,
      incentiveMax: 2.0,
      spawnIntervalMinMs: 30_000,
      spawnIntervalMaxMs: 120_000,
      tickIntervalMs: 250,
      xpReward: 34,
      xpPenalty: 20,
      levels: [
        { swordLevels: [3, 4, 5], xpToNext: 100 },
        { swordLevels: [4, 5, 6], xpToNext: 110 },
      ],
    })
  })

  it('루트가 객체가 아니면 throw', () => {
    expect(() => parseCommissionConfig([])).toThrow()
    expect(() => parseCommissionConfig(null)).toThrow()
  })

  it('필드 누락/비숫자/비유한 값은 throw', () => {
    expect(() => parseCommissionConfig(cfg({ xpReward: undefined }))).toThrow()
    expect(() => parseCommissionConfig(cfg({ maxCommissions: 'x' }))).toThrow()
    expect(() => parseCommissionConfig(cfg({ incentiveMax: NaN }))).toThrow()
    expect(() =>
      parseCommissionConfig(cfg({ durationMaxMs: Infinity })),
    ).toThrow()
  })

  it('정수여야 하는 필드에 소수가 오면 throw', () => {
    expect(() => parseCommissionConfig(cfg({ maxCommissions: 2.5 }))).toThrow()
    expect(() => parseCommissionConfig(cfg({ xpPenalty: 8.1 }))).toThrow()
  })
})

describe('parseCommissionConfig — 의미(범위·관계) 검증', () => {
  it('maxCommissions < 1 이면 throw', () => {
    expect(() => parseCommissionConfig(cfg({ maxCommissions: 0 }))).toThrow()
  })

  it('tickIntervalMs <= 0 이면 throw', () => {
    expect(() => parseCommissionConfig(cfg({ tickIntervalMs: 0 }))).toThrow()
  })

  it('음수 경험치/0 이하 간격은 throw', () => {
    expect(() => parseCommissionConfig(cfg({ xpReward: -1 }))).toThrow()
    expect(() => parseCommissionConfig(cfg({ xpPenalty: -1 }))).toThrow()
    expect(() => parseCommissionConfig(cfg({ spawnIntervalMinMs: 0 }))).toThrow()
  })

  it('durationMinMs > durationMaxMs 이면 throw', () => {
    expect(() =>
      parseCommissionConfig(cfg({ durationMinMs: 70_000 })),
    ).toThrow()
  })

  it('spawnIntervalMinMs > spawnIntervalMaxMs 이면 throw', () => {
    expect(() =>
      parseCommissionConfig(cfg({ spawnIntervalMinMs: 130_000 })),
    ).toThrow()
  })

  it('incentiveMin > incentiveMax 이면 throw', () => {
    expect(() => parseCommissionConfig(cfg({ incentiveMin: 3.0 }))).toThrow()
  })

  it('incentiveMin < 0 이면 throw', () => {
    expect(() => parseCommissionConfig(cfg({ incentiveMin: -0.1 }))).toThrow()
  })
})

describe('parseCommissionConfig — levels 검증', () => {
  it('levels 가 비어있거나 배열이 아니면 throw', () => {
    expect(() => parseCommissionConfig(cfg({ levels: [] }))).toThrow()
    expect(() => parseCommissionConfig(cfg({ levels: {} }))).toThrow()
  })

  it('swordLevels 가 비어있으면 throw', () => {
    expect(() =>
      parseCommissionConfig(cfg({ levels: [{ swordLevels: [], xpToNext: 100 }] })),
    ).toThrow()
  })

  it('swordLevels 가 판매 가능 범위(1~27) 밖이면 throw', () => {
    expect(() =>
      parseCommissionConfig(
        cfg({ levels: [{ swordLevels: [0, 1], xpToNext: 100 }] }),
      ),
    ).toThrow() // 0 은 판매가 null(낡은 단검)
    expect(() =>
      parseCommissionConfig(
        cfg({ levels: [{ swordLevels: [27, 28], xpToNext: 100 }] }),
      ),
    ).toThrow() // 28 은 판매가 null(최종 단계)
  })

  it('xpToNext <= 0 이면 throw', () => {
    expect(() =>
      parseCommissionConfig(
        cfg({ levels: [{ swordLevels: [3, 4, 5], xpToNext: 0 }] }),
      ),
    ).toThrow()
  })

  it('swordLevels 에 비정수가 오면 throw', () => {
    expect(() =>
      parseCommissionConfig(
        cfg({ levels: [{ swordLevels: [3.5], xpToNext: 100 }] }),
      ),
    ).toThrow()
  })
})

describe('loadCommission — 번들 데이터 진입점', () => {
  it('실제 commission.json 을 검증해 로드한다', () => {
    const config = loadCommission()
    expect(config.maxCommissions).toBeGreaterThanOrEqual(1)
    expect(config.durationMinMs).toBeLessThanOrEqual(config.durationMaxMs)
    expect(config.incentiveMin).toBeLessThanOrEqual(config.incentiveMax)
    expect(config.levels.length).toBeGreaterThanOrEqual(1)
    // 의뢰 레벨 1 = 검 단계 3,4,5 (요구 사양).
    expect(config.levels[0].swordLevels).toEqual([3, 4, 5])
    // 모든 레벨의 검 단계는 판매 가능 범위(1~27).
    for (const lv of config.levels) {
      for (const sl of lv.swordLevels) {
        expect(sl).toBeGreaterThanOrEqual(1)
        expect(sl).toBeLessThanOrEqual(27)
      }
    }
  })
})
