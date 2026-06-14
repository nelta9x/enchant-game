import { describe, it, expect } from 'vitest'
import { Enhancer, PROTECTION_TICKET_ID, type EnhanceInput } from './enhancer'
import type { SwordData } from '../data/types'

// 결정적 PRNG(mulberry32). 시드가 같으면 같은 수열 → 확률 테스트가 비결정적이지 않다.
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// 결정적 rng 센티넬. 성공 판정은 `rng() < rate`(enhancer.ts)이므로:
//   alwaysSucceeds: 0 → rate>0 인 모든 검에서 0 < rate (성공 강제)
//   alwaysFails:    1 → 모든 rate(≤1)에서 1 >= rate (실패 강제)
// 과거의 0.9999 는 rate=1 인 검에서 0.9999 < 1 → 성공해버려 "항상 실패"로 부적합했다.
const alwaysSucceeds = () => 0
const alwaysFails = () => 1

// 결정적 시퀀스 rng — 호출마다 values 를 차례로 반환(끝나면 처음부터 순환). 헛방/파괴 2차 굴림처럼
// "1차는 실패시키고 2차에서 특정 분기를 강제"하는 다단 판정을 결정적으로 검증하는 데 쓴다.
function seq(...values: number[]): () => number {
  let i = 0
  return () => values[i++ % values.length]
}

// 검 정의 픽스처. 엔진 테스트에 필요한 필드만 골라 덮어쓴다.
function sword(over: Partial<SwordData> = {}): SwordData {
  const level = over.level ?? 10
  return {
    id: `sword_${level}`,
    nextId: `sword_${level + 1}`,
    level,
    // 엔진은 nameKey를 읽지 않지만, level override 시에도 id/nextId/level과 어긋나지 않도록 파생한다.
    nameKey: `sword.${level}.name` as SwordData['nameKey'],
    enchantCost: { kind: 'gold', amount: 100 },
    successRate: 0.5,
    sellPrice: 1000,
    protectionTickets: 0,
    // 헛방/파괴 가중치 기본값은 "실패 = 파괴"(헛방 0)로 둔다 — 기존 실패 테스트가 그대로 파괴를 내고,
    // 추첨(rng)도 소비하지 않아(엔진이 한쪽 weight 0 이면 단락) 통계 테스트의 결정성이 유지된다.
    // 헛방을 검증하는 테스트는 whiffWeight 를 명시적으로 켠다.
    whiffWeight: 0,
    destroyWeight: 1,
    dropOnFail: [],
    notes: [],
    sprite: 'placeholder.png',
    ...over,
  }
}

const RICH: EnhanceInput['supply'] = { gold: 1_000_000, items: [] }

describe('Enhancer — 확률 판정', () => {
  // req 1: 여러 번 실행 시 관측 성공률이 successRate 에 수렴한다.
  // 서로 다른 두 rate 로 검증해 "rate 파라미터가 빈도를 좌우함"을 증명한다
  // (0.5만 테스트하면 엔진이 rate 를 무시하고 동전던지기를 해도 통과하므로).
  it('관측 성공률이 successRate(0.5 / 0.9)에 수렴한다', () => {
    const N = 20000
    for (const rate of [0.5, 0.9]) {
      const enhancer = new Enhancer(mulberry32(1234))
      const s = sword({ successRate: rate })
      let success = 0
      for (let i = 0; i < N; i++) {
        if (enhancer.enhance({ sword: s, supply: RICH }).outcome === 'success')
          success++
      }
      // 허용오차 0.03 → 0.9 구간[0.87,0.93]은 0.5를, 0.5 구간[0.47,0.53]은 0.9를 배제.
      expect(Math.abs(success / N - rate)).toBeLessThan(0.03)
    }
  })

  it('rng < successRate 면 성공, 그 이상이면 (방지 없으면) 파괴', () => {
    const s = sword({ successRate: 0.5 })
    expect(
      new Enhancer(alwaysSucceeds).enhance({ sword: s, supply: RICH }).outcome,
    ).toBe('success')
    expect(
      new Enhancer(alwaysFails).enhance({ sword: s, supply: RICH }).outcome,
    ).toBe('destroyed')
  })
})

