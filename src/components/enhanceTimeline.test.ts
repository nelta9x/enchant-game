import { describe, it, expect } from 'vitest'
import {
  computeEnhanceTimeline,
  rollShakeMs,
  shakeRangeForLevel,
} from './enhanceTimeline'
import type { AnimationConfig, ShakeBand } from '../data/types'

// 합성 픽스처(실제 데이터 값이 아님) — 떨림은 레벨 밴드로 분리됐으므로 timeline 은 임팩트·가드만 본다.
const ANIM: AnimationConfig = {
  hammerImpactMs: 360,
  hammerWindupMs: 140,
  hammerHoldAfterMs: 100,
  hammerFadeoutMs: 120,
  reEnhanceGuardMs: 100,
  shakeBands: [{ maxLevel: null, minMs: 200, maxMs: 500 }],
}

describe('rollShakeMs — 떨림 시간 무작위 추출', () => {
  const range = { minMs: 200, maxMs: 500 }

  it('항상 [min, max] 구간의 정수를 돌려준다', () => {
    // rng 양 끝(0, 1 직전)과 중간을 넣어 경계를 확인한다(특정 ms 가 아니라 범위 관계만).
    for (const r of [0, 0.25, 0.5, 0.999999]) {
      const v = rollShakeMs(range, () => r)
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(range.minMs)
      expect(v).toBeLessThanOrEqual(range.maxMs)
    }
  })

  it('rng=0 은 하한, rng→1 은 상한(양끝 도달)', () => {
    expect(rollShakeMs(range, () => 0)).toBe(range.minMs)
    expect(rollShakeMs(range, () => 0.999999)).toBe(range.maxMs)
  })

  it('min==max 면 항상 그 값(고정 떨림)', () => {
    expect(rollShakeMs({ minMs: 300, maxMs: 300 }, () => 0.7)).toBe(300)
  })
})

describe('shakeRangeForLevel — 레벨로 떨림 밴드 선택', () => {
  // 합성 밴드(실제 값·임계가 아님) — "레벨 이상인 첫 밴드"를 고르고, 고레벨일수록 떨림이 줄지 않는지(단조)만 본다.
  const bands: ShakeBand[] = [
    { maxLevel: 5, minMs: 100, maxMs: 100 },
    { maxLevel: 10, minMs: 300, maxMs: 400 },
    { maxLevel: null, minMs: 700, maxMs: 700 },
  ]

  it('레벨이 속한 밴드를 고른다(경계 포함은 그 밴드, 초과는 다음)', () => {
    expect(shakeRangeForLevel(bands, 1)).toEqual({ minMs: 100, maxMs: 100 })
    expect(shakeRangeForLevel(bands, 5)).toEqual({ minMs: 100, maxMs: 100 })
    expect(shakeRangeForLevel(bands, 6)).toEqual({ minMs: 300, maxMs: 400 })
    expect(shakeRangeForLevel(bands, 10)).toEqual({ minMs: 300, maxMs: 400 })
    expect(shakeRangeForLevel(bands, 11)).toEqual({ minMs: 700, maxMs: 700 })
  })

  it('마지막 밴드(maxLevel null)는 그 위 모든 레벨을 담당한다', () => {
    expect(shakeRangeForLevel(bands, 30)).toEqual({ minMs: 700, maxMs: 700 })
    expect(shakeRangeForLevel(bands, 999)).toEqual({ minMs: 700, maxMs: 700 })
  })

  it('레벨이 오를수록 떨림 하한이 줄지 않는다(단조 — 고단계가 더 묵직)', () => {
    let prev = -1
    for (const level of [1, 5, 6, 10, 11, 50]) {
      const { minMs } = shakeRangeForLevel(bands, level)
      expect(minMs).toBeGreaterThanOrEqual(prev)
      prev = minMs
    }
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
    const shortTl = computeEnhanceTimeline(ANIM, 200)
    const longTl = computeEnhanceTimeline(ANIM, 500)
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
