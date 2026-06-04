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

describe('gameStore — 강화 적용 (seam)', () => {
  it('성공: 골드 차감 + 단계 +1', () => {
    // level 0: 골드 300, 성공률 100%.
    const store = createGameStore({
      enhancer: ALWAYS_SUCCESS(),
      gold: 1000,
      currentSwordId: 'sword_0',
    })
    const r = store.getState().enhance(false)
    expect(r?.outcome).toBe('success')
    expect(store.getState().currentSwordId).toBe('sword_1')
    expect(store.getState().gold).toBe(700)
  })

  it('성공: 재료검(sword_19)이 items에서 차감되고 단계가 오른다', () => {
    // level 21: 비용 = sword_19 ×1.
    const store = createGameStore({
      enhancer: ALWAYS_SUCCESS(),
      gold: 0,
      currentSwordId: 'sword_21',
      items: [{ itemId: 'sword_19', count: 2 }],
    })
    const r = store.getState().enhance(false)
    expect(r?.outcome).toBe('success')
    expect(store.getState().currentSwordId).toBe('sword_22')
    expect(countOf(store.getState().items, 'sword_19')).toBe(1)
  })

  it('파괴 후 인벤토리에 검이 없으면 낡은 단검(+0)으로 재시작 + dropOnFail 산출', () => {
    // level 6: 골드 2000, dropOnFail = iron_scrap ×1.
    const store = createGameStore({
      enhancer: ALWAYS_FAIL(),
      gold: 5000,
      currentSwordId: 'sword_6',
      items: [],
    })
    const r = store.getState().enhance(false)
    // 엔진 이벤트는 파괴(toId null)지만, 상태는 낡은 단검(+0)으로 재시작한다.
    expect(r?.outcome).toBe('destroyed')
    expect(r?.toId).toBeNull()
    expect(store.getState().currentSwordId).toBe('sword_0')
    expect(store.getState().gold).toBe(3000)
    expect(store.getState().items).toContainEqual({
      itemId: 'iron_scrap',
      count: 1,
    })
  })

  it('파괴 후 인벤토리에 검이 있으면 그 검(최고 레벨)을 장착한다(판매와 동일 규칙)', () => {
    const store = createGameStore({
      enhancer: ALWAYS_FAIL(),
      gold: 5000,
      currentSwordId: 'sword_6',
      items: [{ itemId: 'sword_19', count: 1 }],
    })
    const r = store.getState().enhance(false)
    expect(r?.outcome).toBe('destroyed')
    expect(store.getState().currentSwordId).toBe('sword_19')
    expect(countOf(store.getState().items, 'sword_19')).toBe(0)
    // 드랍은 그대로 들어온다.
    expect(countOf(store.getState().items, 'iron_scrap')).toBe(1)
  })

  it('파괴: 드랍이 기존 스택에 병합된다', () => {
    const store = createGameStore({
      enhancer: ALWAYS_FAIL(),
      gold: 5000,
      currentSwordId: 'sword_6',
      items: [{ itemId: 'iron_scrap', count: 3 }],
    })
    store.getState().enhance(false)
    expect(countOf(store.getState().items, 'iron_scrap')).toBe(4)
  })

  it('방지: 단계 유지 + 방지권 차감 + 드랍 없음', () => {
    // level 14: 골드 100000, 방지권 소모 3, dropOnFail = iron_scrap ×10.
    const store = createGameStore({
      enhancer: ALWAYS_FAIL(),
      gold: 200000,
      currentSwordId: 'sword_14',
      items: [{ itemId: PROTECTION_TICKET_ID, count: 5 }],
    })
    const r = store.getState().enhance(true)
    expect(r?.outcome).toBe('protected')
    expect(store.getState().currentSwordId).toBe('sword_14')
    expect(store.getState().gold).toBe(100000)
    expect(countOf(store.getState().items, PROTECTION_TICKET_ID)).toBe(2)
    // 방지 시 드랍 없음.
    expect(countOf(store.getState().items, 'iron_scrap')).toBe(0)
  })
})