describe('Enhancer — 재료 부족 (req 2)', () => {
  it('골드가 부족하면 throw', () => {
    const s = sword({ enchantCost: { kind: 'gold', amount: 500 } })
    expect(() =>
      new Enhancer(alwaysSucceeds).enhance({
        sword: s,
        supply: { gold: 100, items: [] },
      }),
    ).toThrow()
  })

  it('아이템 재료가 부족하면 throw, 충분하면 진행한다', () => {
    const s = sword({
      enchantCost: { kind: 'item', itemId: 'sword_19', count: 1 },
    })
    expect(() =>
      new Enhancer(alwaysSucceeds).enhance({
        sword: s,
        supply: { gold: 0, items: [] },
      }),
    ).toThrow()
    const ok = new Enhancer(alwaysSucceeds).enhance({
      sword: s,
      supply: { gold: 0, items: [{ itemId: 'sword_19', count: 1 }] },
    })
    expect(ok.outcome).toBe('success')
  })

  it('최종 단계(enchantCost null)는 강화할 수 없다 — throw', () => {
    const terminal = sword({ enchantCost: null, successRate: null })
    expect(() =>
      new Enhancer(alwaysSucceeds).enhance({ sword: terminal, supply: RICH }),
    ).toThrow()
  })

  it('canEnhance 는 전제조건 충족 여부를 반환한다(비던짐)', () => {
    const s = sword({ enchantCost: { kind: 'gold', amount: 500 } })
    const enhancer = new Enhancer(alwaysSucceeds)
    expect(
      enhancer.canEnhance({ sword: s, supply: { gold: 100, items: [] } }),
    ).toBe(false)
    expect(
      enhancer.canEnhance({ sword: s, supply: { gold: 500, items: [] } }),
    ).toBe(true)
  })
})

describe('Enhancer — 파괴 시 드랍 (req 3)', () => {
  it('파괴보호장치 없이 실패하면 파괴되고 dropOnFail 이 drops 로 산출된다', () => {
    const s = sword({
      successRate: 0.5,
      dropOnFail: [{ itemId: 'iron_scrap', count: 1, chance: 1 }],
      protectionTickets: 3,
    })
    const r = new Enhancer(alwaysFails).enhance({ sword: s, supply: RICH })
    expect(r.outcome).toBe('destroyed')
    expect(r.toId).toBeNull()
    expect(r.drops).toEqual([{ itemId: 'iron_scrap', count: 1 }])
  })

  it('dropOnFail 수량이 1보다 크면 그 수량만큼 drops 로 산출된다', () => {
    const s = sword({
      successRate: 0.5,
      dropOnFail: [{ itemId: 'iron_scrap', count: 10, chance: 1 }],
    })
    const r = new Enhancer(alwaysFails).enhance({ sword: s, supply: RICH })
    expect(r.outcome).toBe('destroyed')
    expect(r.drops).toEqual([{ itemId: 'iron_scrap', count: 10 }])
  })

  it('dropOnFail 이 비어 있으면 파괴돼도 drops 가 비어 있다', () => {
    const s = sword({ successRate: 0.5, dropOnFail: [] })
    const r = new Enhancer(alwaysFails).enhance({ sword: s, supply: RICH })
    expect(r.outcome).toBe('destroyed')
    expect(r.drops).toEqual([])
  })

  it('여러 후보가 모두 chance 1 이면 파괴 시 전부 동시에 드랍된다(한 번에 N종)', () => {
    const s = sword({
      successRate: 0.5,
      dropOnFail: [
        { itemId: 'iron_scrap', count: 2, chance: 1 },
        { itemId: 'dark_matter', count: 1, chance: 1 },
      ],
    })
    const r = new Enhancer(alwaysFails).enhance({ sword: s, supply: RICH })
    expect(r.outcome).toBe('destroyed')
    expect(r.drops).toEqual([
      { itemId: 'iron_scrap', count: 2 },
      { itemId: 'dark_matter', count: 1 },
    ])
  })

  it('chance<1 후보는 독립 롤로 포함/제외된다(결정적 rng)', () => {
    const s = sword({
      successRate: 0.5,
      dropOnFail: [{ itemId: 'iron_scrap', count: 1, chance: 0.3 }],
    })
    // 1차 rng≥0.5 → 실패(파괴 확정 — 헛방/파괴 weight 0:1 이라 2차는 rng 미소비). 다음 rng = 드랍 롤.
    const hit = new Enhancer(seq(0.9, 0.2)).enhance({ sword: s, supply: RICH })
    expect(hit.drops).toEqual([{ itemId: 'iron_scrap', count: 1 }]) // 0.2 < 0.3 → 드랍
    const miss = new Enhancer(seq(0.9, 0.5)).enhance({ sword: s, supply: RICH })
    expect(miss.drops).toEqual([]) // 0.5 < 0.3 거짓 → 미드랍
  })

  it('확정(chance 1) 후보는 rng 미소비로 항상 포함되고, 확률 후보만 굴려진다', () => {
    const s = sword({
      successRate: 0.5,
      dropOnFail: [
        { itemId: 'iron_scrap', count: 5, chance: 1 }, // 확정 — rng 소비 안 함
        { itemId: 'dark_matter', count: 1, chance: 0.5 }, // 확률 — rng 1회
      ],
    })
    // seq(0.9, 0.1): 1차 0.9 → 실패. 확정 후보가 rng 를 소비했다면 확률 후보 롤은 0.9 가 되어 미드랍될 것.
    // 0.1 이 확률 후보 롤로 쓰였다는 것(0.1<0.5 → 드랍)이 곧 확정 후보가 rng 미소비임을 증명한다.
    const r = new Enhancer(seq(0.9, 0.1)).enhance({ sword: s, supply: RICH })
    expect(r.drops).toEqual([
      { itemId: 'iron_scrap', count: 5 },
      { itemId: 'dark_matter', count: 1 },
    ])
  })
})

