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

  it('파괴 후 인벤토리에 검이 없으면 낡은 단검(+0)으로 재시작 + dropOnFail 은 대기분(pendingDrops)으로', () => {
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
    // 드랍은 즉시 인벤토리에 들어오지 않는다 — 수집(연출 도착) 전까지 pendingDrops 에 머문다.
    expect(countOf(store.getState().items, 'iron_scrap')).toBe(0)
    expect(store.getState().pendingDrops).toContainEqual({
      itemId: 'iron_scrap',
      count: 1,
    })
  })

  it('파괴 후 인벤토리에 검이 있어도 자동 장착하지 않고 낡은 단검(+0)으로 재시작한다(보관 검은 가방에 유지)', () => {
    const store = createGameStore({
      enhancer: ALWAYS_FAIL(),
      gold: 5000,
      currentSwordId: 'sword_6',
      items: [{ itemId: 'sword_19', count: 1 }],
    })
    const r = store.getState().enhance(false)
    expect(r?.outcome).toBe('destroyed')
    // 보관 검(sword_19)을 자동 장착하지 않는다 — 의도치 않은 강화 방지.
    expect(store.getState().currentSwordId).toBe('sword_0')
    expect(countOf(store.getState().items, 'sword_19')).toBe(1)
    // 드랍은 대기분으로 — 아직 items 에 없다.
    expect(countOf(store.getState().items, 'iron_scrap')).toBe(0)
    expect(countOf(store.getState().pendingDrops, 'iron_scrap')).toBe(1)
  })

  it('파괴: 드랍은 대기분에 쌓이고, 수집(flush)되면 기존 스택에 병합된다', () => {
    const store = createGameStore({
      enhancer: ALWAYS_FAIL(),
      gold: 5000,
      currentSwordId: 'sword_6',
      items: [{ itemId: 'iron_scrap', count: 3 }],
    })
    store.getState().enhance(false)
    // 즉시는 기존 수량 그대로(3), 드랍 1은 대기분에.
    expect(countOf(store.getState().items, 'iron_scrap')).toBe(3)
    expect(countOf(store.getState().pendingDrops, 'iron_scrap')).toBe(1)
    // 수집되면 기존 스택에 병합되어 4.
    store.getState().flushDrops()
    expect(countOf(store.getState().items, 'iron_scrap')).toBe(4)
    expect(store.getState().pendingDrops).toEqual([])
  })

  it('방지: 단계 유지 + 파괴보호장치 차감 + 드랍 없음', () => {
    // level 14: 골드 100000, 파괴보호장치 소모 3, dropOnFail = dark_matter ×1.
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
    // 방지 시 드랍 없음(items·pendingDrops 모두).
    expect(countOf(store.getState().items, 'dark_matter')).toBe(0)
    expect(store.getState().pendingDrops).toEqual([])
  })
})

