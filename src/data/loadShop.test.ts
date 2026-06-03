import { describe, it, expect } from 'vitest'
import { parseShop, loadShop } from './loadShop'

// 최소 유효 행 헬퍼. override 로 개별 필드만 바꿔 검증 경로를 테스트한다.
// parseShop 은 unknown 을 받으므로 의도적으로 잘못된 값도 흘려보낼 수 있다.
function row(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { itemId: 'protection_ticket', price: 1_000_000, ...over }
}

describe('parseShop — 구조 검증', () => {
  it('유효한 항목을 파싱하고 데이터 순서를 유지한다', () => {
    const items = parseShop([
      row(),
      row({ itemId: 'warp_ticket_9', price: 500 }),
    ])
    expect(items).toHaveLength(2)
    expect(items[0]).toEqual({ itemId: 'protection_ticket', price: 1_000_000 })
    expect(items[1].itemId).toBe('warp_ticket_9')
  })

  it('루트가 배열이 아니면 throw', () => {
    expect(() => parseShop({})).toThrow()
  })

  it('항목이 객체가 아니면 throw', () => {
    expect(() => parseShop(['nope'])).toThrow()
  })

  it('itemId가 빈 문자열이거나 문자열이 아니면 throw', () => {
    expect(() => parseShop([row({ itemId: '' })])).toThrow()
    expect(() => parseShop([row({ itemId: 123 })])).toThrow()
  })

  it('price가 양의 정수가 아니면 throw (0 / 음수 / 소수)', () => {
    expect(() => parseShop([row({ price: 0 })])).toThrow()
    expect(() => parseShop([row({ price: -100 })])).toThrow()
    expect(() => parseShop([row({ price: 1.5 })])).toThrow()
  })

  it('itemId가 중복되면 throw', () => {
    expect(() => parseShop([row(), row()])).toThrow()
  })
})

describe('loadShop — 실제 번들 데이터(shop.json)', () => {
  it('방지권을 100만 골드에 판매한다', () => {
    const ticket = loadShop().find((i) => i.itemId === 'protection_ticket')
    expect(ticket).toBeDefined()
    expect(ticket?.price).toBe(1_000_000)
  })

  it('itemId가 중복되지 않는다', () => {
    const ids = loadShop().map((i) => i.itemId)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
