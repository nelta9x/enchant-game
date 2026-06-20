import { describe, it, expect } from 'vitest'
import { computeEnhanceTimeline } from './enhanceTimeline'
import type { AnimationConfig } from '../data/types'

// 합성 픽스처(실제 데이터 값이 아님) — 떨림은 검 데이터로 분리됐으므로 timeline 은 임팩트·가드만 본다.
const ANIM: AnimationConfig = {
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

  it('떨림 0 이하는 0 으로 클램프 — 떨림 없음, 버스트는 임팩트 시점(음수 burstAt 방지)', () => {
    // 검 데이터 shake 가 0 이하면 그 결과는 떨림 없이 임팩트에 바로 공개/버스트해야 한다.
    for (const noShake of [0, -1, -500]) {
      const t = computeEnhanceTimeline(ANIM, noShake)
      expect(t.shakeMs).toBe(0)
      expect(t.burstAtMs).toBe(t.impactMs)
      expect(t.revealAtMs).toBe(t.impactMs)
    }
  })
})
