import { describe, it, expect } from 'vitest'
import { loadAnimation, parseAnimationConfig } from './loadAnimation'

// 유효한 최소 입력(테스트 전반에서 한 필드만 망가뜨려 검증)을 만든다.
function valid() {
  return {
    hammerImpactMs: 360,
    weaponShakeMinMs: 200,
    weaponShakeMaxMs: 500,
    reEnhanceGuardMs: 100,
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

  // 정수 >= 0 제약을 받는 모든 타이밍 필드를 한 표로 검증한다(필드가 늘면 여기에 추가).
  const intFields = [
    'hammerImpactMs',
    'weaponShakeMinMs',
    'weaponShakeMaxMs',
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
      hammerImpactMs: 0,
      weaponShakeMinMs: 0,
      weaponShakeMaxMs: 0,
      reEnhanceGuardMs: 0,
    })
    expect(cfg.hammerImpactMs).toBe(0)
    expect(cfg.reEnhanceGuardMs).toBe(0)
  })

  it('떨림 범위의 하한이 상한을 넘으면 실패', () => {
    expect(() =>
      parseAnimationConfig({ ...valid(), weaponShakeMinMs: 600 }),
    ).toThrow(/weaponShakeMinMs must be <= weaponShakeMaxMs/)
  })

  it('하한 == 상한(고정 떨림 시간)은 허용', () => {
    const cfg = parseAnimationConfig({
      ...valid(),
      weaponShakeMinMs: 300,
      weaponShakeMaxMs: 300,
    })
    expect(cfg.weaponShakeMinMs).toBe(300)
    expect(cfg.weaponShakeMaxMs).toBe(300)
  })
})

describe('loadAnimation — 번들 데이터 무결성', () => {
  // 튜닝값(밸런스·연출 디테일)은 박지 않고 구조/관계만 검증한다(테스트는 튜닝값 단언 금지 원칙).
  it('실제 animation.json 이 검증을 통과하고 관계 불변식을 지킨다', () => {
    const a = loadAnimation()
    for (const v of [
      a.hammerImpactMs,
      a.weaponShakeMinMs,
      a.weaponShakeMaxMs,
      a.reEnhanceGuardMs,
    ]) {
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
    }
    expect(a.weaponShakeMinMs).toBeLessThanOrEqual(a.weaponShakeMaxMs)
  })
})
