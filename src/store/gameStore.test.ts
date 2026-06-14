import { describe, it, expect, beforeAll } from 'vitest'
import { createGameStore } from './gameStore'
import { dataManager } from '../data/DataManager'
import { Enhancer, PROTECTION_TICKET_ID } from '../game/enhancer'
import { countOf } from '../lib/items'

// gameStore는 실제 검 데이터(DataManager)에 의존한다 — 시작 시 적재.
beforeAll(() => {
  dataManager.load()
})

// 항상 성공 / 항상 실패하는 결정적 엔진.
// 실패는 rng=1 — 성공 판정이 `rng < rate`라 rate=1 인 검도 확실히 실패한다(0.9999 는 부적합).
const ALWAYS_SUCCESS = () => new Enhancer(() => 0)
const ALWAYS_FAIL = () => new Enhancer(() => 1)
// 결정적 시퀀스 rng — 호출마다 차례로 반환(끝나면 순환). 다단 판정(성공/실패 → 헛방/파괴)을 강제한다.
const seq = (...values: number[]): (() => number) => {
  let idx = 0
  return () => values[idx++ % values.length]
}
// 헛방 강제 엔진: 1차 rng=1 → 실패, 2차 rng=0 → weightedIndex 가 헛방(idx0)을 고른다
// (sword_7 은 whiffWeight·destroyWeight 둘 다 양수라 실패 시 2차 굴림이 일어난다).
const WHIFF = () => new Enhancer(seq(1, 0))

