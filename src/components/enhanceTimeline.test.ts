import { describe, it, expect } from 'vitest'
import { computeEnhanceTimeline, rollShakeMs } from './enhanceTimeline'
import type { AnimationConfig } from '../data/types'

const ANIM: AnimationConfig = {
  hammerImpactMs: 360,
  weaponShakeMinMs: 200,
  weaponShakeMaxMs: 500,
  reEnhanceGuardMs: 100,
}

describe('rollShakeMs — 떨림 시간 무작위 추출', () => {
  it('항상 [min, max] 구간의 정수를 돌려준다', () => {
    // rng 양 끝(0, 1 직전)과 중간을 넣어 경계를 확인한다(특정 ms 가 아니라 범위 관계만).
    for (const r of [0, 0.25, 0.5, 0.999999]) {
      const v = rollShakeMs(ANIM, () => r)
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(ANIM.weaponShakeMinMs)
      expect(v).toBeLessThanOrEqual(ANIM.weaponShakeMaxMs)
    }
  })

  it('rng=0 은 하한, rng→1 은 상한(양끝 도달)', () => {
    expect(rollShakeMs(ANIM, () => 0)).toBe(ANIM.weaponShakeMinMs)
    expect(rollShakeMs(ANIM, () => 0.999999)).toBe(ANIM.weaponShakeMaxMs)
  })

  it('min==max 면 항상 그 값(고정 떨림)', () => {
    const fixed: AnimationConfig = {
      ...ANIM,
      weaponShakeMinMs: 300,
      weaponShakeMaxMs: 300,
    }
    expect(rollShakeMs(fixed, () => 0.7)).toBe(300)
  })
})

describe('computeEnhanceTimeline — 마일스톤 관계 불변식', () => {
  // 특정 ms 값을 박지 않고 "서로 맞물려야 하는" 관계만 단언한다(튜닝값 단언 금지 원칙).
  const shakeMs = 300
  const tl = computeEnhanceTimeline(ANIM, shakeMs)

  it('버스트는 임팩트 + 떨림이다(떨림이 끝난 뒤 터진다)', () => {
    expect(tl.impactMs).toBe(ANIM.hammerImpactMs)
    expect(tl.shakeMs).toBe(shakeMs)
    expect(tl.burstAtMs).toBe(tl.impactMs + tl.shakeMs)
    expect(tl.burstAtMs).toBeGreaterThan(tl.impactMs)
  })

  it('결과 공개·등장 억제는 버스트 시점과 정확히 일치한다(crossover 단일 출처)', () => {
    expect(tl.revealAtMs).toBe(tl.burstAtMs)
    expect(tl.suppressMs).toBe(tl.burstAtMs)
  })

  it('재강화 잠금 = 버스트 + 재강화 가드(버스트 후 가드만큼 늦게 풀림)', () => {
    expect(tl.lockMs).toBe(tl.burstAtMs + ANIM.reEnhanceGuardMs)
    expect(tl.lockMs).toBeGreaterThanOrEqual(tl.burstAtMs)
  })

  it('효과 수명은 각 애니메이션이 끝나는 시점보다 길다(중간에 끊기지 않음)', () => {
    expect(tl.burstLifetimeMs).toBeGreaterThan(tl.burstAtMs)
    expect(tl.protectedDurationMs).toBeGreaterThanOrEqual(tl.burstAtMs)
  })

  it('떨림이 길수록 버스트·공개·잠금이 모두 함께 뒤로 밀린다(단조)', () => {
    const shortTl = computeEnhanceTimeline(ANIM, ANIM.weaponShakeMinMs)
    const longTl = computeEnhanceTimeline(ANIM, ANIM.weaponShakeMaxMs)
    expect(longTl.burstAtMs).toBeGreaterThan(shortTl.burstAtMs)
    expect(longTl.revealAtMs).toBeGreaterThan(shortTl.revealAtMs)
    expect(longTl.lockMs).toBeGreaterThan(shortTl.lockMs)
  })

  it('reEnhanceGuard 0 이면 버스트 즉시 재강화 가능(잠금 == 버스트)', () => {
    const noGuard: AnimationConfig = { ...ANIM, reEnhanceGuardMs: 0 }
    const t = computeEnhanceTimeline(noGuard, shakeMs)
    expect(t.lockMs).toBe(t.burstAtMs)
  })
})