describe('gameStore — canEnhance 게이팅', () => {
  it('골드가 부족하면 강화 불가 + enhance는 null(상태 불변)', () => {
    const store = createGameStore({ gold: 100, currentSwordId: 'sword_0' })
    expect(store.getState().canEnhance(false)).toBe(false)
    expect(store.getState().enhance(false)).toBeNull()
    expect(store.getState().gold).toBe(100)
    expect(store.getState().currentSwordId).toBe('sword_0')
  })

  it('보유 검이 없으면(null) 강화 불가', () => {
    const store = createGameStore({ currentSwordId: null, gold: 999_999 })
    expect(store.getState().canEnhance(false)).toBe(false)
    expect(store.getState().enhance(false)).toBeNull()
  })

  it('최종 단계(+29)는 강화 불가', () => {
    const store = createGameStore({
      currentSwordId: 'sword_29',
      gold: 999_999_999,
    })
    expect(store.getState().canEnhance(false)).toBe(false)
  })

  it('재료검이 없으면 강화 불가', () => {
    // level 21 비용 sword_19 ×1을 보유하지 않음.
    const store = createGameStore({
      currentSwordId: 'sword_21',
      gold: 0,
      items: [],
    })
    expect(store.getState().canEnhance(false)).toBe(false)
  })
})

describe('gameStore — 판매', () => {
  it('판매가만큼 골드를 받고, 인벤토리에 검이 없으면 낡은 단검(+0)을 배치한다', () => {
    // level 5: 판매가 1600. 인벤토리에 검 없음.
    const store = createGameStore({ gold: 1000, currentSwordId: 'sword_5' })
    expect(store.getState().canSell()).toBe(true)
    const got = store.getState().sell()
    expect(got).toBe(1600)
    expect(store.getState().gold).toBe(2600)
    expect(store.getState().currentSwordId).toBe('sword_0')
  })

  it('판매 후 인벤토리에 검이 있으면 그 검을 장착하고 인벤토리에서 뺀다', () => {
    const store = createGameStore({
      gold: 0,
      currentSwordId: 'sword_5', // 판매가 1600
      items: [{ itemId: 'sword_19', count: 1 }],
    })
    const got = store.getState().sell()
    expect(got).toBe(1600)
    expect(store.getState().gold).toBe(1600)
    expect(store.getState().currentSwordId).toBe('sword_19')
    expect(countOf(store.getState().items, 'sword_19')).toBe(0)
  })

  it('인벤토리에 검이 여럿이면 최고 레벨을 장착하고 나머지는 남긴다', () => {
    const store = createGameStore({
      gold: 0,
      currentSwordId: 'sword_5',
      items: [
        { itemId: 'sword_19', count: 1 },
        { itemId: 'sword_21', count: 2 },
      ],
    })
    store.getState().sell()
    expect(store.getState().currentSwordId).toBe('sword_21')
    expect(countOf(store.getState().items, 'sword_21')).toBe(1)
    expect(countOf(store.getState().items, 'sword_19')).toBe(1)
  })

  it('판매가가 없는 단계(+0)는 판매 불가 — null, 상태 불변', () => {
    const store = createGameStore({ gold: 500, currentSwordId: 'sword_0' })
    expect(store.getState().canSell()).toBe(false)
    expect(store.getState().sell()).toBeNull()
    expect(store.getState().gold).toBe(500)
    expect(store.getState().currentSwordId).toBe('sword_0')
  })

  it('보유 검이 없으면 판매 불가', () => {
    const store = createGameStore({ currentSwordId: null, gold: 0 })
    expect(store.getState().canSell()).toBe(false)
    expect(store.getState().sell()).toBeNull()
  })
})