describe('Enhancer — 헛방(whiff) 분기', () => {
  it('헛방 weight 만 양수면 실패 시 항상 헛방 — 검 보존·드랍 없음(dropOnFail 있어도)', () => {
    const s = sword({
      successRate: 0.5,
      whiffWeight: 1,
      destroyWeight: 0,
      dropOnFail: [{ itemId: 'iron_scrap', count: 1, chance: 1 }],
    })
    const r = new Enhancer(alwaysFails).enhance({ sword: s, supply: RICH })
    expect(r.outcome).toBe('whiff')
    expect(r.toId).toBe(s.id) // 검 보존(같은 검 id)
    expect(r.drops).toEqual([]) // 파괴가 아니므로 드랍 없음
  })

  it('파괴 weight 만 양수면 실패 시 항상 파괴(헛방 0 = 기존 동작)', () => {
    const s = sword({ successRate: 0.5, whiffWeight: 0, destroyWeight: 1 })
    const r = new Enhancer(alwaysFails).enhance({ sword: s, supply: RICH })
    expect(r.outcome).toBe('destroyed')
    expect(r.toId).toBeNull()
  })

  it('헛방이어도 강화 비용은 소모된다(검만 보존)', () => {
    const s = sword({
      enchantCost: { kind: 'gold', amount: 100 },
      successRate: 0.5,
      whiffWeight: 1,
      destroyWeight: 0,
    })
    const r = new Enhancer(alwaysFails).enhance({ sword: s, supply: RICH })
    expect(r.outcome).toBe('whiff')
    expect(r.consumed.gold).toBe(100)
  })

  // 두 가지 비율로 검증해 "weight 가 분포를 좌우함"을 증명한다(3:7 만 보면 엔진이 weight 를 무시하고
  // 30% 동전을 던져도 통과하므로 7:3 도 함께 본다). successRate 0 으로 매 시도를 실패시켜 2차 굴림만 본다.
  it('헛방/파괴 관측 비율이 weight(3:7 / 7:3)에 수렴한다', () => {
    const N = 20000
    for (const [w, d, expected] of [
      [3, 7, 0.3],
      [7, 3, 0.7],
    ] as const) {
      const enhancer = new Enhancer(mulberry32(4321))
      const s = sword({ successRate: 0, whiffWeight: w, destroyWeight: d })
      let whiff = 0
      for (let i = 0; i < N; i++) {
        if (enhancer.enhance({ sword: s, supply: RICH }).outcome === 'whiff')
          whiff++
      }
      expect(Math.abs(whiff / N - expected)).toBeLessThan(0.03)
    }
  })

  it('파괴보호장치가 헛방보다 우선한다(실패+useProtection → 헛방 굴림 전에 protected)', () => {
    const s = sword({
      level: 14,
      successRate: 0.5,
      whiffWeight: 3,
      destroyWeight: 7,
      protectionTickets: 3,
    })
    const supply: EnhanceInput['supply'] = {
      gold: 1000,
      items: [{ itemId: PROTECTION_TICKET_ID, count: 5 }],
    }
    const r = new Enhancer(alwaysFails).enhance({
      sword: s,
      supply,
      useProtection: true,
    })
    expect(r.outcome).toBe('protected')
  })

  it('헛방·파괴 weight 가 둘 다 양수면 2차 굴림으로 갈린다(결정적 rng)', () => {
    const s = sword({ successRate: 0.5, whiffWeight: 3, destroyWeight: 7 })
    // 1차 rng=1 → 1 < 0.5 거짓(실패). 2차에서 분기:
    //  weightedIndex([3,7], r): r=rng×10. rng=0 → 0<3 → idx0(헛방). rng=0.9 → 9, 폴백 idx1(파괴).
    expect(
      new Enhancer(seq(1, 0)).enhance({ sword: s, supply: RICH }).outcome,
    ).toBe('whiff')
    expect(
      new Enhancer(seq(1, 0.9)).enhance({ sword: s, supply: RICH }).outcome,
    ).toBe('destroyed')
  })
})

