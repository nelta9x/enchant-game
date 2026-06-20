import { describe, it, expect } from 'vitest'
import { loadAnimation, parseAnimationConfig } from './loadAnimation'

// 유효한 최소 입력(테스트 전반에서 한 필드만 망가뜨려 검증)을 만든다. 합성 값(실제 데이터 아님).
function valid() {
  return {
    hammerImpactMs: 360,
    hammerSnapMs: 140,
    hammerHoldAfterMs: 100,
    hammerFadeoutMs: 120,
    hammerFaceOffset: { x: -40, y: -10 },
    reEnhanceGuardMs: 100,
    enhanceParticlesEnabled: true,
    hammerSwingEnabled: true,
    hammerSmearEnabled: true,
    particlePoolReserve: { dots: 44, hitSparks: 13, hitLicks: 6 },
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
    'hammerSnapMs',
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

  it('hammerFaceOffset 누락·비객체·비유한수 좌표면 실패(음수·소수는 허용 — px 오프셋)', () => {
    const bad = (v: unknown) => ({ ...valid(), hammerFaceOffset: v })
    expect(() => parseAnimationConfig(bad(undefined))).toThrow(
      /hammerFaceOffset/,
    )
    expect(() => parseAnimationConfig(bad(-40))).toThrow(/hammerFaceOffset/)
    expect(() => parseAnimationConfig(bad({ x: -40 }))).toThrow(
      /hammerFaceOffset\.y/,
    )
    expect(() => parseAnimationConfig(bad({ x: Number.NaN, y: 0 }))).toThrow(
      /hammerFaceOffset\.x/,
    )
    // 부호·소수 제약 없음 — 스프라이트 공간 px 오프셋(우하단 방향이면 양수도 유효).
    const cfg = parseAnimationConfig(bad({ x: 12.5, y: 3 }))
    expect(cfg.hammerFaceOffset).toEqual({ x: 12.5, y: 3 })
  })

  // 연출 on/off 플래그(불리언) — 누락·비불리언이면 실패(플래그가 데이터에 항상 명시되게).
  const boolFields = [
    'enhanceParticlesEnabled',
    'hammerSwingEnabled',
    'hammerSmearEnabled',
  ] as const
  for (const field of boolFields) {
    it(`${field} 누락·비불리언이면 실패, true/false 는 그대로 통과`, () => {
      const bad = (v: unknown) => ({ ...valid(), [field]: v })
      expect(() => parseAnimationConfig(bad(undefined))).toThrow(field)
      expect(() => parseAnimationConfig(bad('true'))).toThrow(field)
      expect(() => parseAnimationConfig(bad(1))).toThrow(field)
      expect(parseAnimationConfig(bad(false))[field]).toBe(false)
      expect(parseAnimationConfig(bad(true))[field]).toBe(true)
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

  describe('particlePoolReserve — 파티클 풀 사전 확보 수', () => {
    it('비객체면 실패', () => {
      expect(() =>
        parseAnimationConfig({ ...valid(), particlePoolReserve: undefined }),
      ).toThrow(/particlePoolReserve must be an object/)
      expect(() =>
        parseAnimationConfig({ ...valid(), particlePoolReserve: 44 }),
      ).toThrow(/particlePoolReserve must be an object/)
    })

    it('dots/hitSparks/hitLicks 가 누락·음수·소수·비숫자면 실패', () => {
      for (const key of ['dots', 'hitSparks', 'hitLicks'] as const) {
        const bad = (v: unknown) => ({
          ...valid(),
          particlePoolReserve: {
            dots: 44,
            hitSparks: 13,
            hitLicks: 6,
            [key]: v,
          },
        })
        expect(() => parseAnimationConfig(bad(undefined))).toThrow(key)
        expect(() => parseAnimationConfig(bad(-1))).toThrow(key)
        expect(() => parseAnimationConfig(bad(1.5))).toThrow(key)
        expect(() => parseAnimationConfig(bad('44'))).toThrow(key)
      }
    })

    it('0 은 허용(사전 확보 없이 lazily 성장 — 이전 동작)', () => {
      const cfg = parseAnimationConfig({
        ...valid(),
        particlePoolReserve: { dots: 0, hitSparks: 0, hitLicks: 0 },
      })
      expect(cfg.particlePoolReserve).toEqual({
        dots: 0,
        hitSparks: 0,
        hitLicks: 0,
      })
    })
  })
})

describe('loadAnimation — 번들 데이터 무결성', () => {
  // 튜닝값(밸런스·연출 디테일)은 박지 않고 구조/관계만 검증한다(테스트는 튜닝값 단언 금지 원칙).
  it('실제 animation.json 이 검증을 통과하고 관계 불변식을 지킨다', () => {
    const a = loadAnimation()
    for (const v of [
      a.hammerImpactMs,
      a.hammerSnapMs,
      a.hammerHoldAfterMs,
      a.hammerFadeoutMs,
      a.reEnhanceGuardMs,
    ]) {
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
    }
    // 연출 플래그: 값(켜짐/꺼짐)은 튜닝 영역이라 박지 않고 타입만 확인한다.
    expect(typeof a.enhanceParticlesEnabled).toBe('boolean')
    expect(typeof a.hammerSwingEnabled).toBe('boolean')
    expect(typeof a.hammerSmearEnabled).toBe('boolean')
    // 파티클 풀 사전 확보 수: 값(튜닝)은 박지 않고 구조/정수>=0 만 확인.
    for (const v of [
      a.particlePoolReserve.dots,
      a.particlePoolReserve.hitSparks,
      a.particlePoolReserve.hitLicks,
    ]) {
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
    }
  })
})
