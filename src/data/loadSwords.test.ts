import { describe, it, expect } from 'vitest'
import { parseSwords, assertNameKeysResolve, loadSwords } from './loadSwords'

// 최소 유효 행 헬퍼. override 로 개별 필드만 바꿔 검증 경로를 테스트한다.
// parseSwords 는 unknown 을 받으므로 의도적으로 잘못된 값도 흘려보낼 수 있다.
function row(over: Record<string, unknown> = {}): Record<string, unknown> {
  const level = typeof over.level === 'number' ? over.level : 0
  return {
    id: `sword_${level}`,
    nextId: null,
    level,
    enhanceCost: { kind: 'gold', amount: 300 },
    successRate: 1,
    sellPrice: null,
    protectionTickets: 0,
    ...over,
  }
}

describe('parseSwords — 구조 검증', () => {
  it('gold / item / free / 최종 단계를 각각 파싱한다', () => {
    const swords = parseSwords([
      row({ level: 0 }),
      row({
        level: 1,
        enhanceCost: { kind: 'item', itemId: 'iron_scrap', count: 8 },
        successRate: 0.4,
        sellPrice: 100,
        protectionTickets: 'disabled',
      }),
      row({
        level: 2,
        enhanceCost: { kind: 'free' },
        successRate: 0.15,
        protectionTickets: 'disabled',
      }),
      row({ level: 3, enhanceCost: null, successRate: null }),
    ])
    expect(swords).toHaveLength(4)
    expect(swords[0].nameKey).toBe('sword.0.name')
    expect(swords[1].enhanceCost).toEqual({
      kind: 'item',
      itemId: 'iron_scrap',
      count: 8,
    })
    expect(swords[1].protectionTickets).toBe('disabled')
    expect(swords[2].enhanceCost).toEqual({ kind: 'free' })
    expect(swords[3].enhanceCost).toBeNull()
    expect(swords[3].successRate).toBeNull()
  })

  it('입력 순서와 무관하게 단계 오름차순으로 정렬한다', () => {
    const swords = parseSwords([
      row({ level: 3 }),
      row({ level: 1 }),
      row({ level: 2 }),
    ])
    expect(swords.map((s) => s.level)).toEqual([1, 2, 3])
  })

  it('successRate가 0~1을 벗어나면 throw', () => {
    expect(() => parseSwords([row({ successRate: 1.5 })])).toThrow()
    expect(() => parseSwords([row({ successRate: -0.1 })])).toThrow()
  })

  it('enhanceCost와 successRate 중 하나만 null이면 throw (최종 단계 불일치)', () => {
    expect(() =>
      parseSwords([row({ enhanceCost: null, successRate: 1 })]),
    ).toThrow()
    expect(() =>
      parseSwords([
        row({ enhanceCost: { kind: 'gold', amount: 1 }, successRate: null }),
      ]),
    ).toThrow()
  })

  it('gold amount가 양수가 아니면 throw', () => {
    expect(() =>
      parseSwords([row({ enhanceCost: { kind: 'gold', amount: 0 } })]),
    ).toThrow()
  })

  it('item count가 양의 정수가 아니면 throw', () => {
    expect(() =>
      parseSwords([
        row({ enhanceCost: { kind: 'item', itemId: 'x', count: 0 } }),
      ]),
    ).toThrow()
  })

  it('알 수 없는 enhanceCost kind면 throw', () => {
    expect(() =>
      parseSwords([row({ enhanceCost: { kind: 'mana' } })]),
    ).toThrow()
  })

  it('protectionTickets가 음수면 throw', () => {
    expect(() => parseSwords([row({ protectionTickets: -1 })])).toThrow()
  })

  it('sellPrice가 음수면 throw', () => {
    expect(() => parseSwords([row({ sellPrice: -5 })])).toThrow()
  })

  it('중복 단계면 throw', () => {
    expect(() => parseSwords([row({ level: 1 }), row({ level: 1 })])).toThrow()
  })

  it('정의되지 않은 note면 throw', () => {
    expect(() => parseSwords([row({ notes: ['bogus'] })])).toThrow()
  })

  it('루트가 배열이 아니면 throw', () => {
    expect(() => parseSwords({})).toThrow()
  })
})

