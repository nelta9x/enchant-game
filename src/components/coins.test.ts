import { describe, it, expect } from 'vitest'
import {
  coinArrivalTimes,
  coinCount,
  COIN_FLIGHT_SEC,
  COIN_STAGGER_SPAN,
  GOLD_PER_COIN,
  MAX_COINS,
  makeCoins,
  relativeCenter,
} from './coins'

describe('coinCount — 판매가 → 코인 수(순수)', () => {
  it('10000골드당 1개(floor)', () => {
    expect(coinCount(35100)).toBe(3)
    expect(coinCount(160000)).toBe(16)
    expect(coinCount(2 * GOLD_PER_COIN)).toBe(2)
  })

  it('판매가가 있으면(>0) 1만 미만이라도 최소 1개', () => {
    expect(coinCount(800)).toBe(1)
    expect(coinCount(9999)).toBe(1)
    expect(coinCount(1)).toBe(1)
  })

  it('판매가 0 이하는 0개(연출 없음)', () => {
    expect(coinCount(0)).toBe(0)
    expect(coinCount(-5)).toBe(0)
  })

  it('상한 MAX_COINS 에서 포화한다', () => {
    expect(coinCount(500_000)).toBe(MAX_COINS)
    expect(coinCount(2_500_000_000)).toBe(MAX_COINS)
  })

  it('판매가에 대해 단조 비감소', () => {
    const samples = [0, 800, 10_000, 35_100, 160_000, 1_000_000, 2_500_000_000]
    for (let i = 1; i < samples.length; i++) {
      expect(coinCount(samples[i])).toBeGreaterThanOrEqual(
        coinCount(samples[i - 1]),
      )
    }
  })
})

describe('makeCoins — 분출 파라미터(순수·결정적)', () => {
  it('요청한 개수만큼 만든다', () => {
    expect(makeCoins(12)).toHaveLength(12)
    expect(makeCoins(MAX_COINS)).toHaveLength(MAX_COINS)
  })

  it('같은 입력은 같은 출력(결정적 — Math.random 미사용)', () => {
    expect(makeCoins(8)).toEqual(makeCoins(8))
  })

  it('0개 이하는 빈 배열', () => {
    expect(makeCoins(0)).toEqual([])
    expect(makeCoins(-3)).toEqual([])
  })

  it('stagger 는 0..COIN_STAGGER_SPAN 범위, 코인마다 다른 각도', () => {
    const coins = makeCoins(10)
    for (const c of coins) {
      expect(c.stagger).toBeGreaterThanOrEqual(0)
      expect(c.size).toBeGreaterThan(0)
    }
    const angles = new Set(coins.map((c) => c.angle))
    expect(angles.size).toBe(coins.length) // 모두 다른 분출 각도
  })
})

describe('coinArrivalTimes — 코인 도착 스케줄(순수)', () => {
  it('개수만큼, 첫 코인은 비행시간 뒤, 단조 증가', () => {
    const times = coinArrivalTimes(5)
    expect(times).toHaveLength(5)
    expect(times[0]).toBeCloseTo(COIN_FLIGHT_SEC) // i=0 → stagger 0 + 비행시간
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeGreaterThan(times[i - 1])
    }
    // 마지막 도착 < 비행시간 + stagger 폭(stagger 는 (i/n) 이라 n 까지 못 미친다)
    expect(times[times.length - 1]).toBeLessThan(
      COIN_FLIGHT_SEC + COIN_STAGGER_SPAN,
    )
  })

  it('0개는 빈 배열', () => {
    expect(coinArrivalTimes(0)).toEqual([])
  })
})

describe('relativeCenter — DOMRect 중심을 오버레이 기준으로 환산(순수)', () => {
  it('origin 좌상단 기준 중심 좌표', () => {
    const rect = { left: 100, top: 50, width: 40, height: 20 }
    const origin = { left: 0, top: 0, width: 500, height: 500 }
    expect(relativeCenter(rect, origin)).toEqual({ x: 120, y: 60 })
  })

  it('origin 이 오프셋(카드 padding 등)을 가지면 그만큼 뺀다', () => {
    const rect = { left: 100, top: 100, width: 20, height: 20 }
    const origin = { left: 21, top: 21, width: 400, height: 400 }
    expect(relativeCenter(rect, origin)).toEqual({ x: 89, y: 89 })
  })
})