describe('gameStore — 강화 적용 (seam)', () => {
  it('성공: 골드 차감 + 단계 +1', () => {
    // 골드는 비용을 넉넉히 덮을 만큼만 둔다(액수 자체는 무관 — 비용 튜닝에 흔들리지 않게).
    const before = 1_000_000
    const store = createGameStore({
      enhancer: ALWAYS_SUCCESS(),
      gold: before,
      currentSwordId: 'sword_1',
    })
    const r = store.getState().enhance(false)
    expect(r?.outcome).toBe('success')
    // 스토어는 엔진 결과를 그대로 반영한다 — 다음 검(toId)으로 오르고 비용만큼 골드가 준다.
    // (정확한 비용 액수는 밸런스 값이므로 단언하지 않고 차감 "방향"만 본다.)
    expect(store.getState().currentSwordId).toBe(r?.toId)
    expect(store.getState().gold).toBeLessThan(before)
  })

  it('성공: 재료검(sword_20)이 items에서 차감되고 단계가 오른다', () => {
    // sword_22 는 재료(item) 비용 검 — 재료검이 items 에서 소모되는 seam 을 본다.
    const store = createGameStore({
      enhancer: ALWAYS_SUCCESS(),
      gold: 0,
      currentSwordId: 'sword_22',
      items: [{ itemId: 'sword_20', count: 2 }],
    })
    const before = countOf(store.getState().items, 'sword_20')
    const r = store.getState().enhance(false)
    expect(r?.outcome).toBe('success')
    expect(store.getState().currentSwordId).toBe(r?.toId)
    // 재료검이 items 에서 소모된다(소모 수량은 밸런스 값이므로 차감 방향만 본다).
    expect(countOf(store.getState().items, 'sword_20')).toBeLessThan(before)
  })

  it('파괴 후 인벤토리에 검이 없으면 시작 검(+1)으로 재시작 + dropOnFail 은 대기분(pendingDrops)으로', () => {
    // sword_7 은 dropOnFail 을 가진 단계 — 파괴 시 드랍이 대기분으로 가는지 본다.
    const store = createGameStore({
      enhancer: ALWAYS_FAIL(),
      gold: 1_000_000,
      currentSwordId: 'sword_7',
      items: [],
    })
    const r = store.getState().enhance(false)
    // 엔진 이벤트는 파괴(toId null)지만, 상태는 시작 검(+1)으로 재시작한다.
    expect(r?.outcome).toBe('destroyed')
    expect(r?.toId).toBeNull()
    expect(store.getState().currentSwordId).toBe('sword_1')
    // 엔진이 돌려준 드랍은 즉시 items 에 들어가지 않고 pendingDrops 로 간다(수집 연출 전까지 대기).
    expect(store.getState().pendingDrops).toEqual(r?.drops ?? [])
    for (const d of r?.drops ?? [])
      expect(countOf(store.getState().items, d.itemId)).toBe(0)
  })

  it('파괴 후 인벤토리에 검이 있어도 자동 장착하지 않고 시작 검(+1)으로 재시작한다(보관 검은 가방에 유지)', () => {
    const store = createGameStore({
      enhancer: ALWAYS_FAIL(),
      gold: 1_000_000,
      currentSwordId: 'sword_7',
      items: [{ itemId: 'sword_19', count: 1 }],
    })
    const r = store.getState().enhance(false)
    expect(r?.outcome).toBe('destroyed')
    // 보관 검(sword_19)을 자동 장착하지 않는다 — 의도치 않은 강화 방지.
    expect(store.getState().currentSwordId).toBe('sword_1')
    expect(countOf(store.getState().items, 'sword_19')).toBe(1)
    // 드랍은 대기분으로 — 아직 items 에 없다.
    expect(store.getState().pendingDrops).toEqual(r?.drops ?? [])
    for (const d of r?.drops ?? [])
      expect(countOf(store.getState().items, d.itemId)).toBe(0)
  })

  it('파괴: 드랍은 대기분에 쌓이고, 수집(flush)되면 기존 스택에 병합된다', () => {
    // 드랍 아이템과 같은 종류를 미리 가방에 쌓아 둔다(병합 대상). 어떤 아이템이 드랍되는지는
    // 데이터에서 픽스처를 고르는 용도일 뿐 — 단언은 수량 관계로만 한다.
    const dropItem = dataManager.getSwordById('sword_7')?.dropOnFail?.itemId
    expect(dropItem).toBeDefined()
    const seeded = 3
    const store = createGameStore({
      enhancer: ALWAYS_FAIL(),
      gold: 1_000_000,
      currentSwordId: 'sword_7',
      items: [{ itemId: dropItem as string, count: seeded }],
    })
    const r = store.getState().enhance(false)
    // 즉시는 기존 수량 그대로 — 드랍은 대기분에만.
    expect(countOf(store.getState().items, dropItem as string)).toBe(seeded)
    expect(store.getState().pendingDrops).toEqual(r?.drops ?? [])
    // 수집되면 기존 스택에 병합된다(중복 슬롯 없이 합산).
    const dropped = countOf(r?.drops ?? [], dropItem as string)
    store.getState().flushDrops()
    expect(countOf(store.getState().items, dropItem as string)).toBe(
      seeded + dropped,
    )
    expect(store.getState().pendingDrops).toEqual([])
  })

  it('헛방: 검 보존(현재 검 유지) + 강화 비용만 차감 + 드랍 없음', () => {
    // sword_7 은 dropOnFail 을 가진 단계지만, 헛방은 파괴가 아니라 드랍이 없어야 한다.
    const sword7 = dataManager.getSwordById('sword_7')
    const cost = sword7?.enchantCost
    const before = 1_000_000
    const store = createGameStore({
      enhancer: WHIFF(),
      gold: before,
      currentSwordId: 'sword_7',
      items: [],
    })
    const r = store.getState().enhance(false)
    expect(r?.outcome).toBe('whiff')
    // 검 보존 — 파괴(시작 검 리셋)와 달리 현재 검을 그대로 유지한다.
    expect(store.getState().currentSwordId).toBe('sword_7')
    // 파괴가 아니므로 드랍(대기분)도 없다.
    expect(store.getState().pendingDrops).toEqual([])
    expect(r?.drops).toEqual([])
    // 비용은 소모된다(파생값 — 데이터의 enchantCost 로 단언, 액수 하드코딩 아님).
    if (cost?.kind === 'gold')
      expect(store.getState().gold).toBe(before - cost.amount)
  })

  it('방지: 단계 유지 + 파괴보호장치 차감 + 드랍 없음', () => {
    const beforePt = 5
    const store = createGameStore({
      enhancer: ALWAYS_FAIL(),
      gold: 1_000_000,
      currentSwordId: 'sword_15',
      items: [{ itemId: PROTECTION_TICKET_ID, count: beforePt }],
    })
    const r = store.getState().enhance(true)
    expect(r?.outcome).toBe('protected')
    expect(store.getState().currentSwordId).toBe('sword_15') // 단계 유지
    // 파괴보호장치가 차감된다(소모량은 밸런스 값이므로 차감 방향만 본다).
    expect(countOf(store.getState().items, PROTECTION_TICKET_ID)).toBeLessThan(
      beforePt,
    )
    // 방지 성공 시 드랍 없음(items·pendingDrops 모두).
    expect(r?.drops).toEqual([])
    expect(store.getState().pendingDrops).toEqual([])
  })
})

