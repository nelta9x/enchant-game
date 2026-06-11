import { describe, it, expect } from 'vitest'
import {
  dropTokenCount,
  makeDropTokens,
  MAX_DROP_TOKENS,
  dropAppearSec,
  dropAutoAtSec,
  DROP_FLIGHT_SEC,
  dropLifetimeMs,
} from './drops'

describe('dropTokenCount — 총 드롭 수량 → 흩뿌릴 토큰 수(순수)', () => {
  it('수량만큼(상한 이하) 그대로', () => {
    expect(dropTokenCount(1)).toBe(1)
    expect(dropTokenCount(5)).toBe(5)
    expect(dropTokenCount(MAX_DROP_TOKENS)).toBe(MAX_DROP_TOKENS)
  })

  it('0 이하는 0개(연출 없음)', () => {
    expect(dropTokenCount(0)).toBe(0)
    expect(dropTokenCount(-3)).toBe(0)
  })

  it('상한 MAX_DROP_TOKENS 에서 포화한다(대량 드롭도 대표 토큰만)', () => {
    expect(dropTokenCount(20)).toBe(MAX_DROP_TOKENS)
    expect(dropTokenCount(1000)).toBe(MAX_DROP_TOKENS)
  })
})

describe('makeDropTokens — 흩뿌림 specs(순수·결정적)', () => {
  it('스택 수량을 펼쳐 토큰 1개씩 만들고 itemId 를 보존한다', () => {
    const tokens = makeDropTokens([{ itemId: 'iron_scrap', count: 3 }])
    expect(tokens).toHaveLength(3)
    expect(tokens.every((t) => t.itemId === 'iron_scrap')).toBe(true)
  })

  it('여러 스택을 순서대로 펼친다', () => {
    const tokens = makeDropTokens([
      { itemId: 'iron_scrap', count: 2 },
      { itemId: 'faded_fluorescent', count: 1 },
    ])
    expect(tokens.map((t) => t.itemId)).toEqual([
      'iron_scrap',
      'iron_scrap',
      'faded_fluorescent',
    ])
  })

  it('총 수량이 상한을 넘으면 상한까지만 만든다', () => {
    expect(makeDropTokens([{ itemId: 'iron_scrap', count: 20 }])).toHaveLength(
      MAX_DROP_TOKENS,
    )
  })

  it('빈 입력·0 수량은 토큰이 없다', () => {
    expect(makeDropTokens([])).toHaveLength(0)
    expect(makeDropTokens([{ itemId: 'x', count: 0 }])).toHaveLength(0)
  })

  it('같은 입력은 같은 결과(결정적 — Math.random 없음)', () => {
    const a = makeDropTokens([{ itemId: 'iron_scrap', count: 5 }])
    const b = makeDropTokens([{ itemId: 'iron_scrap', count: 5 }])
    expect(a).toEqual(b)
  })

  it('토큰들은 검 중심 아래(dy>0)에 좌우로 흩어진다(dx 좌·우 모두 존재)', () => {
    const tokens = makeDropTokens([{ itemId: 'iron_scrap', count: 6 }])
    expect(tokens.every((t) => t.dy > 0)).toBe(true)
    expect(tokens.some((t) => t.dx < 0)).toBe(true)
    expect(tokens.some((t) => t.dx > 0)).toBe(true)
  })

  it('토큰 1개는 중앙(dx=0)에 떨어진다', () => {
    const [only] = makeDropTokens([{ itemId: 'iron_scrap', count: 1 }])
    expect(only.dx).toBe(0)
  })

  it('토큰 count 합이 항상 실제 드랍 수량과 같다(수집 시 정확히 그만큼 들어감)', () => {
    for (const total of [1, 2, 5, 8, 10, 15, 20]) {
      const tokens = makeDropTokens([{ itemId: 'iron_scrap', count: total }])
      const sum = tokens.reduce((a, t) => a + t.count, 0)
      expect(sum).toBe(total)
    }
  })

  it('상한 초과 시에도 각 토큰은 최소 1개를 대표한다(빈 토큰 없음)', () => {
    const tokens = makeDropTokens([{ itemId: 'iron_scrap', count: 20 }])
    expect(tokens).toHaveLength(MAX_DROP_TOKENS)
    expect(tokens.every((t) => t.count >= 1)).toBe(true)
    // 20을 8토큰에 고르게: 앞 4개는 3, 뒤 4개는 2 (합 20).
    expect(tokens.map((t) => t.count)).toEqual([3, 3, 3, 3, 2, 2, 2, 2])
  })

  it('상한 이하면 1토큰당 1개를 대표한다', () => {
    const tokens = makeDropTokens([{ itemId: 'iron_scrap', count: 5 }])
    expect(tokens.map((t) => t.count)).toEqual([1, 1, 1, 1, 1])
  })
})

describe('drop 타이밍 — 수명이 자동 수집·비행을 모두 담는다(등장 지연에 비례)', () => {
  // 등장 지연(appearSec)은 매 강화의 버스트 시점에서 도출되므로(무작위), 특정 값이 아니라 관계만 단언한다.
  it.each([0.5, 0.8, 1.1])(
    '전체 수명(ms)이 자동수집 시작 + 비행 시간보다 길다(appearSec=%s)',
    (appearSec) => {
      expect(dropLifetimeMs(appearSec)).toBeGreaterThan(
        (dropAutoAtSec(appearSec) + DROP_FLIGHT_SEC) * 1000,
      )
    },
  )

  it('등장(appear)은 버스트 시점보다 늦다(폭발이 드러난 뒤 떨어진다)', () => {
    for (const burstAtSec of [0.56, 0.7, 0.86]) {
      expect(dropAppearSec(burstAtSec)).toBeGreaterThan(burstAtSec)
    }
  })

  it('버스트가 늦을수록 등장·자동수집·수명이 함께 뒤로 밀린다(단조)', () => {
    const early = dropAppearSec(0.56)
    const late = dropAppearSec(0.86)
    expect(late).toBeGreaterThan(early)
    expect(dropAutoAtSec(late)).toBeGreaterThan(dropAutoAtSec(early))
    expect(dropLifetimeMs(late)).toBeGreaterThan(dropLifetimeMs(early))
  })
})
