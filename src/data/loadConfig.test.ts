import { describe, it, expect } from 'vitest'
import { loadConfig, parseGameConfig } from './loadConfig'

describe('parseGameConfig — 게임 설정 검증(순수)', () => {
  it('정상 입력을 GameConfig 로 변환한다', () => {
    expect(parseGameConfig({ enhanceDelayMs: 500 })).toEqual({
      enhanceDelayMs: 500,
    })
  })

  it('루트가 객체(레코드)가 아니면 실패', () => {
    expect(() => parseGameConfig(null)).toThrow(/config root must be an object/)
    expect(() => parseGameConfig([])).toThrow(/config root must be an object/)
    expect(() => parseGameConfig(42)).toThrow(/config root must be an object/)
  })

  it('enhanceDelayMs 누락·비숫자·NaN·Infinity 면 실패', () => {
    expect(() => parseGameConfig({})).toThrow(/enhanceDelayMs/)
    expect(() => parseGameConfig({ enhanceDelayMs: '500' })).toThrow(
      /enhanceDelayMs/,
    )
    expect(() => parseGameConfig({ enhanceDelayMs: Number.NaN })).toThrow(
      /enhanceDelayMs/,
    )
    expect(() =>
      parseGameConfig({ enhanceDelayMs: Number.POSITIVE_INFINITY }),
    ).toThrow(/enhanceDelayMs/)
  })

  it('enhanceDelayMs 가 정수가 아니거나 음수면 실패', () => {
    expect(() => parseGameConfig({ enhanceDelayMs: 12.5 })).toThrow(
      /enhanceDelayMs/,
    )
    expect(() => parseGameConfig({ enhanceDelayMs: -1 })).toThrow(
      /enhanceDelayMs/,
    )
  })

  it('enhanceDelayMs 0 은 허용(딜레이 없음)', () => {
    expect(parseGameConfig({ enhanceDelayMs: 0 })).toEqual({ enhanceDelayMs: 0 })
  })
})

describe('loadConfig — 번들 데이터 무결성', () => {
  it('실제 config.json 이 검증을 통과한다', () => {
    const cfg = loadConfig()
    expect(Number.isInteger(cfg.enhanceDelayMs)).toBe(true)
    expect(cfg.enhanceDelayMs).toBeGreaterThanOrEqual(0)
  })
})