describe('gameStore — 보관 / 장착', () => {
  it('canStore: 시작 검(+0)·검 없음은 보관 불가, 그 외 검은 가능', () => {
    expect(
      createGameStore({ currentSwordId: 'sword_0' }).getState().canStore(),
    ).toBe(false)
    expect(
      createGameStore({ currentSwordId: null }).getState().canStore(),
    ).toBe(false)
    expect(
      createGameStore({ currentSwordId: 'sword_5' }).getState().canStore(),
    ).toBe(true)
  })

  it('보관: 현재 검을 가방에 넣고 시작 검(+0)으로 되돌린다', () => {
    const store = createGameStore({ currentSwordId: 'sword_5', items: [] })
    store.getState().store()
    expect(store.getState().currentSwordId).toBe('sword_0')
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

  it('보관: 시작 검(+0)·검 없음은 무변화(no-op)', () => {
    const atStart = createGameStore({ currentSwordId: 'sword_0', items: [] })
    atStart.getState().store()
    expect(atStart.getState().currentSwordId).toBe('sword_0')
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

  it('장착: 시작 검(+0)을 들고 있으면 빠지는 시작 검은 버린다(가방에 +0 안 쌓임)', () => {
    const store = createGameStore({
      currentSwordId: 'sword_0',
      items: [{ itemId: 'sword_8', count: 1 }],
    })
    store.getState().equip('sword_8')
    expect(store.getState().currentSwordId).toBe('sword_8')
    expect(countOf(store.getState().items, 'sword_0')).toBe(0)
    expect(store.getState().items).toEqual([])
  })

  it('장착 라운드트립: 보관 → 다시 장착하면 가방이 비고 시작 검(+0) 잔여가 없다', () => {
    const store = createGameStore({ currentSwordId: 'sword_5', items: [] })
    store.getState().store() // +5 → 가방, 장착 +0
    store.getState().equip('sword_5') // +5 다시 장착, +0 폐기
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
    store.getState().equip(PROTECTION_TICKET_ID) // 방지권은 검이 아님 → 무시
    store.getState().equip('sword_8') // 보유하지 않은 검 → 무시
    expect(store.getState().currentSwordId).toBe('sword_3')
    expect(countOf(store.getState().items, PROTECTION_TICKET_ID)).toBe(2)
  })

  it('보관→장착→판매 시퀀스: "가방엔 +0 없음" 불변식이 연산 경계를 넘어 유지된다', () => {
    // sword_5 장착 중 + 가방에 sword_8 보유.
    const store = createGameStore({
      gold: 0,
      currentSwordId: 'sword_5',
      items: [{ itemId: 'sword_8', count: 1 }],
    })
    store.getState().equip('sword_8') // sword_8 장착, sword_5 가방으로
    expect(store.getState().currentSwordId).toBe('sword_8')
    expect(countOf(store.getState().items, 'sword_5')).toBe(1)
    // sword_8 판매 → 빈 슬롯을 가방의 sword_5 로 채운다(낡은 단검 아님).
    const got = store.getState().sell()
    expect(got).toBe(10000)
    expect(store.getState().currentSwordId).toBe('sword_5')
    expect(countOf(store.getState().items, 'sword_0')).toBe(0)
    expect(store.getState().items).toEqual([])
  })
})

describe('gameStore — 상점 구매', () => {
  // shop.json: protection_ticket_gold(골드 100만), protection_ticket_scrap(철조각 10개)
  it('골드 구매: 골드 차감 + 방지권 적재', () => {
    const store = createGameStore({ gold: 2_500_000 })
    expect(store.getState().canBuy('protection_ticket_gold')).toBe(true)
    expect(store.getState().buy('protection_ticket_gold')).not.toBeNull()
    expect(store.getState().gold).toBe(1_500_000)
    expect(countOf(store.getState().items, PROTECTION_TICKET_ID)).toBe(1)
  })

  it('아이템 구매: 철조각 10개 차감 + 방지권 적재(골드 불변)', () => {
    const store = createGameStore({
      gold: 0,
      items: [{ itemId: 'iron_scrap', count: 25 }],
    })
    expect(store.getState().canBuy('protection_ticket_scrap')).toBe(true)
    expect(store.getState().buy('protection_ticket_scrap')).not.toBeNull()
    expect(countOf(store.getState().items, 'iron_scrap')).toBe(15)
    expect(countOf(store.getState().items, PROTECTION_TICKET_ID)).toBe(1)
    expect(store.getState().gold).toBe(0)
  })

  it('아이템 구매: 철조각이 정확히 가격과 같으면 구매 가능(경계) → 0', () => {
    const store = createGameStore({
      gold: 0,
      items: [{ itemId: 'iron_scrap', count: 10 }],
    })
    expect(store.getState().canBuy('protection_ticket_scrap')).toBe(true)
    store.getState().buy('protection_ticket_scrap')
    expect(countOf(store.getState().items, 'iron_scrap')).toBe(0)
    expect(countOf(store.getState().items, PROTECTION_TICKET_ID)).toBe(1)
  })

  it('아이템 부족이면 구매 불가 + buy는 null(상태 불변)', () => {
    const store = createGameStore({
      gold: 0,
      items: [{ itemId: 'iron_scrap', count: 9 }],
    })
    expect(store.getState().canBuy('protection_ticket_scrap')).toBe(false)
    expect(store.getState().buy('protection_ticket_scrap')).toBeNull()
    expect(countOf(store.getState().items, 'iron_scrap')).toBe(9)
    expect(countOf(store.getState().items, PROTECTION_TICKET_ID)).toBe(0)
  })

  it('수량 구매: 골드 가격 × qty 차감 + qty개 지급', () => {
    const store = createGameStore({ gold: 3_000_000 })
    expect(store.getState().buy('protection_ticket_gold', 3)).not.toBeNull()
    expect(store.getState().gold).toBe(0)
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
