import { describe, it, expect } from 'vitest'
import { parseCommissionConfig, loadCommission } from './loadCommission'
import { loadSwords } from './loadSwords'
import { loadItems } from './loadItems'
import { PROTECTION_TICKET_ID } from '../game/enhancer'

// 출제 가능 itemId 집합(판매 가능 검 ∪ 카탈로그) — 테스트용 최소셋.
const KNOWN = new Set([
  'sword_3',
  'sword_4',
  'sword_5',
  'sword_6',
  'iron_scrap',
])

// 최소 유효 아이템 항목 헬퍼(아이템별 incentive/additive 범위 포함).
function itemEntry(
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    itemId: 'sword_3',
    weight: 3,
    incentiveMin: 1.0,
    incentiveMax: 2.0,
    additiveMin: 0,
    additiveMax: 100,
    ...over,
  }
}

// 최소 유효 티어 헬퍼(시작 티어 — upgradeCost 없음). override 로 개별 필드만 바꿔 검증 경로를 테스트한다.
function tier(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    items: [itemEntry(), itemEntry({ itemId: 'iron_scrap', weight: 2 })],
    ...over,
  }
}

// 최소 유효 설정 헬퍼.
function cfg(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    maxCommissions: 3,
    unlockAtLevel: 10,
    sessionAttempts: 3,
    tiers: [tier()],
    ...over,
  }
}

// parseCommissionConfig 의 짧은 호출 래퍼(테스트용 knownItemIds 주입).
function parse(
  over: Record<string, unknown> = {},
  known: ReadonlySet<string> = KNOWN,
) {
  return parseCommissionConfig(cfg(over), known)
}

describe('parseCommissionConfig — 구조 검증', () => {
  it('유효한 설정을 그대로 파싱한다', () => {
    // 로더가 누락 필드를 정규화한다: costKind 'item', requiredCount 1, rewardKind 'gold'.
    const itemFields = {
      costKind: 'item',
      requiredCount: 1,
      rewardKind: 'gold',
      incentiveMin: 1.0,
      incentiveMax: 2.0,
      additiveMin: 0,
      additiveMax: 100,
    }
    expect(parse()).toEqual({
      maxCommissions: 3,
      unlockAtLevel: 10,
      sessionAttempts: 3,
      tiers: [
        {
          upgradeCost: null,
          items: [
            { itemId: 'sword_3', weight: 3, ...itemFields },
            { itemId: 'iron_scrap', weight: 2, ...itemFields },
          ],
        },
      ],
    })
  })

  it('루트가 객체가 아니면 throw', () => {
    expect(() => parseCommissionConfig([], KNOWN)).toThrow()
    expect(() => parseCommissionConfig(null, KNOWN)).toThrow()
  })

  it('글로벌 필드 누락/비숫자/비유한 값은 throw', () => {
    expect(() => parse({ maxCommissions: 'x' })).toThrow()
    expect(() => parse({ maxCommissions: Infinity })).toThrow()
    expect(() => parse({ maxCommissions: undefined })).toThrow()
  })

  it('정수여야 하는 글로벌 필드에 소수가 오면 throw', () => {
    expect(() => parse({ maxCommissions: 2.5 })).toThrow()
  })

  it('unlockAtLevel 은 필수다 — 누락/비숫자/비유한/소수면 throw', () => {
    expect(() => parse({ unlockAtLevel: undefined })).toThrow()
    expect(() => parse({ unlockAtLevel: 'x' })).toThrow()
    expect(() => parse({ unlockAtLevel: Infinity })).toThrow()
    expect(() => parse({ unlockAtLevel: 1.5 })).toThrow()
  })

  it('sessionAttempts 는 필수다 — 누락/비숫자/비유한/소수면 throw', () => {
    expect(() => parse({ sessionAttempts: undefined })).toThrow()
    expect(() => parse({ sessionAttempts: 'x' })).toThrow()
    expect(() => parse({ sessionAttempts: Infinity })).toThrow()
    expect(() => parse({ sessionAttempts: 1.5 })).toThrow()
  })
})

