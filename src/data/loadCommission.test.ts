import { describe, it, expect } from 'vitest'
import { parseCommissionConfig, loadCommission } from './loadCommission'
import { loadSwords } from './loadSwords'
import { loadItems } from './loadItems'
import { loadShop } from './loadShop'

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

// 최소 유효 버킷 헬퍼([0,∞) 단일 버킷). override 로 개별 필드만 바꿔 검증 경로를 테스트한다.
function bucket(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    minGold: 0,
    maxGold: null,
    items: [itemEntry(), itemEntry({ itemId: 'iron_scrap', weight: 2 })],
    durationMinMs: 60_000,
    durationMaxMs: 120_000,
    spawnIntervalMinMs: 5_000,
    spawnIntervalMaxMs: 30_000,
    ...over,
  }
}

// 최소 유효 설정 헬퍼.
function cfg(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    maxCommissions: 3,
    tickIntervalMs: 250,
    unlockAtLevel: 10,
    buckets: [bucket()],
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
      tickIntervalMs: 250,
      unlockAtLevel: 10,
      buckets: [
        {
          minGold: 0,
          maxGold: null,
          items: [
            { itemId: 'sword_3', weight: 3, ...itemFields },
            { itemId: 'iron_scrap', weight: 2, ...itemFields },
          ],
          durationMinMs: 60_000,
          durationMaxMs: 120_000,
          spawnIntervalMinMs: 5_000,
          spawnIntervalMaxMs: 30_000,
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
    expect(() => parse({ tickIntervalMs: Infinity })).toThrow()
    expect(() => parse({ maxCommissions: undefined })).toThrow()
  })

  it('정수여야 하는 글로벌 필드에 소수가 오면 throw', () => {
    expect(() => parse({ maxCommissions: 2.5 })).toThrow()
    expect(() => parse({ tickIntervalMs: 12.5 })).toThrow()
  })

  it('unlockAtLevel 은 필수다 — 누락/비숫자/비유한/소수면 throw', () => {
    expect(() => parse({ unlockAtLevel: undefined })).toThrow()
    expect(() => parse({ unlockAtLevel: 'x' })).toThrow()
    expect(() => parse({ unlockAtLevel: Infinity })).toThrow()
    expect(() => parse({ unlockAtLevel: 1.5 })).toThrow()
  })
})

describe('parseCommissionConfig — 글로벌 의미 검증', () => {
  it('maxCommissions < 1 이면 throw', () => {
    expect(() => parse({ maxCommissions: 0 })).toThrow()
  })

  it('tickIntervalMs <= 0 이면 throw', () => {
    expect(() => parse({ tickIntervalMs: 0 })).toThrow()
  })

  it('unlockAtLevel < 0 이면 throw, 0 은 허용(처음부터 활성)', () => {
    expect(() => parse({ unlockAtLevel: -1 })).toThrow()
    expect(parse({ unlockAtLevel: 0 }).unlockAtLevel).toBe(0)
    expect(parse({ unlockAtLevel: 10 }).unlockAtLevel).toBe(10)
  })
})

