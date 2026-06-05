import { describe, it, expect } from 'vitest'
import {
  goldTextSize,
  hasGoldGlow,
  GOLD_TEXT_MIN_PX,
  GOLD_TEXT_MAX_PX,
  GOLD_GLOW_THRESHOLD,
} from './goldGain'

describe('goldTextSize — 획득 골드 → 글자 크기(순수)', () => {
  it('10000골드(기준점)는 최소 크기', () => {
    expect(goldTextSize(10_000)).toBe(GOLD_TEXT_MIN_PX)
  })

  it('금액이 10배 커질 때마다 3px씩 커진다', () => {
    expect(goldTextSize(100_000)).toBe(GOLD_TEXT_MIN_PX + 3) // +1 decade
    expect(goldTextSize(1_000_000)).toBe(GOLD_TEXT_MIN_PX + 6) // +2 decade
    expect(goldTextSize(10_000_000)).toBe(GOLD_TEXT_MIN_PX + 9) // +3 decade
  })

  it('10000골드 미만은 최소 크기로 포화(하한)', () => {
    expect(goldTextSize(1000)).toBe(GOLD_TEXT_MIN_PX)
    expect(goldTextSize(100)).toBe(GOLD_TEXT_MIN_PX)
    expect(goldTextSize(1)).toBe(GOLD_TEXT_MIN_PX)
  })

  it('천문학적 금액은 최대 크기로 포화(상한)', () => {
    expect(goldTextSize(1e14)).toBe(GOLD_TEXT_MAX_PX)
    expect(goldTextSize(Number.MAX_SAFE_INTEGER)).toBe(GOLD_TEXT_MAX_PX)
  })

  it('0 이하는 최소 크기(연출 가드 — 음수 로그 회피)', () => {
    expect(goldTextSize(0)).toBe(GOLD_TEXT_MIN_PX)
    expect(goldTextSize(-100)).toBe(GOLD_TEXT_MIN_PX)
  })

  it('금액에 대해 단조 비감소', () => {
    const samples = [0, 100, 1000, 10_000, 160_000, 1_000_000, 2_500_000_000]
    for (let i = 1; i < samples.length; i++) {
      expect(goldTextSize(samples[i])).toBeGreaterThanOrEqual(
        goldTextSize(samples[i - 1]),
      )
    }
  })

  it('항상 [MIN, MAX] 범위 안의 정수', () => {
    for (const a of [1, 500, 1234, 99_999, 5_000_000, 9e12]) {
      const s = goldTextSize(a)
      expect(Number.isInteger(s)).toBe(true)
      expect(s).toBeGreaterThanOrEqual(GOLD_TEXT_MIN_PX)
      expect(s).toBeLessThanOrEqual(GOLD_TEXT_MAX_PX)
    }
  })
})

describe('hasGoldGlow — 금색 글로우 임계값(순수)', () => {
  it('임계값(100만) 이상이면 글로우를 켠다', () => {
    expect(hasGoldGlow(GOLD_GLOW_THRESHOLD)).toBe(true)
    expect(hasGoldGlow(1_000_000)).toBe(true)
    expect(hasGoldGlow(2_500_000_000)).toBe(true)
  })

  it('임계값 미만이면 글로우를 끈다', () => {
    expect(hasGoldGlow(GOLD_GLOW_THRESHOLD - 1)).toBe(false)
    expect(hasGoldGlow(999_999)).toBe(false)
    expect(hasGoldGlow(150)).toBe(false)
    expect(hasGoldGlow(0)).toBe(false)
  })
})