describe('parseSwords — dropOnFail 구조 검증', () => {
  it('유효한 dropOnFail(아이템 + 수량)을 파싱한다', () => {
    const swords = parseSwords([
      row({ dropOnFail: { itemId: 'iron_scrap', count: 10 } }),
    ])
    expect(swords[0].dropOnFail).toEqual({
      itemId: 'iron_scrap',
      count: 10,
    })
  })

  it('dropOnFail 이 없으면 null 이다', () => {
    expect(parseSwords([row()])[0].dropOnFail).toBeNull()
  })

  it('dropOnFail 이 객체가 아니면 throw (문자열 등)', () => {
    expect(() => parseSwords([row({ dropOnFail: 'iron_scrap' })])).toThrow()
  })

  it('dropOnFail itemId가 비었거나 count가 양의 정수가 아니면 throw', () => {
    expect(() =>
      parseSwords([row({ dropOnFail: { itemId: '', count: 1 } })]),
    ).toThrow()
    expect(() =>
      parseSwords([row({ dropOnFail: { itemId: 'x', count: 0 } })]),
    ).toThrow()
    expect(() =>
      parseSwords([row({ dropOnFail: { itemId: 'x', count: 1.5 } })]),
    ).toThrow()
  })
})

describe('parseSwords — 진행 체인(nextId) · id 무결성', () => {
  it('nextId가 null(최종 단계)이거나 실재하는 검 id면 통과', () => {
    const swords = parseSwords([
      row({ level: 0, id: 'sword_0', nextId: 'sword_1' }),
      row({ level: 1, id: 'sword_1', nextId: null }),
    ])
    expect(swords).toHaveLength(2)
    expect(swords[0].nextId).toBe('sword_1')
    expect(swords[1].nextId).toBeNull()
  })

  it('nextId가 존재하지 않는 검을 가리키면 throw', () => {
    expect(() =>
      parseSwords([row({ level: 0, id: 'sword_0', nextId: 'sword_99' })]),
    ).toThrow()
  })

  it('중복 id면 throw', () => {
    expect(() =>
      parseSwords([row({ level: 0, id: 'dup' }), row({ level: 1, id: 'dup' })]),
    ).toThrow()
  })

  it('id가 비었으면 throw', () => {
    expect(() => parseSwords([row({ id: '' })])).toThrow()
  })

  // 검 재료(enhanceCost item)의 itemId 오타 검증은 여기서 하지 않는다 — 검과 잡템이 itemId
  // 네임스페이스를 공유해 패턴으로 구분할 수 없으므로, 전체 itemId 검증은 아이템 카탈로그
  // 스프린트로 이관한다. 따라서 검 id든 잡템 slug든 구조만 맞으면 통과한다.
  it('enhanceCost 아이템 참조는 무결성 검사를 하지 않는다(검·잡템 모두 통과)', () => {
    const swords = parseSwords([
      row({
        level: 0,
        enhanceCost: { kind: 'item', itemId: 'iron_scrap', count: 8 },
      }),
      row({
        level: 1,
        enhanceCost: { kind: 'item', itemId: 'sword_99', count: 1 },
      }),
    ])
    expect(swords).toHaveLength(2)
  })
})

describe('assertNameKeysResolve', () => {
  it('모든 nameKey가 로케일에 있으면 통과', () => {
    const swords = parseSwords([row({ level: 0 })])
    expect(() =>
      assertNameKeysResolve(swords, new Set(['sword.0.name'])),
    ).not.toThrow()
  })

  it('nameKey가 로케일에 없으면 throw', () => {
    const swords = parseSwords([row({ level: 0 })])
    expect(() => assertNameKeysResolve(swords, new Set())).toThrow()
  })
})