describe('parseCommissionConfig — buckets 구조 검증', () => {
  it('buckets 가 비어있거나 배열이 아니면 throw', () => {
    expect(() => parse({ buckets: [] })).toThrow()
    expect(() => parse({ buckets: {} })).toThrow()
  })

  it('items 가 비어있거나 배열이 아니면 throw', () => {
    expect(() => parse({ buckets: [bucket({ items: [] })] })).toThrow()
    expect(() => parse({ buckets: [bucket({ items: 'x' })] })).toThrow()
  })

  it('itemId 가 출제 가능 집합(판매 가능 검·카탈로그)에 없으면 throw (익스플로잇 가드)', () => {
    // sword_1(판매 불가 = 시작 검) 은 KNOWN 에 없다 → 거부(무한 골드 익스플로잇 차단).
    expect(() =>
      parse({
        buckets: [bucket({ items: [{ itemId: 'sword_1', weight: 1 }] })],
      }),
    ).toThrow()
    // 오타/미지의 itemId 도 즉시 실패.
    expect(() =>
      parse({ buckets: [bucket({ items: [{ itemId: 'nope', weight: 1 }] })] }),
    ).toThrow()
  })

  it('weight 가 0 이하거나 비숫자면 throw', () => {
    expect(() =>
      parse({ buckets: [bucket({ items: [{ itemId: 'sword_3', weight: 0 }] })] }),
    ).toThrow()
    expect(() =>
      parse({
        buckets: [bucket({ items: [{ itemId: 'sword_3', weight: -1 }] })],
      }),
    ).toThrow()
    expect(() =>
      parse({
        buckets: [bucket({ items: [{ itemId: 'sword_3', weight: 'x' }] })],
      }),
    ).toThrow()
  })

  it('itemId 가 비어있으면 throw', () => {
    expect(() =>
      parse({ buckets: [bucket({ items: [{ itemId: '', weight: 1 }] })] }),
    ).toThrow()
  })

  it('아이템별 incentive/additive 범위·관계 위반은 throw', () => {
    expect(() =>
      parse({
        buckets: [bucket({ items: [itemEntry({ incentiveMin: -0.1 })] })],
      }),
    ).toThrow()
    expect(() =>
      parse({
        buckets: [
          bucket({
            items: [itemEntry({ incentiveMin: 3.0, incentiveMax: 2.0 })],
          }),
        ],
      }),
    ).toThrow()
    expect(() =>
      parse({ buckets: [bucket({ items: [itemEntry({ additiveMin: -1 })] })] }),
    ).toThrow()
    expect(() =>
      parse({
        buckets: [
          bucket({ items: [itemEntry({ additiveMin: 200, additiveMax: 100 })] }),
        ],
      }),
    ).toThrow()
  })

  it('아이템별 incentive/additive 누락/비숫자는 throw', () => {
    expect(() =>
      parse({ buckets: [bucket({ items: [{ itemId: 'sword_3', weight: 1 }] })] }),
    ).toThrow() // incentiveMin 등 누락
  })

  it('durationMin > durationMax 이면 throw', () => {
    expect(() =>
      parse({ buckets: [bucket({ durationMinMs: 200_000 })] }),
    ).toThrow()
  })

  it('spawnIntervalMin > spawnIntervalMax 이면 throw', () => {
    expect(() =>
      parse({ buckets: [bucket({ spawnIntervalMinMs: 40_000 })] }),
    ).toThrow()
  })
})

describe('parseCommissionConfig — 골드 버킷 커버리지 검증', () => {
  // 유효한 2버킷 연속 구성([0,500000) + [500000,∞)) — 정상 파싱.
  it('연속하는 2버킷([0,X)+[X,∞))을 그대로 파싱한다', () => {
    const config = parse({
      buckets: [
        bucket({ minGold: 0, maxGold: 500_000 }),
        bucket({ minGold: 500_000, maxGold: null }),
      ],
    })
    expect(config.buckets).toHaveLength(2)
    expect(config.buckets[0].maxGold).toBe(500_000)
    expect(config.buckets[1].maxGold).toBeNull()
  })

  it('첫 버킷 minGold 가 0 이 아니면 throw', () => {
    expect(() =>
      parse({ buckets: [bucket({ minGold: 100, maxGold: null })] }),
    ).toThrow()
  })

  it('마지막 버킷 maxGold 가 null 이 아니면 throw', () => {
    expect(() =>
      parse({ buckets: [bucket({ minGold: 0, maxGold: 500_000 })] }),
    ).toThrow()
  })

  it('버킷 사이에 빈틈(gap)이 있으면 throw', () => {
    expect(() =>
      parse({
        buckets: [
          bucket({ minGold: 0, maxGold: 500_000 }),
          bucket({ minGold: 600_000, maxGold: null }), // 500000~600000 빈틈
        ],
      }),
    ).toThrow()
  })

  it('버킷 사이에 겹침(overlap)이 있으면 throw', () => {
    expect(() =>
      parse({
        buckets: [
          bucket({ minGold: 0, maxGold: 500_000 }),
          bucket({ minGold: 400_000, maxGold: null }), // 400000~500000 겹침
        ],
      }),
    ).toThrow()
  })

  it('마지막이 아닌 버킷의 maxGold 가 null 이면 throw(비말단 ∞)', () => {
    expect(() =>
      parse({
        buckets: [
          bucket({ minGold: 0, maxGold: null }),
          bucket({ minGold: 500_000, maxGold: null }),
        ],
      }),
    ).toThrow()
  })

  it('버킷 minGold >= maxGold 이면 throw', () => {
    expect(() =>
      parse({ buckets: [bucket({ minGold: 0, maxGold: 0 })] }),
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
    const config = parse({ buckets: [bucket({ items: [itemRewardEntry()] })] })
    expect(config.buckets[0].items[0]).toEqual({
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
        buckets: [
          bucket({ items: [itemRewardEntry({ rewardItemId: 'sword_1' })] }),
        ],
      }),
    ).toThrow()
  })

  it('rewardItemId 누락/빈 문자열이면 throw', () => {
    expect(() =>
      parse({
        buckets: [bucket({ items: [itemRewardEntry({ rewardItemId: '' })] })],
      }),
    ).toThrow()
    expect(() =>
      parse({
        buckets: [
          bucket({ items: [itemRewardEntry({ rewardItemId: undefined })] }),
        ],
      }),
    ).toThrow()
  })

  it('rewardItemCount 가 1 미만/정수 아니면 throw', () => {
    expect(() =>
      parse({
        buckets: [bucket({ items: [itemRewardEntry({ rewardItemCount: 0 })] })],
      }),
    ).toThrow()
    expect(() =>
      parse({
        buckets: [
          bucket({ items: [itemRewardEntry({ rewardItemCount: 1.5 })] }),
        ],
      }),
    ).toThrow()
  })

  it('requiredCount 가 1 미만/정수 아니면 throw', () => {
    expect(() =>
      parse({
        buckets: [bucket({ items: [itemRewardEntry({ requiredCount: 0 })] })],
      }),
    ).toThrow()
    expect(() =>
      parse({
        buckets: [bucket({ items: [itemRewardEntry({ requiredCount: 2.5 })] })],
      }),
    ).toThrow()
  })

  it("rewardKind 가 'gold'/'item' 이 아니면 throw", () => {
    expect(() =>
      parse({
        buckets: [bucket({ items: [itemRewardEntry({ rewardKind: 'xp' })] })],
      }),
    ).toThrow()
  })

  it('costKind/requiredCount/rewardKind 누락 시 item·1·gold 로 정규화된다(기존 골드 의뢰 호환)', () => {
    const config = parse()
    const e = config.buckets[0].items[0]
    expect(e.costKind).toBe('item')
    if (e.costKind === 'item') expect(e.requiredCount).toBe(1)
    expect(e.rewardKind).toBe('gold')
  })

  it('항목 전용 duration 오버라이드를 파싱한다(min<=max)', () => {
    const config = parse({
      buckets: [
        bucket({
          items: [
            itemRewardEntry({ durationMinMs: 20_000, durationMaxMs: 40_000 }),
          ],
        }),
      ],
    })
    expect(config.buckets[0].items[0]).toMatchObject({
      durationMinMs: 20_000,
      durationMaxMs: 40_000,
    })
  })

  it('항목 duration 이 min>max 이거나 한쪽만 있으면 throw', () => {
    expect(() =>
      parse({
        buckets: [
          bucket({
            items: [
              itemRewardEntry({ durationMinMs: 50_000, durationMaxMs: 40_000 }),
            ],
          }),
        ],
      }),
    ).toThrow()
    expect(() =>
      parse({
        buckets: [
          bucket({ items: [itemRewardEntry({ durationMinMs: 20_000 })] }),
        ],
      }),
    ).toThrow()
  })
})