describe('gameStore — 드랍 수집(collectDrop / flushDrops)', () => {
  it('파괴 시 dropOnFail 이 대기 드랍(pendingDrops)으로 쌓이고 items 엔 안 들어간다', () => {
    const store = createGameStore({
      enhancer: ALWAYS_FAIL(),
      gold: 1_000_000,
      currentSwordId: 'sword_15',
      items: [],
    })
    const r = store.getState().enhance(false)
    expect((r?.drops ?? []).length).toBeGreaterThan(0) // 이 단계는 dropOnFail 을 가진다(전제)
    expect(store.getState().pendingDrops).toEqual(r?.drops ?? [])
    for (const d of r?.drops ?? [])
      expect(countOf(store.getState().items, d.itemId)).toBe(0)
  })

  // dropOnFail 을 가진 단계를 ALWAYS_FAIL 로 파괴해 대기분을 만든다. 드랍 아이템·수량은 데이터에서
  // 런타임으로 읽어 관계로만 검증한다(특정 밸런스 값에 묶지 않는다).
  const destroyedWithPending = () => {
    const store = createGameStore({
      enhancer: ALWAYS_FAIL(),
      gold: 1_000_000,
      currentSwordId: 'sword_16',
      items: [],
    })
    store.getState().enhance(false)
    const drop = store.getState().pendingDrops[0]
    return { store, item: drop?.itemId as string, total: drop?.count ?? 0 }
  }

  it('collectDrop 은 대기분 한도 내에서 items 로 옮긴다(부분 수집)', () => {
    const { store, item, total } = destroyedWithPending()
    expect(total).toBeGreaterThanOrEqual(3) // 부분 수집을 보이려면 한도가 3 이상이어야 한다(전제)
    store.getState().collectDrop(item, 3)
    expect(countOf(store.getState().items, item)).toBe(3)
    expect(countOf(store.getState().pendingDrops, item)).toBe(total - 3)
  })

  it('collectDrop 은 대기분을 초과해 추가하지 않는다(과다·중복 합산 방지)', () => {
    const { store, item, total } = destroyedWithPending()
    store.getState().collectDrop(item, total + 100) // 대기분(total)까지만
    expect(countOf(store.getState().items, item)).toBe(total)
    expect(countOf(store.getState().pendingDrops, item)).toBe(0)
    // 대기분 소진 후 다시 호출해도 무변화(연출 완료 콜백이 늦게 와도 중복 합산 안 됨).
    store.getState().collectDrop(item, 5)
    expect(countOf(store.getState().items, item)).toBe(total)
  })

  it('flushDrops 는 남은 대기분을 모두 items 로 합산하고 비운다', () => {
    const { store, item, total } = destroyedWithPending()
    store.getState().collectDrop(item, 4) // 일부 수집
    store.getState().flushDrops() // 나머지 회수
    expect(countOf(store.getState().items, item)).toBe(total)
    expect(store.getState().pendingDrops).toEqual([])
  })

  it('flushDrops 는 멱등 — 대기분이 없으면 무변화', () => {
    const store = createGameStore({ items: [{ itemId: 'iron_scrap', count: 2 }] })
    store.getState().flushDrops()
    expect(countOf(store.getState().items, 'iron_scrap')).toBe(2)
    expect(store.getState().pendingDrops).toEqual([])
  })

  it('연속 파괴: 드랍이 대기분에 누적된다(merge — 유실 없음)', () => {
    // sword_7 파괴 → 시작 검(+1)으로 재시작 → 가방의 sword_10 을 명시적으로 장착 → sword_10 재파괴.
    const store = createGameStore({
      enhancer: ALWAYS_FAIL(),
      gold: 1_000_000,
      currentSwordId: 'sword_7',
      items: [{ itemId: 'sword_10', count: 1 }],
    })
    const totalOf = (xs: readonly { count: number }[]) =>
      xs.reduce((s, x) => s + x.count, 0)
    store.getState().enhance(false)
    // 파괴 후 보관 검은 자동 장착되지 않는다 — 시작 검(+1)으로 재시작, sword_10 은 가방에 유지.
    expect(store.getState().currentSwordId).toBe('sword_1')
    expect(countOf(store.getState().items, 'sword_10')).toBe(1)
    const pendingAfter1 = totalOf(store.getState().pendingDrops)
    expect(pendingAfter1).toBeGreaterThan(0) // 1차 파괴가 드랍을 남긴다(전제)
    // 재파괴를 위해 보관 검을 명시적으로 장착한 뒤 강화한다.
    store.getState().equip('sword_10')
    expect(store.getState().currentSwordId).toBe('sword_10')
    store.getState().enhance(false)
    // 2차 드랍이 기존 대기분에 누적된다(유실 없음). items 엔 아직 없다.
    const pendingAfter2 = totalOf(store.getState().pendingDrops)
    expect(pendingAfter2).toBeGreaterThan(pendingAfter1)
    const itemsBefore = totalOf(store.getState().items)
    store.getState().flushDrops()
    // flush 시 대기분 전량이 유실 없이 items 로 이동한다.
    expect(store.getState().pendingDrops).toEqual([])
    expect(totalOf(store.getState().items) - itemsBefore).toBe(pendingAfter2)
  })
})