describe('Enhancer — 파괴보호장치 (req 4)', () => {
  const protectable = sword({
    level: 14,
    successRate: 0.5,
    dropOnFail: [{ itemId: 'iron_scrap', count: 1, chance: 1 }],
    protectionTickets: 3,
  })
  const withTickets: EnhanceInput['supply'] = {
    gold: 1000,
    items: [{ itemId: PROTECTION_TICKET_ID, count: 5 }],
  }

  it('파괴보호장치 사용 시 실패해도 보존되고, 드랍이 없으며, 파괴보호장치가 소모된다', () => {
    const r = new Enhancer(alwaysFails).enhance({
      sword: protectable,
      supply: withTickets,
      useProtection: true,
    })
    expect(r.outcome).toBe('protected')
    expect(r.toId).toBe('sword_14') // 같은 검 유지(id)
    expect(r.drops).toEqual([]) // 방지 시 드랍 없음
    if (r.outcome === 'protected') {
      expect(r.protectionUsed).toBe(3)
      expect(r.consumed.items).toContainEqual({
        itemId: PROTECTION_TICKET_ID,
        count: 3,
      })
    }
  })

  it('성공 시에는 (useProtection=true 라도) 파괴보호장치를 소모하지 않는다', () => {
    const r = new Enhancer(alwaysSucceeds).enhance({
      sword: protectable,
      supply: withTickets,
      useProtection: true,
    })
    expect(r.outcome).toBe('success')
    expect(
      r.consumed.items.find((i) => i.itemId === PROTECTION_TICKET_ID),
    ).toBeUndefined()
  })

  it('파괴보호장치가 부족하면 throw', () => {
    const supply: EnhanceInput['supply'] = {
      gold: 1000,
      items: [{ itemId: PROTECTION_TICKET_ID, count: 2 }],
    }
    expect(() =>
      new Enhancer(alwaysFails).enhance({
        sword: protectable,
        supply,
        useProtection: true,
      }),
    ).toThrow()
  })

  it('protectionTickets=0 단계에서 useProtection 은 throw(무료 보호 버그 방지)', () => {
    const s = sword({ level: 3, successRate: 0.9, protectionTickets: 0 })
    expect(() =>
      new Enhancer(alwaysFails).enhance({
        sword: s,
        supply: withTickets,
        useProtection: true,
      }),
    ).toThrow()
  })

  it("'disabled'(이지버그) 단계에서 useProtection 은 throw", () => {
    const s = sword({
      level: 26,
      successRate: 0.5,
      protectionTickets: 'disabled',
    })
    expect(() =>
      new Enhancer(alwaysFails).enhance({
        sword: s,
        supply: withTickets,
        useProtection: true,
      }),
    ).toThrow()
  })
})