describe('parseCommissionConfig — 글로벌 의미 검증', () => {
  it('maxCommissions < 1 이면 throw', () => {
    expect(() => parse({ maxCommissions: 0 })).toThrow()
  })

  it('unlockAtLevel < 0 이면 throw, 0 은 허용(처음부터 활성)', () => {
    expect(() => parse({ unlockAtLevel: -1 })).toThrow()
    expect(parse({ unlockAtLevel: 0 }).unlockAtLevel).toBe(0)
    expect(parse({ unlockAtLevel: 10 }).unlockAtLevel).toBe(10)
  })

  it('sessionAttempts < 1 이면 throw, 1 이상은 그대로', () => {
    expect(() => parse({ sessionAttempts: 0 })).toThrow()
    expect(parse({ sessionAttempts: 1 }).sessionAttempts).toBe(1)
    expect(parse({ sessionAttempts: 5 }).sessionAttempts).toBe(5)
  })
})

describe('parseCommissionConfig — tiers 구조 검증', () => {
  it('tiers 가 비어있거나 배열이 아니면 throw', () => {
    expect(() => parse({ tiers: [] })).toThrow()
    expect(() => parse({ tiers: {} })).toThrow()
  })

  it('items 가 비어있거나 배열이 아니면 throw', () => {
    expect(() => parse({ tiers: [tier({ items: [] })] })).toThrow()
    expect(() => parse({ tiers: [tier({ items: 'x' })] })).toThrow()
  })

  it('itemId 가 출제 가능 집합(판매 가능 검·카탈로그)에 없으면 throw (익스플로잇 가드)', () => {
    // sword_1(판매 불가 = 시작 검) 은 KNOWN 에 없다 → 거부(무한 골드 익스플로잇 차단).
    expect(() =>
      parse({
        tiers: [tier({ items: [{ itemId: 'sword_1', weight: 1 }] })],
      }),
    ).toThrow()
    // 오타/미지의 itemId 도 즉시 실패.
    expect(() =>
      parse({ tiers: [tier({ items: [{ itemId: 'nope', weight: 1 }] })] }),
    ).toThrow()
  })

  it('weight 가 0 이하거나 비숫자면 throw', () => {
    expect(() =>
      parse({
        tiers: [tier({ items: [{ itemId: 'sword_3', weight: 0 }] })],
      }),
    ).toThrow()
    expect(() =>
      parse({
        tiers: [tier({ items: [{ itemId: 'sword_3', weight: -1 }] })],
      }),
    ).toThrow()
    expect(() =>
      parse({
        tiers: [tier({ items: [{ itemId: 'sword_3', weight: 'x' }] })],
      }),
    ).toThrow()
  })

  it('itemId 가 비어있으면 throw', () => {
    expect(() =>
      parse({ tiers: [tier({ items: [{ itemId: '', weight: 1 }] })] }),
    ).toThrow()
  })

  it('아이템별 incentive/additive 범위·관계 위반은 throw', () => {
    expect(() =>
      parse({
        tiers: [tier({ items: [itemEntry({ incentiveMin: -0.1 })] })],
      }),
    ).toThrow()
    expect(() =>
      parse({
        tiers: [
          tier({
            items: [itemEntry({ incentiveMin: 3.0, incentiveMax: 2.0 })],
          }),
        ],
      }),
    ).toThrow()
    expect(() =>
      parse({ tiers: [tier({ items: [itemEntry({ additiveMin: -1 })] })] }),
    ).toThrow()
    expect(() =>
      parse({
        tiers: [
          tier({
            items: [itemEntry({ additiveMin: 200, additiveMax: 100 })],
          }),
        ],
      }),
    ).toThrow()
  })

  it('아이템별 incentive/additive 누락/비숫자는 throw', () => {
    expect(() =>
      parse({
        tiers: [tier({ items: [{ itemId: 'sword_3', weight: 1 }] })],
      }),
    ).toThrow() // incentiveMin 등 누락
  })
})