describe('gameStore — canEnhance 게이팅', () => {
  it('골드가 부족하면 강화 불가 + enhance는 null(상태 불변)', () => {
    const store = createGameStore({ gold: 100, currentSwordId: 'sword_1' })
    expect(store.getState().canEnhance(false)).toBe(false)
    expect(store.getState().enhance(false)).toBeNull()
    expect(store.getState().gold).toBe(100)
    expect(store.getState().currentSwordId).toBe('sword_1')
  })

  it('보유 검이 없으면(null) 강화 불가', () => {
    const store = createGameStore({ currentSwordId: null, gold: 999_999 })
    expect(store.getState().canEnhance(false)).toBe(false)
    expect(store.getState().enhance(false)).toBeNull()
  })

  it('최종 단계(+30 엑스칼리버)는 강화 불가', () => {
    const store = createGameStore({
      currentSwordId: 'sword_30',
      gold: 999_999_999,
    })
    expect(store.getState().canEnhance(false)).toBe(false)
  })

  it('재료검이 없으면 강화 불가', () => {
    // level 22 비용 sword_20 ×1을 보유하지 않음(골드는 충분).
    const store = createGameStore({
      currentSwordId: 'sword_22',
      gold: 999_999_999,
      items: [],
    })
    expect(store.getState().canEnhance(false)).toBe(false)
  })
})

describe('gameStore — 판매', () => {
  it('판매가만큼 골드를 받고, 인벤토리에 검이 없으면 시작 검(+1)을 배치한다', () => {
    const before = 1000
    const store = createGameStore({ gold: before, currentSwordId: 'sword_6' })
    expect(store.getState().canSell()).toBe(true)
    const got = store.getState().sell()
    // 받은 판매가는 양수이고, 골드는 정확히 그만큼 증가한다(액수 자체는 밸런스 값 — 관계만 본다).
    expect(got ?? 0).toBeGreaterThan(0)
    expect(store.getState().gold).toBe(before + (got ?? 0))
    expect(store.getState().currentSwordId).toBe('sword_1')
  })

  it('판매 후 인벤토리에 검이 있어도 자동 장착하지 않고 시작 검(+1)으로 재시작한다(보관 검은 가방에 유지)', () => {
    const before = 0
    const store = createGameStore({
      gold: before,
      currentSwordId: 'sword_6',
      items: [{ itemId: 'sword_19', count: 1 }],
    })
    const got = store.getState().sell()
    expect(got ?? 0).toBeGreaterThan(0)
    expect(store.getState().gold).toBe(before + (got ?? 0))
    // 보관 검(sword_19)을 자동 장착하지 않는다 — 의도치 않은 강화 방지.
    expect(store.getState().currentSwordId).toBe('sword_1')
    expect(countOf(store.getState().items, 'sword_19')).toBe(1)
  })

  it('판매 후 인벤토리에 검이 여럿 있어도 모두 가방에 그대로 두고 시작 검(+1)으로 재시작한다', () => {
    const store = createGameStore({
      gold: 0,
      currentSwordId: 'sword_5',
      items: [
        { itemId: 'sword_19', count: 1 },
        { itemId: 'sword_21', count: 2 },
      ],
    })
    store.getState().sell()
    expect(store.getState().currentSwordId).toBe('sword_1')
    expect(countOf(store.getState().items, 'sword_21')).toBe(2)
    expect(countOf(store.getState().items, 'sword_19')).toBe(1)
  })

  it('판매가가 없는 시작 검(+1)은 판매 불가 — null, 상태 불변', () => {
    const store = createGameStore({ gold: 500, currentSwordId: 'sword_1' })
    expect(store.getState().canSell()).toBe(false)
    expect(store.getState().sell()).toBeNull()
    expect(store.getState().gold).toBe(500)
    expect(store.getState().currentSwordId).toBe('sword_1')
  })

  it('보유 검이 없으면 판매 불가', () => {
    const store = createGameStore({ currentSwordId: null, gold: 0 })
    expect(store.getState().canSell()).toBe(false)
    expect(store.getState().sell()).toBeNull()
  })
})

