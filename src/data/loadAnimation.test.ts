import { describe, it, expect } from 'vitest'
import { loadAnimation, parseAnimationConfig } from './loadAnimation'

// 유효한 최소 입력(테스트 전반에서 한 필드만 망가뜨려 검증)을 만든다. 합성 값(실제 데이터 아님).
function valid() {
  return {
    hammerImpactMs: 360,
    hammerWindupMs: 140,
    hammerHoldAfterMs: 100,
    hammerFadeoutMs: 120,
    reEnhanceGuardMs: 100,
    shakeBands: [
      { maxLevel: 10, minMs: 100, maxMs: 200 },
      { maxLevel: null, minMs: 500, maxMs: 500 },
    ],
  }
}

describe('parseAnimationConfig — 연출 타이밍 검증(순수)', () => {
  it('정상 입력을 AnimationConfig 로 변환한다', () => {
    expect(parseAnimationConfig(valid())).toEqual(valid())
  })

  it('루트가 객체(레코드)가 아니면 실패', () => {
    expect(() => parseAnimationConfig(null)).toThrow(
      /animation root must be an object/,
    )
    expect(() => parseAnimationConfig([])).toThrow(
      /animation root must be an object/,
    )
    expect(() => parseAnimationConfig(42)).toThrow(
      /animation root must be an object/,
    )
  })

  // 정수 >= 0 제약을 받는 모든 망치 타이밍 필드를 한 표로 검증한다(필드가 늘면 여기에 추가).
  const intFields = [
    'hammerImpactMs',
    'hammerWindupMs',
    'hammerHoldAfterMs',
    'hammerFadeoutMs',
    'reEnhanceGuardMs',
  ] as const
  for (const field of intFields) {
    it(`${field} 누락·비숫자·NaN·Infinity·소수·음수면 실패`, () => {
      const bad = (v: unknown) => ({ ...valid(), [field]: v })
      expect(() => parseAnimationConfig(bad(undefined))).toThrow(field)
      expect(() => parseAnimationConfig(bad('1'))).toThrow(field)
      expect(() => parseAnimationConfig(bad(Number.NaN))).toThrow(field)
      expect(() => parseAnimationConfig(bad(Number.POSITIVE_INFINITY))).toThrow(
        field,
      )
      expect(() => parseAnimationConfig(bad(12.5))).toThrow(field)
      expect(() => parseAnimationConfig(bad(-1))).toThrow(field)
    })
  }

  it('0 은 허용(즉시 발생/딜레이 없음)', () => {
    const cfg = parseAnimationConfig({
      ...valid(),
      hammerImpactMs: 0,
      reEnhanceGuardMs: 0,
    })
    expect(cfg.hammerImpactMs).toBe(0)
    expect(cfg.reEnhanceGuardMs).toBe(0)
  })

  describe('shakeBands — 떨림 레벨 밴드', () => {
    it('비배열·빈배열이면 실패', () => {
      expect(() =>
        parseAnimationConfig({ ...valid(), shakeBands: undefined }),
      ).toThrow(/shakeBands must be a non-empty array/)
      expect(() =>
        parseAnimationConfig({ ...valid(), shakeBands: [] }),
      ).toThrow(/shakeBands must be a non-empty array/)
    })

    it('밴드의 minMs > maxMs 면 실패', () => {
      expect(() =>
        parseAnimationConfig({
          ...valid(),
          shakeBands: [{ maxLevel: null, minMs: 600, maxMs: 100 }],
        }),
      ).toThrow(/minMs must be <= maxMs/)
    })

    it('minMs/maxMs 가 음수·소수·비숫자면 실패', () => {
      for (const bands of [
        [{ maxLevel: null, minMs: -1, maxMs: 100 }],
        [{ maxLevel: null, minMs: 10.5, maxMs: 100 }],
        [{ maxLevel: null, minMs: '1', maxMs: 100 }],
      ]) {
        expect(() =>
          parseAnimationConfig({ ...valid(), shakeBands: bands }),
        ).toThrow(/shakeBands\[0\]/)
      }
    })

    it('maxLevel 이 1 미만 정수면 실패(null 은 허용)', () => {
      expect(() =>
        parseAnimationConfig({
          ...valid(),
          shakeBands: [{ maxLevel: 0, minMs: 100, maxMs: 100 }],
        }),
      ).toThrow(/maxLevel must be an integer >= 1 or null/)
    })

    it('마지막 밴드가 아닌데 maxLevel 이 null 이면 실패(∞ 는 마지막만)', () => {
      expect(() =>
        parseAnimationConfig({
          ...valid(),
          shakeBands: [
            { maxLevel: null, minMs: 100, maxMs: 100 },
            { maxLevel: null, minMs: 200, maxMs: 200 },
          ],
        }),
      ).toThrow(/must not be null \(only the last band/)
    })

    it('maxLevel 이 오름차순이 아니면(겹침/역순) 실패', () => {
      expect(() =>
        parseAnimationConfig({
          ...valid(),
          shakeBands: [
            { maxLevel: 10, minMs: 100, maxMs: 100 },
            { maxLevel: 10, minMs: 200, maxMs: 200 },
            { maxLevel: null, minMs: 300, maxMs: 300 },
          ],
        }),
      ).toThrow(/must be greater than/)
    })

    it('마지막 밴드 maxLevel 이 null 이 아니면 실패(∞ 미커버)', () => {
      expect(() =>
        parseAnimationConfig({
          ...valid(),
          shakeBands: [{ maxLevel: 30, minMs: 100, maxMs: 100 }],
        }),
      ).toThrow(/last shakeBands entry maxLevel must be null/)
    })

    it('단일 밴드(maxLevel null)는 모든 레벨을 덮어 허용', () => {
      const cfg = parseAnimationConfig({
        ...valid(),
        shakeBands: [{ maxLevel: null, minMs: 300, maxMs: 300 }],
      })
      expect(cfg.shakeBands).toHaveLength(1)
      expect(cfg.shakeBands[0].maxLevel).toBeNull()
    })
  })
})

describe('loadAnimation — 번들 데이터 무결성', () => {
  // 튜닝값(밸런스·연출 디테일)은 박지 않고 구조/관계만 검증한다(테스트는 튜닝값 단언 금지 원칙).
  it('실제 animation.json 이 검증을 통과하고 관계 불변식을 지킨다', () => {
    const a = loadAnimation()
    for (const v of [
      a.hammerImpactMs,
      a.hammerWindupMs,
      a.hammerHoldAfterMs,
      a.hammerFadeoutMs,
      a.reEnhanceGuardMs,
    ]) {
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
    }
    // 떨림 밴드: 비어있지 않고, 각 밴드 min<=max·정수>=0, maxLevel 오름차순, 마지막만 null(∞).
    expect(a.shakeBands.length).toBeGreaterThan(0)
    a.shakeBands.forEach((b, i) => {
      expect(Number.isInteger(b.minMs)).toBe(true)
      expect(Number.isInteger(b.maxMs)).toBe(true)
      expect(b.minMs).toBeGreaterThanOrEqual(0)
      expect(b.minMs).toBeLessThanOrEqual(b.maxMs)
      const isLast = i === a.shakeBands.length - 1
      expect(b.maxLevel === null).toBe(isLast)
    })
  })
})