describe('parseCommissionConfig — 상점 티어·업그레이드 비용 검증', () => {
  it('시작 티어(비용 없음) + 골드 비용 티어 + 아이템 비용 티어를 Material 로 파싱한다', () => {
    const config = parse({
      tiers: [
        tier(),
        tier({ upgradeCost: { costKind: 'gold', costAmount: 500_000 } }),
        tier({
          upgradeCost: { costKind: 'item', itemId: 'iron_scrap', requiredCount: 5 },
        }),
      ],
    })
    expect(config.tiers).toHaveLength(3)
    expect(config.tiers[0].upgradeCost).toBeNull()
    expect(config.tiers[1].upgradeCost).toEqual({ kind: 'gold', amount: 500_000 })
    expect(config.tiers[2].upgradeCost).toEqual({
      kind: 'item',
      itemId: 'iron_scrap',
      count: 5,
    })
  })

  it('upgradeCost 의 costKind/requiredCount 누락은 거래 항목과 같은 규칙으로 item·1 로 정규화된다', () => {
    const config = parse({
      tiers: [tier(), tier({ upgradeCost: { itemId: 'sword_4' } })],
    })
    expect(config.tiers[1].upgradeCost).toEqual({
      kind: 'item',
      itemId: 'sword_4',
      count: 1,
    })
  })

  it('시작 티어(tiers[0])에 upgradeCost 가 있으면 throw, null 은 허용', () => {
    expect(() =>
      parse({
        tiers: [tier({ upgradeCost: { costKind: 'gold', costAmount: 1 } })],
      }),
    ).toThrow()
    expect(parse({ tiers: [tier({ upgradeCost: null })] }).tiers[0].upgradeCost).toBeNull()
  })

  it('시작 티어가 아닌 티어에 upgradeCost 가 없거나 객체가 아니면 throw', () => {
    expect(() => parse({ tiers: [tier(), tier()] })).toThrow()
    expect(() => parse({ tiers: [tier(), tier({ upgradeCost: null })] })).toThrow()
    expect(() => parse({ tiers: [tier(), tier({ upgradeCost: 500 })] })).toThrow()
  })

  it('upgradeCost 아이템이 출제 집합에 없으면 throw (비판매 검·오타 차단)', () => {
    expect(() =>
      parse({
        tiers: [tier(), tier({ upgradeCost: { itemId: 'sword_1' } })],
      }),
    ).toThrow()
    expect(() =>
      parse({
        tiers: [tier(), tier({ upgradeCost: { itemId: 'nope' } })],
      }),
    ).toThrow()
  })

  it('upgradeCost 금액/수량이 1 미만·정수 아님·costKind 오타면 throw', () => {
    expect(() =>
      parse({
        tiers: [tier(), tier({ upgradeCost: { costKind: 'gold', costAmount: 0 } })],
      }),
    ).toThrow()
    expect(() =>
      parse({
        tiers: [tier(), tier({ upgradeCost: { costKind: 'gold', costAmount: 1.5 } })],
      }),
    ).toThrow()
    expect(() =>
      parse({
        tiers: [tier(), tier({ upgradeCost: { itemId: 'iron_scrap', requiredCount: 0 } })],
      }),
    ).toThrow()
    expect(() =>
      parse({
        tiers: [tier(), tier({ upgradeCost: { costKind: 'xp', costAmount: 1 } })],
      }),
    ).toThrow()
  })
})

describe('parseCommissionConfig — 물물교환(아이템 보상) 항목', () => {
  // 납품 iron_scrap ×2 → 보상 sword_4 ×1(둘 다 KNOWN 에 있음).
  const itemRewardEntry = (
    over: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    itemId: 'iron_scrap',
    requiredCount: 2,
    weight: 1,
    rewardKind: 'item',
    rewardItemId: 'sword_4',
    rewardItemCount: 1,
    ...over,
  })

  it('유효한 아이템 보상 항목을 그대로 파싱한다', () => {
    const config = parse({ tiers: [tier({ items: [itemRewardEntry()] })] })
    expect(config.tiers[0].items[0]).toEqual({
      costKind: 'item',
      itemId: 'iron_scrap',
      requiredCount: 2,
      weight: 1,
      rewardKind: 'item',
      rewardItemId: 'sword_4',
      rewardItemCount: 1,
    })
  })

  it('rewardItemId 가 출제 집합(판매 가능 검·카탈로그)에 없으면 throw', () => {
    expect(() =>
      parse({
        tiers: [
          tier({ items: [itemRewardEntry({ rewardItemId: 'sword_1' })] }),
        ],
      }),
    ).toThrow()
  })

  it('rewardItemId 누락/빈 문자열이면 throw', () => {
    expect(() =>
      parse({
        tiers: [tier({ items: [itemRewardEntry({ rewardItemId: '' })] })],
      }),
    ).toThrow()
    expect(() =>
      parse({
        tiers: [
          tier({ items: [itemRewardEntry({ rewardItemId: undefined })] }),
        ],
      }),
    ).toThrow()
  })

  it('rewardItemCount 가 1 미만/정수 아니면 throw', () => {
    expect(() =>
      parse({
        tiers: [tier({ items: [itemRewardEntry({ rewardItemCount: 0 })] })],
      }),
    ).toThrow()
    expect(() =>
      parse({
        tiers: [
          tier({ items: [itemRewardEntry({ rewardItemCount: 1.5 })] }),
        ],
      }),
    ).toThrow()
  })

  it('requiredCount 가 1 미만/정수 아니면 throw', () => {
    expect(() =>
      parse({
        tiers: [tier({ items: [itemRewardEntry({ requiredCount: 0 })] })],
      }),
    ).toThrow()
    expect(() =>
      parse({
        tiers: [tier({ items: [itemRewardEntry({ requiredCount: 2.5 })] })],
      }),
    ).toThrow()
  })

  it("rewardKind 가 'gold'/'item' 이 아니면 throw", () => {
    expect(() =>
      parse({
        tiers: [tier({ items: [itemRewardEntry({ rewardKind: 'xp' })] })],
      }),
    ).toThrow()
  })

  it('costKind/requiredCount/rewardKind 누락 시 item·1·gold 로 정규화된다(기존 골드 의뢰 호환)', () => {
    const config = parse()
    const e = config.tiers[0].items[0]
    expect(e.costKind).toBe('item')
    if (e.costKind === 'item') expect(e.requiredCount).toBe(1)
    expect(e.rewardKind).toBe('gold')
  })
})