describe('gameStore — 보관 / 장착', () => {
  it('canStore: 시작 검(+1)·검 없음은 보관 불가, 그 외 검은 가능', () => {
    expect(
      createGameStore({ currentSwordId: 'sword_1' }).getState().canStore(),
    ).toBe(false)
    expect(
      createGameStore({ currentSwordId: null }).getState().canStore(),
    ).toBe(false)
    expect(
      createGameStore({ currentSwordId: 'sword_5' }).getState().canStore(),
    ).toBe(true)
  })

  it('보관: 현재 검을 가방에 넣고 시작 검(+1)으로 되돌린다', () => {
    const store = createGameStore({ currentSwordId: 'sword_5', items: [] })
    store.getState().store()
    expect(store.getState().currentSwordId).toBe('sword_1')
    expect(countOf(store.getState().items, 'sword_5')).toBe(1)
  })

  it('보관: 같은 검을 또 보관하면 가방 스택이 합산된다', () => {
    const store = createGameStore({
      currentSwordId: 'sword_5',
      items: [{ itemId: 'sword_5', count: 1 }],
    })
    store.getState().store()
    expect(countOf(store.getState().items, 'sword_5')).toBe(2)
  })

  it('보관: 시작 검(+1)·검 없음은 무변화(no-op)', () => {
    const atStart = createGameStore({ currentSwordId: 'sword_1', items: [] })
    atStart.getState().store()
    expect(atStart.getState().currentSwordId).toBe('sword_1')
    expect(atStart.getState().items).toEqual([])

    const empty = createGameStore({ currentSwordId: null, items: [] })
    empty.getState().store()
    expect(empty.getState().currentSwordId).toBeNull()
  })

  it('장착: 가방의 검을 장착하고 현재 검은 가방으로 보관(스왑)', () => {
    const store = createGameStore({
      currentSwordId: 'sword_3',
      items: [{ itemId: 'sword_8', count: 1 }],
    })
    store.getState().equip('sword_8')
    expect(store.getState().currentSwordId).toBe('sword_8')
    expect(countOf(store.getState().items, 'sword_8')).toBe(0)
    expect(countOf(store.getState().items, 'sword_3')).toBe(1)
    // 빠진 sword_8 슬롯은 0 잔여 없이 제거된다(유령 슬롯 방지).
    expect(store.getState().items).toHaveLength(1)
  })

  it('장착: 현재 검과 같은 검을 장착하면 안전한 무변화(보관 +1 / 차감 -1 상쇄)', () => {
    const store = createGameStore({
      currentSwordId: 'sword_8',
      items: [{ itemId: 'sword_8', count: 2 }],
    })
    store.getState().equip('sword_8')
    expect(store.getState().currentSwordId).toBe('sword_8')
    expect(store.getState().items).toEqual([{ itemId: 'sword_8', count: 2 }])
  })

  it('장착: 시작 검(+1)을 들고 있으면 빠지는 시작 검은 버린다(가방에 +1 안 쌓임)', () => {
    const store = createGameStore({
      currentSwordId: 'sword_1',
      items: [{ itemId: 'sword_8', count: 1 }],
    })
    store.getState().equip('sword_8')
    expect(store.getState().currentSwordId).toBe('sword_8')
    expect(countOf(store.getState().items, 'sword_1')).toBe(0)
    expect(store.getState().items).toEqual([])
  })

  it('장착 라운드트립: 보관 → 다시 장착하면 가방이 비고 시작 검(+1) 잔여가 없다', () => {
    const store = createGameStore({ currentSwordId: 'sword_5', items: [] })
    store.getState().store() // +5 → 가방, 장착 +1
    store.getState().equip('sword_5') // +5 다시 장착, +1 폐기
    expect(store.getState().currentSwordId).toBe('sword_5')
    expect(store.getState().items).toEqual([])
  })

  it('장착: 같은 레벨이 여럿이면 1개만 빠진다(스택)', () => {
    const store = createGameStore({
      currentSwordId: 'sword_3',
      items: [{ itemId: 'sword_8', count: 2 }],
    })
    store.getState().equip('sword_8')
    expect(store.getState().currentSwordId).toBe('sword_8')
    expect(countOf(store.getState().items, 'sword_8')).toBe(1)
    expect(countOf(store.getState().items, 'sword_3')).toBe(1)
    // 스택 1개만 차감 + 보관된 sword_3 → 슬롯 2개(유령 슬롯 없음).
    expect(store.getState().items).toHaveLength(2)
  })

  it('장착: 검이 없을 때(null)도 보관 없이 장착된다', () => {
    const store = createGameStore({
      currentSwordId: null,
      items: [{ itemId: 'sword_8', count: 1 }],
    })
    store.getState().equip('sword_8')
    expect(store.getState().currentSwordId).toBe('sword_8')
    expect(store.getState().items).toEqual([])
  })

  it('장착: 검이 아닌 itemId·미보유 검은 무변화(방어)', () => {
    const store = createGameStore({
      currentSwordId: 'sword_3',
      items: [{ itemId: PROTECTION_TICKET_ID, count: 2 }],
    })
    store.getState().equip(PROTECTION_TICKET_ID) // 파괴보호장치는 검이 아님 → 무시
    store.getState().equip('sword_8') // 보유하지 않은 검 → 무시
    expect(store.getState().currentSwordId).toBe('sword_3')
    expect(countOf(store.getState().items, PROTECTION_TICKET_ID)).toBe(2)
  })

  it('보관→장착→판매 시퀀스: "가방엔 +1 없음" 불변식이 연산 경계를 넘어 유지된다', () => {
    // sword_5 장착 중 + 가방에 sword_8 보유.
    const store = createGameStore({
      gold: 0,
      currentSwordId: 'sword_5',
      items: [{ itemId: 'sword_9', count: 1 }],
    })
    store.getState().equip('sword_9') // sword_9 장착, sword_5 가방으로
    expect(store.getState().currentSwordId).toBe('sword_9')
    expect(countOf(store.getState().items, 'sword_5')).toBe(1)
    // sword_9 판매 → 가방 검(sword_5)을 자동 장착하지 않고 시작 검(+1)으로 재시작.
    // sword_5 는 가방에 그대로 남고, 빠진 +0 은 가방에 쌓이지 않는다("가방엔 +1 없음" 불변식).
    const got = store.getState().sell()
    expect(got ?? 0).toBeGreaterThan(0)
    expect(store.getState().currentSwordId).toBe('sword_1')
    expect(countOf(store.getState().items, 'sword_1')).toBe(0)
    expect(store.getState().items).toEqual([{ itemId: 'sword_5', count: 1 }])
  })
})

