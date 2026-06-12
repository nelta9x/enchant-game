import { describe, expect, it } from 'vitest'
import { computeHammerMotion } from './hammerTiming'
import {
  ARM_RADIUS_PX,
  IMPACT,
  IMPACT_ROTATE,
  SNAP_SAMPLES,
  derivePivot,
  swingKeyframes,
} from './hammerSwing'

// 합성 픽스처(고정 타이밍)로 결정적 검증 — 튜닝값(반지름·각도·스케일)은 toBe 로 박지 않고
// 호(arc) 불변식·방향(가속·늦은 손목 릴리즈·위로 휨)·앵커 보존만 단언한다(CLAUDE.md 테스트 규약).

const m = computeHammerMotion(0.3, {
  snapSec: 0.06,
  holdAfterSec: 0.3,
  fadeoutSec: 0.1,
})
const kf = swingKeyframes(m, false)

// 키프레임 인덱스: [0]=등장, [1]=윈드업, [2..1+S]=스냅 샘플(마지막=임팩트), [2+S]=임팩트 정지
const HOLD_I = 1
const SNAP_FIRST = 2
const IMPACT_I = 1 + SNAP_SAMPLES

// 팔 각도(deg) 복원 — 피벗 기준 atan2(원호 위 점이라는 전제는 별도 테스트가 보장).
const pivot = derivePivot()
const armDegAt = (i: number) =>
  Math.atan2(kf.x[i] - pivot.x, pivot.y - kf.y[i]) * (180 / Math.PI)

describe('swingKeyframes — 피벗 호 + 손목 스냅 궤적', () => {
  it('채널 배열·times·ease 길이가 정합하고 times 가 0→1 로 단조다', () => {
    const n = kf.x.length
    expect(kf.y).toHaveLength(n)
    expect(kf.rotate).toHaveLength(n)
    expect(kf.scale).toHaveLength(n)
    expect(kf.times).toHaveLength(n)
    expect(kf.ease).toHaveLength(n - 1)
    expect(kf.times[0]).toBe(0)
    expect(kf.times[n - 1]).toBe(1)
    for (let i = 1; i < n; i++) {
      expect(kf.times[i]).toBeGreaterThanOrEqual(kf.times[i - 1])
    }
  })

  it('임팩트 샘플·정지 키프레임이 앵커 포즈(IMPACT·IMPACT_ROTATE)와 일치하고 임팩트 시각에 온다', () => {
    for (const i of [IMPACT_I, IMPACT_I + 1]) {
      expect(kf.x[i]).toBeCloseTo(IMPACT.x, 6)
      expect(kf.y[i]).toBeCloseTo(IMPACT.y, 6)
      expect(kf.rotate[i]).toBeCloseTo(IMPACT_ROTATE, 6)
    }
    expect(kf.times[IMPACT_I]).toBeCloseTo(m.impactSec / m.motionSec, 6)
  })

  it('정지 키프레임을 뺀 모든 포즈가 피벗에서 등거리다 — 원호 위를 도는 스윙(직선 보간 없음)', () => {
    for (let i = 0; i <= IMPACT_I; i++) {
      expect(Math.hypot(kf.x[i] - pivot.x, kf.y[i] - pivot.y)).toBeCloseTo(
        ARM_RADIUS_PX,
        6,
      )
    }
  })

  it('스냅 동안 팔 각도가 단조 감소한다 — 한 방향으로 휘두르는 스윙(되돌아가지 않음)', () => {
    for (let i = SNAP_FIRST; i <= IMPACT_I; i++) {
      expect(armDegAt(i)).toBeLessThan(armDegAt(i - 1))
    }
  })

  it('스냅 경로가 윈드업→임팩트 직선 현(chord)보다 위로 휜다 — 돌아 내려찍는 호', () => {
    // 중간 샘플의 x 위치에서 현을 보간한 y 와 비교(x 는 스냅 동안 단조 감소라 보간이 유효하다).
    const mid = SNAP_FIRST + Math.floor(SNAP_SAMPLES / 2) - 1
    const t = (kf.x[mid] - kf.x[HOLD_I]) / (kf.x[IMPACT_I] - kf.x[HOLD_I])
    const chordY = kf.y[HOLD_I] + (kf.y[IMPACT_I] - kf.y[HOLD_I]) * t
    expect(kf.y[mid]).toBeLessThan(chordY) // y− 가 위
  })

  it('스냅이 가속한다 — 전반 절반의 각도를 도는 데 절반보다 긴 시간을 쓴다', () => {
    const holdT = kf.times[HOLD_I]
    const half = SNAP_FIRST + SNAP_SAMPLES / 2 - 1
    expect(kf.times[half] - holdT).toBeGreaterThan(
      (kf.times[IMPACT_I] - holdT) / 2,
    )
  })

  it('손목이 늦게 풀린다 — 스냅 중 자세가 시간 선형 보간보다 젖힌 쪽에 머문다', () => {
    const holdT = kf.times[HOLD_I]
    const snapT = kf.times[IMPACT_I] - holdT
    for (let i = SNAP_FIRST; i < IMPACT_I; i++) {
      const u = (kf.times[i] - holdT) / snapT
      const linear =
        kf.rotate[HOLD_I] + (kf.rotate[IMPACT_I] - kf.rotate[HOLD_I]) * u
      expect(kf.rotate[i]).toBeGreaterThan(linear)
    }
  })

  it('좁은 화면 보정은 임팩트 x 를 보존한 채 치켜든 x 만 안쪽으로 당긴다(y·자세·시간 불변)', () => {
    const narrow = swingKeyframes(m, true)
    expect(narrow.x[IMPACT_I]).toBeCloseTo(kf.x[IMPACT_I], 6)
    expect(Math.abs(narrow.x[0] - IMPACT.x)).toBeLessThan(
      Math.abs(kf.x[0] - IMPACT.x),
    )
    expect(narrow.y).toEqual(kf.y)
    expect(narrow.rotate).toEqual(kf.rotate)
    expect(narrow.times).toEqual(kf.times)
  })

  it('임팩트가 스냅보다 짧아 윈드업 대기가 0 으로 접혀도 times 는 단조를 유지한다(방어)', () => {
    const folded = swingKeyframes(
      computeHammerMotion(0.04, {
        snapSec: 0.06,
        holdAfterSec: 0.3,
        fadeoutSec: 0.1,
      }),
      false,
    )
    for (let i = 1; i < folded.times.length; i++) {
      expect(folded.times[i]).toBeGreaterThanOrEqual(folded.times[i - 1])
    }
  })
})
