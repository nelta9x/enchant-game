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

// 검 정의 픽스처. 엔진 테스트에 필요한 필드만 골라 덮어쓴다.
function sword(over: Partial<SwordData> = {}): SwordData {
  const level = over.level ?? 10
  return {
    id: `sword_${level}`,
    nextId: `sword_${level + 1}`,
    level,
    // 엔진은 nameKey를 읽지 않지만, level override 시에도 id/nextId/level과 어긋나지 않도록 파생한다.
    nameKey: `sword.${level}.name` as SwordData['nameKey'],
    enhanceCost: { kind: 'gold', amount: 100 },
    successRate: 0.5,
    sellPrice: 1000,
    protectionTickets: 0,
    dropOnFail: null,
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
    const s = sword({ enhanceCost: { kind: 'gold', amount: 500 } })
    expect(() =>
      new Enhancer(alwaysSucceeds).enhance({
        sword: s,
        supply: { gold: 100, items: [] },
      }),
    ).toThrow()
  })

  it('아이템 재료가 부족하면 throw, 충분하면 진행한다', () => {
    const s = sword({
      enhanceCost: { kind: 'item', itemId: 'sword_19', count: 1 },
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

  it('최종 단계(enhanceCost null)는 강화할 수 없다 — throw', () => {
    const terminal = sword({ enhanceCost: null, successRate: null })
    expect(() =>
      new Enhancer(alwaysSucceeds).enhance({ sword: terminal, supply: RICH }),
    ).toThrow()
  })

  it('canEnhance 는 전제조건 충족 여부를 반환한다(비던짐)', () => {
    const s = sword({ enhanceCost: { kind: 'gold', amount: 500 } })
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
      dropOnFail: { itemId: 'iron_scrap', count: 1 },
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
      dropOnFail: { itemId: 'iron_scrap', count: 10 },
    })
    const r = new Enhancer(alwaysFails).enhance({ sword: s, supply: RICH })
    expect(r.outcome).toBe('destroyed')
    expect(r.drops).toEqual([{ itemId: 'iron_scrap', count: 10 }])
  })

  it('dropOnFail 이 없으면 파괴돼도 drops 가 비어 있다', () => {
    const s = sword({ successRate: 0.5, dropOnFail: null })
    const r = new Enhancer(alwaysFails).enhance({ sword: s, supply: RICH })
    expect(r.outcome).toBe('destroyed')
    expect(r.drops).toEqual([])
  })
})

describe('Enhancer — 파괴보호장치 (req 4)', () => {
  const protectable = sword({
    level: 14,
    successRate: 0.5,
    dropOnFail: { itemId: 'iron_scrap', count: 1 },
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