describe('gameStore — 상점 구매', () => {
  // 파괴방지권은 골드로만 판다(철조각 교환 경로 제거됨). 가격 액수는 밸런스 값이라 단언하지 않는다.
  it('골드 구매: 골드 차감 + 파괴보호장치 적재', () => {
    const before = 2_500_000
    const store = createGameStore({ gold: before })
    expect(store.getState().canBuy('protection_ticket_gold')).toBe(true)
    expect(store.getState().buy('protection_ticket_gold')).not.toBeNull()
    expect(store.getState().gold).toBeLessThan(before) // 가격(amount)은 밸런스 값 — 차감 방향만
    expect(countOf(store.getState().items, PROTECTION_TICKET_ID)).toBe(1)
  })

  it('수량 구매: 골드 가격 × qty 차감 + qty개 지급', () => {
    const before = 3_000_000
    const store = createGameStore({ gold: before })
    expect(store.getState().buy('protection_ticket_gold', 3)).not.toBeNull()
    expect(store.getState().gold).toBeLessThan(before)
    expect(countOf(store.getState().items, PROTECTION_TICKET_ID)).toBe(3)
  })

  it('골드가 부족하면 구매 불가 + buy는 null(상태 불변)', () => {
    const store = createGameStore({ gold: 999_999 })
    expect(store.getState().canBuy('protection_ticket_gold')).toBe(false)
    expect(store.getState().buy('protection_ticket_gold')).toBeNull()
    expect(store.getState().gold).toBe(999_999)
  })

  it('존재하지 않는 상점 항목 id는 구매 불가', () => {
    const store = createGameStore({ gold: 10_000_000 })
    expect(store.getState().canBuy('nonexistent')).toBe(false)
    expect(store.getState().buy('nonexistent')).toBeNull()
    expect(store.getState().gold).toBe(10_000_000)
  })

  it('비정상 수량(0 · 음수 · 소수)은 구매 불가', () => {
    const store = createGameStore({ gold: 10_000_000 })
    expect(store.getState().canBuy('protection_ticket_gold', 0)).toBe(false)
    expect(store.getState().canBuy('protection_ticket_gold', -1)).toBe(false)
    expect(store.getState().canBuy('protection_ticket_gold', 1.5)).toBe(false)
    expect(store.getState().buy('protection_ticket_gold', 0)).toBeNull()
    expect(store.getState().gold).toBe(10_000_000)
  })
})

