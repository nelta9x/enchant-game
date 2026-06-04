import { describe, it, expect } from 'vitest'
import { parseShop, loadShop } from './loadShop'

// 최소 유효 행 헬퍼. override 로 개별 필드만 바꿔 검증 경로를 테스트한다.
// parseShop 은 unknown 을 받으므로 의도적으로 잘못된 값도 흘려보낼 수 있다.
function row(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'ticket_gold',
    itemId: 'protection_ticket',
    price: { kind: 'gold', amount: 1_000_000 },
    ...over,
  }
}

describe('parseShop — 구조 검증', () => {
  it('골드/아이템 가격 항목을 파싱하고 데이터 순서를 유지한다', () => {
    const items = parseShop([
      row(),
      row({
        id: 'ticket_scrap',
        price: { kind: 'item', itemId: 'iron_scrap', count: 10 },
      }),
    ])
    expect(items).toHaveLength(2)
    expect(items[0]).toEqual({
      id: 'ticket_gold',
      itemId: 'protection_ticket',
      price: { kind: 'gold', amount: 1_000_000 },
    })
    expect(items[1].price).toEqual({
      kind: 'item',
      itemId: 'iron_scrap',
      count: 10,
    })
  })

  it('루트가 배열이 아니면 throw', () => {
    expect(() => parseShop({})).toThrow()
  })

  it('항목이 객체가 아니면 throw', () => {
    expect(() => parseShop(['nope'])).toThrow()
  })

  it('id가 빈 문자열이거나 문자열이 아니면 throw', () => {
    expect(() => parseShop([row({ id: '' })])).toThrow()
    expect(() => parseShop([row({ id: 123 })])).toThrow()
  })

  it('itemId가 빈 문자열이면 throw', () => {
    expect(() => parseShop([row({ itemId: '' })])).toThrow()
  })

  it('price가 유효한 Material이 아니면 throw (잘못된 kind / 음수 / 0개)', () => {
    expect(() => parseShop([row({ price: { kind: 'bogus' } })])).toThrow()
    expect(() =>
      parseShop([row({ price: { kind: 'gold', amount: -5 } })]),
    ).toThrow()
    expect(() =>
      parseShop([row({ price: { kind: 'item', itemId: 'x', count: 0 } })]),
    ).toThrow()
  })

  it('id가 중복되면 throw', () => {
    expect(() => parseShop([row(), row()])).toThrow()
  })

  it('itemId가 같아도 id가 다르면 허용한다(같은 아이템 다른 가격)', () => {
    const items = parseShop([
      row({ id: 'a' }),
      row({
        id: 'b',
        price: { kind: 'item', itemId: 'iron_scrap', count: 10 },
      }),
    ])
    expect(items).toHaveLength(2)
    expect(items.every((i) => i.itemId === 'protection_ticket')).toBe(true)
  })
})

describe('loadShop — 실제 번들 데이터(shop.json)', () => {
  it('파괴보호장치를 골드(100만)와 철조각(10개) 두 방식으로 판매한다', () => {
    const items = loadShop()
    const gold = items.find((i) => i.id === 'protection_ticket_gold')
    const scrap = items.find((i) => i.id === 'protection_ticket_scrap')
    expect(gold?.itemId).toBe('protection_ticket')
    expect(gold?.price).toEqual({ kind: 'gold', amount: 1_000_000 })
    expect(scrap?.itemId).toBe('protection_ticket')
    expect(scrap?.price).toEqual({
      kind: 'item',
      itemId: 'iron_scrap',
      count: 10,
    })
  })

  it('항목 id가 중복되지 않는다', () => {
    const ids = loadShop().map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
