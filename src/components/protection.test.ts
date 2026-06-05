import { describe, it, expect } from 'vitest'
import { protectionState, isProtectionActive } from './protection'

describe('protectionState — 결계 4상태 매핑(순수)', () => {
  it("이 단계가 보호 불가('disabled')면 unavailable", () => {
    expect(protectionState('disabled', 99, true)).toEqual({ kind: 'unavailable' })
  })

  it('필요 수량이 0이면(발동 의사·보유 무관) unavailable', () => {
    expect(protectionState(0, 99, true)).toEqual({ kind: 'unavailable' })
  })

  it('보유 < 필요면 insufficient + 부족분(shortfall)', () => {
    expect(protectionState(3, 1, false)).toEqual({
      kind: 'insufficient',
      required: 3,
      owned: 1,
      shortfall: 2,
    })
  })

  it('보유가 모자라면 발동 의사가 있어도 insufficient(켜진 척 금지)', () => {
    expect(protectionState(3, 2, true)).toEqual({
      kind: 'insufficient',
      required: 3,
      owned: 2,
      shortfall: 1,
    })
  })

  it('충분히 보유 + 미발동 → ready', () => {
    expect(protectionState(3, 3, false)).toEqual({
      kind: 'ready',
      required: 3,
      owned: 3,
    })
  })

  it('충분히 보유 + 발동 → armed', () => {
    expect(protectionState(3, 10, true)).toEqual({
      kind: 'armed',
      required: 3,
      owned: 10,
    })
  })
})

describe('isProtectionActive — 강화 게이트 단일 기준(순수)', () => {
  it('armed 만 true', () => {
    expect(isProtectionActive(protectionState(3, 10, true))).toBe(true)
  })

  it('ready·insufficient·unavailable 는 false', () => {
    expect(isProtectionActive(protectionState(3, 10, false))).toBe(false)
    expect(isProtectionActive(protectionState(3, 1, true))).toBe(false)
    expect(isProtectionActive(protectionState('disabled', 9, true))).toBe(false)
  })
})