describe('gameStore — 의뢰 완료(fulfillCommission)', () => {
  it('가방 보유 검: 가방에서 차감, 장착 슬롯 불변, gold += reward', () => {
    const store = createGameStore({
      gold: 1000,
      currentSwordId: 'sword_5',
      items: [{ itemId: 'sword_3', count: 2 }],
    })
    expect(store.getState().canFulfill({ kind: 'item', itemId: 'sword_3', count: 1 })).toBe(true)
    expect(store.getState().fulfillCommission({ kind: 'item', itemId: 'sword_3', count: 1 }, { kind: 'gold', amount: 5000 })).toBe(true)
    expect(store.getState().gold).toBe(6000)
    expect(countOf(store.getState().items, 'sword_3')).toBe(1)
    expect(store.getState().currentSwordId).toBe('sword_5') // 장착 불변
  })

  it('장착 검(가방 없음): 소모 후 시작 검(+1)으로 리필', () => {
    const store = createGameStore({
      gold: 1000,
      currentSwordId: 'sword_5',
      items: [],
    })
    expect(store.getState().fulfillCommission({ kind: 'item', itemId: 'sword_5', count: 1 }, { kind: 'gold', amount: 5000 })).toBe(true)
    expect(store.getState().gold).toBe(6000)
    expect(store.getState().currentSwordId).toBe('sword_1') // 빈 슬롯 리필
  })

  it('장착 검(가방에 다른 검 보유): 소모 후에도 가방 검은 자동 장착하지 않고 시작 검(+1)으로 재시작', () => {
    const store = createGameStore({
      gold: 1000,
      currentSwordId: 'sword_5',
      items: [{ itemId: 'sword_2', count: 1 }],
    })
    expect(store.getState().fulfillCommission({ kind: 'item', itemId: 'sword_5', count: 1 }, { kind: 'gold', amount: 5000 })).toBe(true)
    expect(store.getState().gold).toBe(6000)
    // 보관 검(sword_2)을 자동 장착하지 않는다 — 의도치 않은 강화 방지.
    expect(store.getState().currentSwordId).toBe('sword_1')
    expect(countOf(store.getState().items, 'sword_2')).toBe(1)
  })

  it('미보유 검: false, 아무 변화 없음', () => {
    const store = createGameStore({
      gold: 1000,
      currentSwordId: 'sword_5',
      items: [{ itemId: 'sword_3', count: 1 }],
    })
    expect(store.getState().canFulfill({ kind: 'item', itemId: 'sword_9', count: 1 })).toBe(false)
    expect(store.getState().fulfillCommission({ kind: 'item', itemId: 'sword_9', count: 1 }, { kind: 'gold', amount: 5000 })).toBe(false)
    expect(store.getState().gold).toBe(1000)
    expect(store.getState().currentSwordId).toBe('sword_5')
    expect(countOf(store.getState().items, 'sword_3')).toBe(1)
  })

  it('가방·장착 둘 다 요구 검이면 가방을 우선 소모(장착 불변)', () => {
    const store = createGameStore({
      gold: 1000,
      currentSwordId: 'sword_5',
      items: [{ itemId: 'sword_5', count: 1 }],
    })
    expect(store.getState().fulfillCommission({ kind: 'item', itemId: 'sword_5', count: 1 }, { kind: 'gold', amount: 5000 })).toBe(true)
    expect(store.getState().gold).toBe(6000)
    expect(store.getState().currentSwordId).toBe('sword_5') // 장착분 유지
    expect(countOf(store.getState().items, 'sword_5')).toBe(0) // 가방분 소모
  })

  it('물물교환: 재료 requiredCount 개 소모 + 아이템 보상 지급(골드·장착검 불변)', () => {
    const store = createGameStore({
      gold: 100,
      currentSwordId: 'sword_5',
      items: [{ itemId: 'faded_fluorescent', count: 3 }],
    })
    expect(store.getState().canFulfill({ kind: 'item', itemId: 'faded_fluorescent', count: 2 })).toBe(true)
    expect(
      store.getState().fulfillCommission({ kind: 'item', itemId: 'faded_fluorescent', count: 2 }, {
        kind: 'item',
        itemId: 'sword_12',
        count: 1,
      }),
    ).toBe(true)
    expect(countOf(store.getState().items, 'faded_fluorescent')).toBe(1) // 2 소모
    expect(countOf(store.getState().items, 'sword_12')).toBe(1) // 검 지급
    expect(store.getState().gold).toBe(100) // 골드 불변(아이템 보상)
    expect(store.getState().currentSwordId).toBe('sword_5') // 장착검 불변
  })

  it('수량 부족: requiredCount 미만이면 canFulfill false + fulfill 무변화', () => {
    const store = createGameStore({
      gold: 0,
      currentSwordId: 'sword_5',
      items: [{ itemId: 'faded_fluorescent', count: 1 }], // 2개 필요한데 1개뿐
    })
    expect(store.getState().canFulfill({ kind: 'item', itemId: 'faded_fluorescent', count: 2 })).toBe(false)
    expect(
      store.getState().fulfillCommission({ kind: 'item', itemId: 'faded_fluorescent', count: 2 }, {
        kind: 'item',
        itemId: 'sword_12',
        count: 1,
      }),
    ).toBe(false)
    expect(countOf(store.getState().items, 'faded_fluorescent')).toBe(1) // 무변화
    expect(countOf(store.getState().items, 'sword_12')).toBe(0) // 미지급
  })

  it('골드 비용 거래: 골드로 아이템을 산다 — 골드 차감 + 아이템 보상(가방/장착검 불변)', () => {
    const store = createGameStore({
      gold: 50_000,
      currentSwordId: 'sword_5',
      items: [{ itemId: 'sword_3', count: 1 }],
    })
    const cost = { kind: 'gold' as const, amount: 30_000 }
    const reward = { kind: 'item' as const, itemId: 'sword_12', count: 1 }
    expect(store.getState().canFulfill(cost)).toBe(true)
    expect(store.getState().fulfillCommission(cost, reward)).toBe(true)
    expect(store.getState().gold).toBe(20_000) // 30,000 차감
    expect(countOf(store.getState().items, 'sword_12')).toBe(1) // 보상 지급
    expect(store.getState().currentSwordId).toBe('sword_5') // 장착검 불변
    expect(countOf(store.getState().items, 'sword_3')).toBe(1) // 가방 불변
  })

  it('골드 비용 거래: 골드 부족이면 canFulfill false + fulfill 무변화', () => {
    const store = createGameStore({ gold: 29_999, items: [] })
    const cost = { kind: 'gold' as const, amount: 30_000 }
    const reward = { kind: 'item' as const, itemId: 'sword_12', count: 1 }
    expect(store.getState().canFulfill(cost)).toBe(false)
    expect(store.getState().fulfillCommission(cost, reward)).toBe(false)
    expect(store.getState().gold).toBe(29_999) // 무변화
    expect(countOf(store.getState().items, 'sword_12')).toBe(0) // 미지급
  })

  it('골드 비용 거래: 정확히 보유 골드와 같으면 구매 가능(경계) → 0', () => {
    const store = createGameStore({ gold: 30_000, items: [] })
    const cost = { kind: 'gold' as const, amount: 30_000 }
    const reward = { kind: 'item' as const, itemId: 'sword_12', count: 1 }
    expect(store.getState().canFulfill(cost)).toBe(true)
    expect(store.getState().fulfillCommission(cost, reward)).toBe(true)
    expect(store.getState().gold).toBe(0)
    expect(countOf(store.getState().items, 'sword_12')).toBe(1)
  })
})

