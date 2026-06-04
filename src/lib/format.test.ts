import { describe, it, expect } from 'vitest'
import { formatRate } from './format'

describe('formatRate', () => {
  it('성공률(0~1)을 정수 백분율 문자열로 변환한다', () => {
    expect(formatRate(0.5)).toBe('50%')
    expect(formatRate(1)).toBe('100%')
    expect(formatRate(0)).toBe('0%')
  })

  it('소수 백분율은 반올림한다(소수점 없이)', () => {
    expect(formatRate(0.875)).toBe('88%') // 87.5 → 88
    expect(formatRate(0.124)).toBe('12%') // 12.4 → 12
  })
})
