import { describe, it, expect } from 'vitest'
import { parseItems, loadItems } from './loadItems'
import { ko } from '../i18n/locales/ko'

// 최소 유효 아이템 헬퍼.
function item(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: 'iron_scrap', basePrice: 50, sprite: 'iron_scrap.png', ...over }
}

describe('parseItems — 구조 검증', () => {
  it('유효한 카탈로그를 파싱하고 nameKey 를 id 에서 파생한다', () => {
    expect(parseItems([item()])).toEqual([
      {
        id: 'iron_scrap',
        basePrice: 50,
        nameKey: 'item.iron_scrap',
        sprite: 'iron_scrap.png',
      },
    ])
  })

  it('sprite 는 선택 — 없으면 null', () => {
    expect(parseItems([item({ sprite: undefined })])[0].sprite).toBeNull()
  })

  it('루트가 배열이 아니면 throw', () => {
    expect(() => parseItems({})).toThrow()
    expect(() => parseItems(null)).toThrow()
  })

  it('id 가 비어있으면 throw', () => {
    expect(() => parseItems([item({ id: '' })])).toThrow()
    expect(() => parseItems([item({ id: 123 })])).toThrow()
  })

  it('id 가 중복이면 throw', () => {
    expect(() => parseItems([item(), item()])).toThrow()
  })

  it('basePrice 가 비숫자/음수/비유한이면 throw', () => {
    expect(() => parseItems([item({ basePrice: 'x' })])).toThrow()
    expect(() => parseItems([item({ basePrice: -1 })])).toThrow()
    expect(() => parseItems([item({ basePrice: NaN })])).toThrow()
    expect(() => parseItems([item({ basePrice: Infinity })])).toThrow()
  })

  it('basePrice 0 은 허용한다', () => {
    expect(parseItems([item({ basePrice: 0 })])[0].basePrice).toBe(0)
  })

  it('sprite 가 빈 문자열이면 throw', () => {
    expect(() => parseItems([item({ sprite: '' })])).toThrow()
  })
})

describe('loadItems — 번들 데이터 진입점', () => {
  it('실제 items.json 을 로드하고 모든 nameKey 가 번역 리소스에 존재한다', () => {
    const items = loadItems()
    expect(items.length).toBeGreaterThan(0)
    const keys = Object.keys(ko)
    for (const it of items) {
      expect(keys).toContain(it.nameKey)
      expect(it.basePrice).toBeGreaterThanOrEqual(0)
    }
  })
})