describe('loadCommission — 번들 데이터 진입점', () => {
  // 실제 데이터로 knownItemIds 를 구성(DataManager.load 와 동일 규칙).
  function realKnownIds(): Set<string> {
    const known = new Set<string>()
    for (const s of loadSwords()) if (s.sellPrice !== null) known.add(s.id)
    for (const it of loadItems()) known.add(it.id)
    // 상점이 지급하는 itemId(파괴방지권 등)도 출제 집합에 포함한다(DataManager.load 와 동일 규칙).
    for (const sku of loadShop()) known.add(sku.itemId)
    return known
  }

  it('실제 commission.json 을 검증해 로드한다', () => {
    const known = realKnownIds()
    const config = loadCommission(known)
    expect(config.maxCommissions).toBeGreaterThanOrEqual(1)
    expect(config.buckets.length).toBeGreaterThanOrEqual(1)
    expect(config.buckets.flatMap((b) => b.items).length).toBeGreaterThan(0)
    // 골드 버킷 커버리지: 첫 버킷 minGold 0, 마지막 maxGold null, 연속.
    expect(config.buckets[0].minGold).toBe(0)
    expect(config.buckets[config.buckets.length - 1].maxGold).toBeNull()
    for (let i = 1; i < config.buckets.length; i += 1) {
      expect(config.buckets[i].minGold).toBe(config.buckets[i - 1].maxGold)
    }
    // 모든 버킷의 모든 항목 구조 검증: 비용은 아이템(납품 id 가 출제 집합·수량>=1) 또는 골드(금액>=1),
    // 보상은 골드(incentive/additive min<=max) 또는 아이템(지급 id 가 출제 집합·수량>=1).
    for (const b of config.buckets) {
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
      expect(b.durationMinMs).toBeLessThanOrEqual(b.durationMaxMs)
      expect(b.spawnIntervalMinMs).toBeLessThanOrEqual(b.spawnIntervalMaxMs)
    }
  })
})
