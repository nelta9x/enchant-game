import { describe, it, expect } from 'vitest'
import type { CommissionLevel } from '../data/types'
import { applyXpDelta, swordLevelsFor } from './commissionProgress'

// 레벨 정의 픽스처 — 3개 레벨, 각 xpToNext=100. 검 단계는 레벨당 슬라이딩.
const LEVELS: CommissionLevel[] = [
  { swordLevels: [3, 4, 5], xpToNext: 100 },
  { swordLevels: [4, 5, 6], xpToNext: 100 },
  { swordLevels: [5, 6, 7], xpToNext: 100 },
]

describe('applyXpDelta — 레벨업', () => {
  it('xpToNext 미만이면 같은 레벨에서 누적', () => {
    expect(applyXpDelta(1, 30, 34, LEVELS)).toEqual({ level: 1, xp: 64 })
  })

  it('xpToNext 도달 시 레벨업 + 나머지 이월', () => {
    // L1, xp 80 + 34 = 114 → 100 차감, L2, xp 14.
    expect(applyXpDelta(1, 80, 34, LEVELS)).toEqual({ level: 2, xp: 14 })
  })

  it('보상이 매우 크면 여러 레벨 연쇄 상승', () => {
    // L1, xp 0 + 250 → L1소진(100)→L2소진(100)→L3 xp50.
    expect(applyXpDelta(1, 0, 250, LEVELS)).toEqual({ level: 3, xp: 50 })
  })

  it('최고 레벨에서는 xpToNext 로 cap(더 오를 곳 없음)', () => {
    // L3(최고), xp 90 + 50 = 140 → cap 100.
    expect(applyXpDelta(3, 90, 50, LEVELS)).toEqual({ level: 3, xp: 100 })
  })
})

describe('applyXpDelta — 레벨다운', () => {
  it('xp 가 음수가 되면 한 레벨 내려가 이전 레벨 xpToNext 를 더한다', () => {
    // L2, xp 10 - 30 = -20 → L1, xp 100 + (-20) = 80.
    expect(applyXpDelta(2, 10, -30, LEVELS)).toEqual({ level: 1, xp: 80 })
  })

  it('연쇄 레벨다운', () => {
    // L3, xp 0 - 150 → L2(xp -150+? ) ... -150 → L2: +100 = -50 → L1: +100 = 50.
    expect(applyXpDelta(3, 0, -150, LEVELS)).toEqual({ level: 1, xp: 50 })
  })

  it('레벨 1 바닥 + xp 0 클램프(초반 플레이어 보호)', () => {
    // L1, xp 10 - 50 = -40 → 더 내려갈 곳 없음 → xp 0.
    expect(applyXpDelta(1, 10, -50, LEVELS)).toEqual({ level: 1, xp: 0 })
  })
})

describe('applyXpDelta — 방어', () => {
  it('레벨이 범위 밖이면 클램프 후 적용', () => {
    expect(applyXpDelta(99, 0, 0, LEVELS).level).toBe(3)
    expect(applyXpDelta(0, 0, 0, LEVELS).level).toBe(1)
  })

  it('levels 가 비면 입력 그대로 반환', () => {
    expect(applyXpDelta(2, 30, 50, [])).toEqual({ level: 2, xp: 30 })
  })
})

describe('swordLevelsFor', () => {
  it('해당 레벨의 검 단계 목록', () => {
    expect(swordLevelsFor(1, LEVELS)).toEqual([3, 4, 5])
    expect(swordLevelsFor(3, LEVELS)).toEqual([5, 6, 7])
  })

  it('범위 밖 레벨은 클램프', () => {
    expect(swordLevelsFor(0, LEVELS)).toEqual([3, 4, 5])
    expect(swordLevelsFor(99, LEVELS)).toEqual([5, 6, 7])
  })

  it('levels 가 비면 빈 배열', () => {
    expect(swordLevelsFor(1, [])).toEqual([])
  })
})