describe('loadCommission — 번들 데이터 진입점', () => {
  // 실제 데이터로 knownItemIds 를 구성(DataManager.load 와 동일 규칙).
  function realKnownIds(): Set<string> {
    const known = new Set<string>()
    for (const s of loadSwords()) if (s.sellPrice !== null) known.add(s.id)
    for (const it of loadItems()) known.add(it.id)
    // 파괴보호장치(카탈로그에 없는 특수 소비재)도 출제 집합에 포함한다(DataManager.load 와 동일 규칙).
    known.add(PROTECTION_TICKET_ID)
    return known
  }

  it('실제 commission.json 을 검증해 로드한다', () => {
    const known = realKnownIds()
    const config = loadCommission(known)
    expect(config.maxCommissions).toBeGreaterThanOrEqual(1)
    expect(config.sessionAttempts).toBeGreaterThanOrEqual(1)
    expect(config.tiers.length).toBeGreaterThanOrEqual(1)
    expect(config.tiers.flatMap((b) => b.items).length).toBeGreaterThan(0)
    // 상점 티어: 시작 티어는 비용 없음, 그 외 티어는 골드(금액>=1) 또는 아이템(출제 집합·수량>=1) 비용.
    expect(config.tiers[0].upgradeCost).toBeNull()
    for (let i = 1; i < config.tiers.length; i += 1) {
      const cost = config.tiers[i].upgradeCost
      expect(cost).not.toBeNull()
      if (cost?.kind === 'gold') expect(cost.amount).toBeGreaterThanOrEqual(1)
      if (cost?.kind === 'item') {
        expect(known.has(cost.itemId)).toBe(true)
        expect(cost.count).toBeGreaterThanOrEqual(1)
      }
    }
    // 모든 티어의 모든 항목 구조 검증: 비용은 아이템(납품 id 가 출제 집합·수량>=1) 또는 골드(금액>=1),
    // 보상은 골드(incentive/additive min<=max) 또는 아이템(지급 id 가 출제 집합·수량>=1).
    for (const b of config.tiers) {
      expect(b.items.length).toBeGreaterThan(0)
      for (const e of b.items) {
        expect(e.weight).toBeGreaterThan(0)
        if (e.costKind === 'gold') {
          expect(e.costAmount).toBeGreaterThanOrEqual(1)
        } else {
          expect(known.has(e.itemId)).toBe(true)
          expect(e.requiredCount).toBeGreaterThanOrEqual(1)
        }
        if (e.rewardKind === 'gold') {
          expect(e.incentiveMin).toBeLessThanOrEqual(e.incentiveMax)
          expect(e.additiveMin).toBeLessThanOrEqual(e.additiveMax)
        } else {
          expect(known.has(e.rewardItemId)).toBe(true)
          expect(e.rewardItemCount).toBeGreaterThanOrEqual(1)
        }
      }
    }
  })
})
