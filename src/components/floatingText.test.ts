import { describe, it, expect } from 'vitest'
import type { TranslationKey } from '../i18n/locales/ko'
import type { FloatingTextEntry } from '../data/types'
import { FT_BOX, FT_DRIFT_PX, pickFloatingText, pickSpawn } from './floatingText'

// 결정적 PRNG(enhancer/commission 테스트와 동일 idiom) — 분포 수렴 검증용.
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const KEY = (s: string) => s as TranslationKey

describe('pickFloatingText — 가중치 선택(순수)', () => {
  it('후보가 없으면 null(빈 슬롯 = 미표시)', () => {
    expect(pickFloatingText([], () => 0)).toBeNull()
  })

  it('가중치 합이 0 이하면 null', () => {
    const entries: FloatingTextEntry[] = [{ text: KEY('a'), weight: 0 }]
    expect(pickFloatingText(entries, () => 0)).toBeNull()
  })

  it('후보 1개면 rng 와 무관하게 그 문구', () => {
    const entries: FloatingTextEntry[] = [{ text: KEY('only'), weight: 1 }]
    expect(pickFloatingText(entries, () => 0)).toBe('only')
    expect(pickFloatingText(entries, () => 0.999)).toBe('only')
  })

  it('rng 경계로 누적 구간을 가른다(weight [3,1] → 경계 0.75)', () => {
    const entries: FloatingTextEntry[] = [
      { text: KEY('big'), weight: 3 },
      { text: KEY('small'), weight: 1 },
    ]
    expect(pickFloatingText(entries, () => 0)).toBe('big')
    expect(pickFloatingText(entries, () => 0.74)).toBe('big')
    expect(pickFloatingText(entries, () => 0.76)).toBe('small')
    expect(pickFloatingText(entries, () => 0.999)).toBe('small')
  })

  it('관측 분포가 가중치 비율(3:1 = 0.75)에 수렴한다', () => {
    const entries: FloatingTextEntry[] = [
      { text: KEY('big'), weight: 3 },
      { text: KEY('small'), weight: 1 },
    ]
    const rng = mulberry32(1234)
    const N = 20000
    let big = 0
    for (let i = 0; i < N; i++)
      if (pickFloatingText(entries, rng) === KEY('big')) big++
    expect(Math.abs(big / N - 0.75)).toBeLessThan(0.02)
  })
})

describe('pickSpawn — 시작점·드리프트·흔들림(순수)', () => {
  it('센티넬: rng 0 → 좌상단·왼쪽 드리프트·흔들림 -1', () => {
    expect(pickSpawn(() => 0)).toEqual({
      x: -FT_BOX.halfW,
      y: FT_BOX.cy - FT_BOX.halfH,
      driftX: -FT_DRIFT_PX,
      wobble: -1,
    })
  })

  it('센티넬: rng 1 → 우하단·오른쪽 드리프트·흔들림 +1', () => {
    expect(pickSpawn(() => 1)).toEqual({
      x: FT_BOX.halfW,
      y: FT_BOX.cy + FT_BOX.halfH,
      driftX: FT_DRIFT_PX,
      wobble: 1,
    })
  })

  it('항상 박스 경계·드리프트 범위 안, wobble ∈ {-1, 1}(여러 시드)', () => {
    const rng = mulberry32(7)
    for (let i = 0; i < 5000; i++) {
      const s = pickSpawn(rng)
      expect(s.x).toBeGreaterThanOrEqual(-FT_BOX.halfW)
      expect(s.x).toBeLessThanOrEqual(FT_BOX.halfW)
      expect(s.y).toBeGreaterThanOrEqual(FT_BOX.cy - FT_BOX.halfH)
      expect(s.y).toBeLessThanOrEqual(FT_BOX.cy + FT_BOX.halfH)
      expect(s.driftX).toBeGreaterThanOrEqual(-FT_DRIFT_PX)
      expect(s.driftX).toBeLessThanOrEqual(FT_DRIFT_PX)
      expect(Math.abs(s.wobble)).toBe(1)
    }
  })
})