describe('parseSwords — 스프라이트 폴백', () => {
  it('전용 스프라이트는 그대로 유지한다', () => {
    const swords = parseSwords([
      row({ level: 0, sprite: 'a.png' }),
      row({ level: 1, sprite: 'b.png' }),
    ])
    expect(swords[0].sprite).toBe('a.png')
    expect(swords[1].sprite).toBe('b.png')
  })

  it('스프라이트가 없는 단계는 마지막(최고 단계) 보유 스프라이트로 채운다', () => {
    const swords = parseSwords([
      row({ level: 0, sprite: 'a.png' }),
      row({ level: 1, sprite: 'b.png' }),
      row({ level: 2 }),
      row({ level: 3 }),
    ])
    expect(swords[2].sprite).toBe('b.png')
    expect(swords[3].sprite).toBe('b.png')
  })

  it('입력 순서가 뒤섞여도 정렬 후 최고 단계 스프라이트를 폴백으로 쓴다', () => {
    const swords = parseSwords([
      row({ level: 3 }),
      row({ level: 1, sprite: 'b.png' }),
      row({ level: 0, sprite: 'a.png' }),
      row({ level: 2 }),
    ])
    // 보유 스프라이트 중 최고 단계는 +1(b.png)이므로 +2·+3 은 b.png 로 채워진다.
    expect(swords.map((s) => s.sprite)).toEqual([
      'a.png',
      'b.png',
      'b.png',
      'b.png',
    ])
  })
})

describe('loadSwords — 실제 번들 데이터(swords.json)', () => {
  it('+0~+29 전체(30단계)를 로드하고 단계가 연속한다', () => {
    const swords = loadSwords()
    expect(swords).toHaveLength(30)
    expect(swords.map((s) => s.level)).toEqual(
      Array.from({ length: 30 }, (_, i) => i),
    )
  })

  it('최종 단계(+29)는 강화 불가다', () => {
    const last = loadSwords().find((s) => s.level === 29)
    expect(last?.enhanceCost).toBeNull()
    expect(last?.successRate).toBeNull()
  })

  it('진행 체인(nextId)이 +0에서 시작해 +29(최종)까지 끊김 없이 이어진다', () => {
    const byId = new Map(loadSwords().map((s) => [s.id, s]))
    let cur = byId.get('sword_0')
    let hops = 0
    while (cur && cur.nextId !== null) {
      cur = byId.get(cur.nextId)
      hops++
    }
    expect(hops).toBe(29) // 0→1→…→29
    expect(cur?.id).toBe('sword_29')
    expect(cur?.nextId).toBeNull()
  })

  it('이지버그 단계(+26~+28)는 파괴보호장치 사용 불가다', () => {
    const swords = loadSwords()
    for (const level of [26, 27, 28]) {
      expect(swords.find((s) => s.level === level)?.protectionTickets).toBe(
        'disabled',
      )
    }
  })

  it('모든 nameKey가 ko 리소스에 존재한다(load-time 보장)', () => {
    expect(() => loadSwords()).not.toThrow()
  })

  it('+0~+29 전 단계가 고유한 전용 스프라이트를 가진다(폴백 불필요)', () => {
    const sprites = loadSwords().map((s) => s.sprite)
    expect(sprites.every((s) => s.length > 0)).toBe(true)
    expect(new Set(sprites).size).toBe(30)
  })

  it('대표 단계의 스프라이트가 올바르게 매핑된다', () => {
    const swords = loadSwords()
    const spriteOf = (level: number) =>
      swords.find((s) => s.level === level)?.sprite
    expect(spriteOf(0)).toBe('rusty_dagger.png')
    expect(spriteOf(4)).toBe('burning_sword.png')
    expect(spriteOf(5)).toBe('frost_sword.png')
    expect(spriteOf(14)).toBe('apophis_the_demon_sword.png')
    expect(spriteOf(19)).toBe('wangpuyasha.png')
    expect(spriteOf(25)).toBe('unimposing_sword.png')
    expect(spriteOf(29)).toBe('flame_tempered_sword.png')
  })
})
