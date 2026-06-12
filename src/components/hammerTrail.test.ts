import { describe, expect, it } from 'vitest'
import {
  STAMP_SPACING_PX,
  TRAIL_WINDOW_MS,
  TrailHistory,
  poseDistance,
  stampAlpha,
  type TrailPose,
} from './hammerTrail'

// 합성 픽스처(고정 타임스탬프·포즈)로 결정적 검증 — 튜닝값(간격·수명·알파 peak)은 toBe 로 박지 않고
// 구조(자국 생성·촘촘함)·방향(머리로 갈수록 진함·결국 사라짐)·관계만 단언한다(CLAUDE.md 테스트 규약).

const pose = (x: number, y: number, rotate = 0, scale = 1): TrailPose => ({
  x,
  y,
  rotate,
  scale,
})

// 빠른 스윙 픽스처 — 16ms 프레임마다 100px 이동(≈6px/ms, 게이트 위). 마지막 push 시각을 반환한다.
function fastSwing(h: TrailHistory, frames = 4): number {
  for (let i = 0; i <= frames; i++) h.push(i * 16, pose(i * 100, 0))
  return frames * 16
}

describe('TrailHistory — 망치 스윙 스미어 자국', () => {
  it('빠른 스윙은 자국을 남기고, 알파가 꼬리(오래됨)→머리(최신)로 단조 증가한다', () => {
    const h = new TrailHistory()
    const last = fastSwing(h)
    const stamps = h.stamps(last)
    expect(stamps.length).toBeGreaterThan(1)
    for (let i = 1; i < stamps.length; i++) {
      expect(stamps[i].alpha).toBeGreaterThanOrEqual(stamps[i - 1].alpha)
    }
    expect(stamps[0].alpha).toBeGreaterThan(0)
    expect(stamps[stamps.length - 1].alpha).toBeGreaterThan(stamps[0].alpha)
  })

  it('한 프레임에 크게 점프해도 자국 사이가 스탬프 간격 이하로 보간된다(끊김 없는 물감 자국)', () => {
    const h = new TrailHistory()
    h.push(0, pose(0, 0))
    h.push(16, pose(300, -200, -80))
    const stamps = h.stamps(16)
    expect(stamps.length).toBeGreaterThan(1)
    for (let i = 1; i < stamps.length; i++) {
      expect(
        poseDistance(stamps[i - 1].pose, stamps[i].pose),
      ).toBeLessThanOrEqual(STAMP_SPACING_PX + 1e-9)
    }
  })

  it('제자리 회전(머리 쓸기)도 이동 거리로 쳐 자국을 남긴다', () => {
    expect(poseDistance(pose(0, 0, 0), pose(0, 0, 90))).toBeGreaterThan(0)
    const h = new TrailHistory()
    h.push(0, pose(0, 0, 0))
    h.push(16, pose(0, 0, 90))
    expect(h.stamps(16).length).toBeGreaterThan(0)
  })

  it('윈드업처럼 느린 움직임은 자국을 남기지 않는다(속도 게이트)', () => {
    const h = new TrailHistory()
    // ≈0.09px/ms — 실제 윈드업(START→HOLD ≈0.1px/ms)과 같은 자릿수의 미끄러짐
    for (let i = 0; i <= 20; i++) h.push(i * 16, pose(i, -i))
    expect(h.stamps(320)).toHaveLength(0)
  })

  it('자국은 수명이 지나면 사라진다 — 임팩트 후 꼬리가 수축하다 소멸', () => {
    const h = new TrailHistory()
    const last = fastSwing(h)
    expect(h.isAlive(last)).toBe(true)
    const full = h.stamps(last).length
    // 시간이 흐르면 늘지 않고(수축), 수명이 지나면 전부 사라진다.
    expect(h.stamps(last + TRAIL_WINDOW_MS * 0.6).length).toBeLessThanOrEqual(
      full,
    )
    expect(h.isAlive(last + TRAIL_WINDOW_MS + 1)).toBe(false)
    expect(h.stamps(last + TRAIL_WINDOW_MS + 1)).toHaveLength(0)
  })

  it('reset 은 자국·펜을 모두 버려 다음 push 가 이전 위치와 잇지 않는다(연사 하드 컷)', () => {
    const h = new TrailHistory()
    const last = fastSwing(h)
    h.reset()
    expect(h.stamps(last)).toHaveLength(0)
    // 새 강화 첫 프레임 — 이전 펜과 아무리 멀어도 단일 포즈로는 자국이 없다(펜만 새로 찍힘).
    h.push(last + 16, pose(999, 999))
    expect(h.stamps(last + 16)).toHaveLength(0)
  })

  it('타임스탬프가 역행하는 push 는 자국을 만들지 않는다(방어)', () => {
    const h = new TrailHistory()
    h.push(32, pose(0, 0))
    h.push(16, pose(300, 0))
    expect(h.stamps(32)).toHaveLength(0)
  })
})

describe('stampAlpha — 나이 기반 알파 곡선', () => {
  it('최신이 가장 진하고 나이 들수록 옅어지다 수명 끝에 0이 된다', () => {
    expect(stampAlpha(0)).toBeGreaterThan(stampAlpha(TRAIL_WINDOW_MS / 2))
    expect(stampAlpha(TRAIL_WINDOW_MS / 2)).toBeGreaterThan(0)
    expect(stampAlpha(TRAIL_WINDOW_MS)).toBe(0)
    expect(stampAlpha(TRAIL_WINDOW_MS * 2)).toBe(0)
  })
})
