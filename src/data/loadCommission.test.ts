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
    respawnDelayMs: 10_000,
    tickIntervalMs: 250,
    minLevel: 8,
    poolLevelBelow: 5,
    poolLevelAbove: 2,
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
      respawnDelayMs: 10_000,
      tickIntervalMs: 250,
      minLevel: 8,
      poolLevelBelow: 5,
      poolLevelAbove: 2,
    })
  })

  it('루트가 객체가 아니면 throw', () => {
    expect(() => parseCommissionConfig([])).toThrow()
    expect(() => parseCommissionConfig(null)).toThrow()
  })

  it('필드 누락/비숫자/비유한 값은 throw', () => {
    expect(() => parseCommissionConfig(cfg({ minLevel: undefined }))).toThrow()
    expect(() => parseCommissionConfig(cfg({ maxCommissions: 'x' }))).toThrow()
    expect(() => parseCommissionConfig(cfg({ incentiveMax: NaN }))).toThrow()
    expect(() =>
      parseCommissionConfig(cfg({ durationMaxMs: Infinity })),
    ).toThrow()
  })

  it('정수여야 하는 필드에 소수가 오면 throw', () => {
    expect(() => parseCommissionConfig(cfg({ maxCommissions: 2.5 }))).toThrow()
    expect(() => parseCommissionConfig(cfg({ minLevel: 8.1 }))).toThrow()
  })
})

describe('parseCommissionConfig — 의미(범위·관계) 검증', () => {
  it('maxCommissions < 1 이면 throw', () => {
    expect(() => parseCommissionConfig(cfg({ maxCommissions: 0 }))).toThrow()
  })

  it('tickIntervalMs <= 0 이면 throw', () => {
    expect(() => parseCommissionConfig(cfg({ tickIntervalMs: 0 }))).toThrow()
  })

  it('음수 레벨/딜레이는 throw', () => {
    expect(() => parseCommissionConfig(cfg({ minLevel: -1 }))).toThrow()
    expect(() => parseCommissionConfig(cfg({ poolLevelBelow: -1 }))).toThrow()
    expect(() => parseCommissionConfig(cfg({ respawnDelayMs: -1 }))).toThrow()
  })

  it('durationMinMs > durationMaxMs 이면 throw', () => {
    expect(() =>
      parseCommissionConfig(cfg({ durationMinMs: 70_000 })),
    ).toThrow()
  })

  it('incentiveMin > incentiveMax 이면 throw', () => {
    expect(() =>
      parseCommissionConfig(cfg({ incentiveMin: 3.0 })),
    ).toThrow()
  })

  it('incentiveMin < 0 이면 throw', () => {
    expect(() => parseCommissionConfig(cfg({ incentiveMin: -0.1 }))).toThrow()
  })
})

describe('loadCommission — 번들 데이터 진입점', () => {
  it('실제 commission.json 을 검증해 로드한다(minLevel >= 0, min <= max)', () => {
    const config = loadCommission()
    expect(config.maxCommissions).toBeGreaterThanOrEqual(1)
    expect(config.durationMinMs).toBeLessThanOrEqual(config.durationMaxMs)
    expect(config.incentiveMin).toBeLessThanOrEqual(config.incentiveMax)
    expect(config.minLevel).toBeGreaterThanOrEqual(0)
  })
})
