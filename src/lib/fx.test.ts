import { describe, it, expect } from 'vitest'
import { buildFx, composeTransform, EASING_CSS } from './fx'

// buildFx 는 순수(DOM·시간 무관) — motion 표기의 키프레임이 WAAPI 키프레임·옵션으로 정확히 옮겨지는지 검증한다.
describe('composeTransform — motion 합성 순서(translate → scale → rotate)', () => {
  it('있는 채널만, 정해진 순서로 합성한다', () => {
    expect(composeTransform({ x: -5, rotate: -4 })).toBe('translate(-5px, 0px) rotate(-4deg)')
    expect(composeTransform({ scale: 1.18 })).toBe('scale(1.18)')
    expect(composeTransform({ y: 10, scale: 0.5, rotate: 3 })).toBe(
      'translate(0px, 10px) scale(0.5) rotate(3deg)',
    )
  })

  it('transform 채널이 없으면 null', () => {
    expect(composeTransform({})).toBeNull()
  })
})

describe('buildFx — 키프레임·타이밍 변환', () => {
  it('같은 길이 채널 + times → 오프셋·transform·opacity 가 그대로 옮겨진다', () => {
    const { keyframes, options } = buildFx({
      channels: { x: [0, -5, 0], rotate: [0, -4, 0], opacity: [1, 1, 0] },
      durationSec: 0.5,
      delaySec: 0.325,
      times: [0, 0.14, 1],
      ease: 'easeOut',
    })
    expect(keyframes.map((k) => k.offset)).toEqual([0, 0.14, 1])
    expect(keyframes[1].transform).toBe('translate(-5px, 0px) rotate(-4deg)')
    expect(keyframes[2].opacity).toBe(0)
    expect(options).toMatchObject({ duration: 500, delay: 325, fill: 'both', easing: EASING_CSS.easeOut })
  })

  it('구간별 이징 배열은 각 키프레임의 easing 으로, 전체 easing 은 linear 로 간다', () => {
    const { keyframes, options } = buildFx({
      channels: { scale: [0.3, 1.18, 1.05, 0.16] },
      durationSec: 0.9,
      times: [0, 0.15, 0.5, 1],
      ease: ['backOut', 'easeInOut', 'backIn'],
    })
    expect(keyframes.map((k) => k.easing)).toEqual([
      EASING_CSS.backOut,
      EASING_CSS.easeInOut,
      EASING_CSS.backIn,
      undefined,
    ])
    expect(options.easing).toBe('linear')
  })

  it('길이가 다른 채널은 오프셋 합집합에서 선형 보간해 맞춘다(상수 채널은 전 구간 유지)', () => {
    const { keyframes } = buildFx({
      channels: { scale: [0.3, 1.25], opacity: [0, 0.9, 0], y: 7 },
      durationSec: 0.4,
    })
    expect(keyframes.map((k) => k.offset)).toEqual([0, 0.5, 1])
    // scale 은 [0,1] 두 점 → 0.5 에서 중간값, y 는 상수
    expect(keyframes[1].transform).toBe('translate(0px, 7px) scale(0.775)')
    expect(keyframes.map((k) => k.opacity)).toEqual([0, 0.9, 0])
  })

  it('문자열 채널(filter)도 오프셋에 실린다', () => {
    const { keyframes } = buildFx({
      channels: { scale: [1.7, 1], filter: ['brightness(2)', 'brightness(1)'] },
      durationSec: 0.45,
      ease: 'backOut',
    })
    expect(keyframes.map((k) => k.filter)).toEqual(['brightness(2)', 'brightness(1)'])
  })

  it('times 길이·이징 배열 길이가 어긋나면 throw', () => {
    expect(() =>
      buildFx({ channels: { x: [0, 1, 2] }, durationSec: 1, times: [0, 1] }),
    ).toThrow()
    expect(() =>
      buildFx({ channels: { x: [0, 1, 2] }, durationSec: 1, ease: ['easeIn'] }),
    ).toThrow()
  })
})