describe('gameStore — 최고 도달 강화(maxLevelReached)', () => {
  it('초기값은 명시한 currentSwordId 의 레벨이다(미지정·검 없음 → 0)', () => {
    // 전역 store(opts 미지정)은 0 으로 출발한다 — 시작 검 레벨 보정은 적재 후 main 의 syncRecordToCurrent 가 한다(아래 별도 테스트).
    expect(createGameStore().getState().maxLevelReached).toBe(0)
    expect(
      createGameStore({ currentSwordId: 'sword_10' }).getState().maxLevelReached,
    ).toBe(10)
    expect(
      createGameStore({ currentSwordId: null }).getState().maxLevelReached,
    ).toBe(0)
  })

  it('syncRecordToCurrent: 적재 후 시작 검 레벨을 최고 도달치에 반영한다(전역 store 보정)', () => {
    // 전역 store 처럼 currentSwordId 미지정으로 만들면 시작 검(sword_1, +1)을 들고도 maxLevelReached 가 0 으로 출발한다.
    // main 이 적재 후 호출하는 보정이 이를 시작 검 레벨(+1)로 끌어올린다 — RecordGauge "현재 ≤ 최고" 불변식.
    const store = createGameStore()
    expect(store.getState().currentSwordId).toBe('sword_1')
    expect(store.getState().maxLevelReached).toBe(0)
    store.getState().syncRecordToCurrent()
    expect(store.getState().maxLevelReached).toBe(1)
    expect(store.getState().currentSwordId).toBe('sword_1') // 검은 그대로
  })

  it('강화 성공 시 최고 도달치가 새 레벨로 오른다(단조 상승)', () => {
    const store = createGameStore({
      enhancer: ALWAYS_SUCCESS(),
      gold: 1_000_000_000,
      currentSwordId: 'sword_1',
    })
    expect(store.getState().maxLevelReached).toBe(1)
    store.getState().enhance(false) // sword_1 → sword_2
    expect(store.getState().currentSwordId).toBe('sword_2')
    expect(store.getState().maxLevelReached).toBe(2)
    store.getState().enhance(false) // sword_2 → sword_3
    expect(store.getState().currentSwordId).toBe('sword_3')
    expect(store.getState().maxLevelReached).toBe(3)
  })

  it('파괴로 시작 검(+1)이 돼도 최고 도달치는 유지된다(내려가지 않음)', () => {
    const store = createGameStore({
      enhancer: ALWAYS_FAIL(),
      gold: 1_000_000,
      currentSwordId: 'sword_6',
    })
    expect(store.getState().maxLevelReached).toBe(6) // 시작 검 레벨에서 출발
    store.getState().enhance(false) // 파괴 → 시작 검(+1)
    expect(store.getState().currentSwordId).toBe('sword_1')
    expect(store.getState().maxLevelReached).toBe(6) // 기록은 유지
  })

  it('판매로 시작 검(+1)이 돼도 최고 도달치는 유지된다', () => {
    const store = createGameStore({ gold: 0, currentSwordId: 'sword_5' })
    expect(store.getState().maxLevelReached).toBe(5)
    store.getState().sell()
    expect(store.getState().currentSwordId).toBe('sword_1')
    expect(store.getState().maxLevelReached).toBe(5)
  })

  it('강화 외 경로(장착)로 더 높은 검을 들어도 최고 도달치에 반영된다', () => {
    // 강화 성공만 갱신했다면 놓칠 경로 — set 래퍼가 모든 currentSwordId 상승을 한 곳에서 잡는지 확인.
    const store = createGameStore({
      currentSwordId: 'sword_3',
      items: [{ itemId: 'sword_8', count: 1 }],
    })
    expect(store.getState().maxLevelReached).toBe(3)
    store.getState().equip('sword_8')
    expect(store.getState().currentSwordId).toBe('sword_8')
    expect(store.getState().maxLevelReached).toBe(8)
  })

  it('더 낮은 검을 장착해도 최고 도달치는 내려가지 않는다', () => {
    const store = createGameStore({
      currentSwordId: 'sword_8',
      items: [{ itemId: 'sword_3', count: 1 }],
    })
    expect(store.getState().maxLevelReached).toBe(8)
    store.getState().equip('sword_3')
    expect(store.getState().currentSwordId).toBe('sword_3')
    expect(store.getState().maxLevelReached).toBe(8) // 유지
  })
})