describe('gameStore — 드랍 수집(collectDrop / flushDrops)', () => {
  it('마검 아포피스 파괴 시 암흑 물질이 대기 드랍으로 쌓인다', () => {
    const store = createGameStore({
      enhancer: ALWAYS_FAIL(),
      gold: 1_000_000,
      currentSwordId: 'sword_14',
      items: [],
    })
    store.getState().enhance(false)
    expect(countOf(store.getState().pendingDrops, 'dark_matter')).toBe(1)
    expect(countOf(store.getState().items, 'dark_matter')).toBe(0)
  })

  // sword_15: 골드 180000, dropOnFail = iron_scrap ×15. ALWAYS_FAIL 로 파괴해 대기분 15를 만든다.
  const destroyedWithPending = () => {
    const store = createGameStore({
      enhancer: ALWAYS_FAIL(),
      gold: 1_000_000,
      currentSwordId: 'sword_15',
      items: [],
    })
    store.getState().enhance(false)
    return store
  }

  it('collectDrop 은 대기분 한도 내에서 items 로 옮긴다(부분 수집)', () => {
    const store = destroyedWithPending()
    expect(countOf(store.getState().pendingDrops, 'iron_scrap')).toBe(15)
    store.getState().collectDrop('iron_scrap', 3)
    expect(countOf(store.getState().items, 'iron_scrap')).toBe(3)
    expect(countOf(store.getState().pendingDrops, 'iron_scrap')).toBe(12)
  })

  it('collectDrop 은 대기분을 초과해 추가하지 않는다(과다·중복 합산 방지)', () => {
    const store = destroyedWithPending()
    store.getState().collectDrop('iron_scrap', 100) // 대기분(15)까지만
    expect(countOf(store.getState().items, 'iron_scrap')).toBe(15)
    expect(countOf(store.getState().pendingDrops, 'iron_scrap')).toBe(0)
    // 대기분 소진 후 다시 호출해도 무변화(연출 완료 콜백이 늦게 와도 중복 합산 안 됨).
    store.getState().collectDrop('iron_scrap', 5)
    expect(countOf(store.getState().items, 'iron_scrap')).toBe(15)
  })

  it('flushDrops 는 남은 대기분을 모두 items 로 합산하고 비운다', () => {
    const store = destroyedWithPending()
    store.getState().collectDrop('iron_scrap', 4) // 일부 수집
    store.getState().flushDrops() // 나머지 11 회수
    expect(countOf(store.getState().items, 'iron_scrap')).toBe(15)
    expect(store.getState().pendingDrops).toEqual([])
  })

  it('flushDrops 는 멱등 — 대기분이 없으면 무변화', () => {
    const store = createGameStore({ items: [{ itemId: 'iron_scrap', count: 2 }] })
    store.getState().flushDrops()
    expect(countOf(store.getState().items, 'iron_scrap')).toBe(2)
    expect(store.getState().pendingDrops).toEqual([])
  })

  it('연속 파괴: 드랍이 대기분에 누적된다(merge — 유실 없음)', () => {
    // sword_6(드랍 ×1) 파괴 → 낡은 단검(+0)으로 재시작 → 가방의 sword_9 를 명시적으로 장착 → sword_9(드랍 ×2) 재파괴.
    const store = createGameStore({
      enhancer: ALWAYS_FAIL(),
      gold: 1_000_000,
      currentSwordId: 'sword_6',
      items: [{ itemId: 'sword_9', count: 1 }],
    })
    store.getState().enhance(false)
    // 파괴 후 보관 검은 자동 장착되지 않는다 — 낡은 단검(+0)으로 재시작, sword_9 는 가방에 유지.
    expect(store.getState().currentSwordId).toBe('sword_0')
    expect(countOf(store.getState().items, 'sword_9')).toBe(1)
    // 재파괴를 위해 보관 검을 명시적으로 장착한 뒤 강화한다.
    store.getState().equip('sword_9')
    expect(store.getState().currentSwordId).toBe('sword_9')
    store.getState().enhance(false)
    // 1 + 2 = 3 이 대기분에 누적, items 엔 아직 0.
    expect(countOf(store.getState().pendingDrops, 'iron_scrap')).toBe(3)
    expect(countOf(store.getState().items, 'iron_scrap')).toBe(0)
    store.getState().flushDrops()
    expect(countOf(store.getState().items, 'iron_scrap')).toBe(3)
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

  it('판매 후 인벤토리에 검이 있어도 자동 장착하지 않고 낡은 단검(+0)으로 재시작한다(보관 검은 가방에 유지)', () => {
    const store = createGameStore({
      gold: 0,
      currentSwordId: 'sword_5', // 판매가 1600
      items: [{ itemId: 'sword_19', count: 1 }],
    })
    const got = store.getState().sell()
    expect(got).toBe(1600)
    expect(store.getState().gold).toBe(1600)
    // 보관 검(sword_19)을 자동 장착하지 않는다 — 의도치 않은 강화 방지.
    expect(store.getState().currentSwordId).toBe('sword_0')
    expect(countOf(store.getState().items, 'sword_19')).toBe(1)
  })

  it('판매 후 인벤토리에 검이 여럿 있어도 모두 가방에 그대로 두고 낡은 단검(+0)으로 재시작한다', () => {
    const store = createGameStore({
      gold: 0,
      currentSwordId: 'sword_5',
      items: [
        { itemId: 'sword_19', count: 1 },
        { itemId: 'sword_21', count: 2 },
      ],
    })
    store.getState().sell()
    expect(store.getState().currentSwordId).toBe('sword_0')
    expect(countOf(store.getState().items, 'sword_21')).toBe(2)
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
    store.getState().equip(PROTECTION_TICKET_ID) // 파괴보호장치는 검이 아님 → 무시
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
    // sword_8 판매 → 가방 검(sword_5)을 자동 장착하지 않고 낡은 단검(+0)으로 재시작.
    // sword_5 는 가방에 그대로 남고, 빠진 +0 은 가방에 쌓이지 않는다("가방엔 +0 없음" 불변식).
    const got = store.getState().sell()
    expect(got).toBe(10000)
    expect(store.getState().currentSwordId).toBe('sword_0')
    expect(countOf(store.getState().items, 'sword_0')).toBe(0)
    expect(store.getState().items).toEqual([{ itemId: 'sword_5', count: 1 }])
  })
})

describe('gameStore — 상점 구매', () => {
  // shop.json: protection_ticket_gold(골드 100만), protection_ticket_scrap(철조각 10개)
  it('골드 구매: 골드 차감 + 파괴보호장치 적재', () => {
    const store = createGameStore({ gold: 2_500_000 })
    expect(store.getState().canBuy('protection_ticket_gold')).toBe(true)
    expect(store.getState().buy('protection_ticket_gold')).not.toBeNull()
    expect(store.getState().gold).toBe(1_500_000)
    expect(countOf(store.getState().items, PROTECTION_TICKET_ID)).toBe(1)
  })

  it('아이템 구매: 철조각 10개 차감 + 파괴보호장치 적재(골드 불변)', () => {
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

describe('gameStore — 의뢰 완료(fulfillCommission)', () => {
  it('가방 보유 검: 가방에서 차감, 장착 슬롯 불변, gold += reward', () => {
    const store = createGameStore({
      gold: 1000,
      currentSwordId: 'sword_5',
      items: [{ itemId: 'sword_3', count: 2 }],
    })
    expect(store.getState().canFulfill('sword_3')).toBe(true)
    expect(store.getState().fulfillCommission('sword_3', 5000)).toBe(true)
    expect(store.getState().gold).toBe(6000)
    expect(countOf(store.getState().items, 'sword_3')).toBe(1)
    expect(store.getState().currentSwordId).toBe('sword_5') // 장착 불변
  })

  it('장착 검(가방 없음): 소모 후 낡은 단검(+0)으로 리필', () => {
    const store = createGameStore({
      gold: 1000,
      currentSwordId: 'sword_5',
      items: [],
    })
    expect(store.getState().fulfillCommission('sword_5', 5000)).toBe(true)
    expect(store.getState().gold).toBe(6000)
    expect(store.getState().currentSwordId).toBe('sword_0') // 빈 슬롯 리필
  })

  it('장착 검(가방에 다른 검 보유): 소모 후에도 가방 검은 자동 장착하지 않고 낡은 단검(+0)으로 재시작', () => {
    const store = createGameStore({
      gold: 1000,
      currentSwordId: 'sword_5',
      items: [{ itemId: 'sword_2', count: 1 }],
    })
    expect(store.getState().fulfillCommission('sword_5', 5000)).toBe(true)
    expect(store.getState().gold).toBe(6000)
    // 보관 검(sword_2)을 자동 장착하지 않는다 — 의도치 않은 강화 방지.
    expect(store.getState().currentSwordId).toBe('sword_0')
    expect(countOf(store.getState().items, 'sword_2')).toBe(1)
  })

  it('미보유 검: false, 아무 변화 없음', () => {
    const store = createGameStore({
      gold: 1000,
      currentSwordId: 'sword_5',
      items: [{ itemId: 'sword_3', count: 1 }],
    })
    expect(store.getState().canFulfill('sword_9')).toBe(false)
    expect(store.getState().fulfillCommission('sword_9', 5000)).toBe(false)
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
    expect(store.getState().fulfillCommission('sword_5', 5000)).toBe(true)
    expect(store.getState().gold).toBe(6000)
    expect(store.getState().currentSwordId).toBe('sword_5') // 장착분 유지
    expect(countOf(store.getState().items, 'sword_5')).toBe(0) // 가방분 소모
  })
})

describe('gameStore — 의뢰 경험치(applyCommissionXp)', () => {
  // applyCommissionXp 는 실제 commission.json 의 레벨 정의(레벨1 xpToNext=100)를 쓴다.
  it('기본 시작값은 레벨 1, 경험치 0', () => {
    const store = createGameStore()
    expect(store.getState().commissionLevel).toBe(1)
    expect(store.getState().commissionXp).toBe(0)
  })

  it('경험치 획득(레벨 미만)은 누적', () => {
    const store = createGameStore()
    store.getState().applyCommissionXp(34)
    expect(store.getState().commissionLevel).toBe(1)
    expect(store.getState().commissionXp).toBe(34)
  })

  it('경험치가 xpToNext(100) 도달 시 레벨업', () => {
    const store = createGameStore({ commissionLevel: 1, commissionXp: 80 })
    store.getState().applyCommissionXp(34) // 80+34=114 → L2, xp 14
    expect(store.getState().commissionLevel).toBe(2)
    expect(store.getState().commissionXp).toBe(14)
  })

  it('경험치가 음수가 되면 레벨 다운', () => {
    const store = createGameStore({ commissionLevel: 2, commissionXp: 10 })
    store.getState().applyCommissionXp(-30) // 10-30=-20 → L1, xp 80(=100-20)
    expect(store.getState().commissionLevel).toBe(1)
    expect(store.getState().commissionXp).toBe(80)
  })

  it('레벨 1 바닥: 더 내려갈 곳 없으면 경험치 0 으로 클램프', () => {
    const store = createGameStore({ commissionLevel: 1, commissionXp: 10 })
    store.getState().applyCommissionXp(-50)
    expect(store.getState().commissionLevel).toBe(1)
    expect(store.getState().commissionXp).toBe(0)
  })
})
