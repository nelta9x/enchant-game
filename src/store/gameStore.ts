import { create } from 'zustand'
import { dataManager } from '../data/DataManager'
import type { Material, ShopItem } from '../data/types'
import { Enhancer, type EnhanceInput } from '../game/enhancer'
import type { EnhanceResult, ItemStack, PlayerState } from '../game/types'
import { countOf } from '../lib/items'

// 시작 자금 / 시작 검. 시작 자금은 사용자 지정값(10만) — 새 플레이어가 의뢰 첫 골드 버킷(보유 50만 미만)에서
// 시작하도록 한다. 시작 검 획득 방식 등 나머지 '게임 시작 설정'은 디자인 미확정이며 조정될 수 있다.
export const INITIAL_GOLD = 100_000
export const INITIAL_SWORD_ID = 'sword_0'

type GameActions = {
  // 강화 가능 여부(전제조건 충족). UI 버튼 게이팅용.
  canEnhance: (useProtection: boolean) => boolean
  // 강화 1회 시도. 전제조건 미충족이면 null(아무 변화 없음),
  // 충족이면 엔진 결과를 플레이어 상태에 적용하고 그 결과를 반환한다.
  enhance: (useProtection: boolean) => EnhanceResult | null
  // 판매 가능 여부(검 보유 + 판매가 존재). UI 버튼 게이팅용.
  canSell: () => boolean
  // 현재 검 판매: 판매가만큼 골드를 받고 검을 비운다(currentSwordId = null).
  // 판매 불가(검 없음 / sellPrice null)면 null 반환(변화 없음). 반환값 = 받은 골드.
  sell: () => number | null
  // 상점 구매 가능 여부(항목 존재 + 가격 충족). UI 버튼 게이팅용. shopId = 상점 항목 SKU.
  canBuy: (shopId: string, qty?: number) => boolean
  // 상점 구매(shopId = 상점 항목 SKU): 가격(골드/아이템) × qty 만큼 차감하고 지급 아이템을
  // qty개 인벤토리에 적재한다. 불가(항목 없음 / 가격 부족 / qty 비정상)면 null(변화 없음).
  // 반환값 = 구매한 상점 항목(ShopItem).
  buy: (shopId: string, qty?: number) => ShopItem | null
  // 보관 가능 여부(현재 검이 있고 시작 검이 아님). UI 게이팅용.
  canStore: () => boolean
  // 현재 검을 인벤토리에 보관하고 시작 검(낡은 단검)으로 되돌린다.
  // 보관 불가(검 없음 / 이미 시작 검)면 아무 변화 없음.
  store: () => void
  // 가방의 검(itemId)을 강화 슬롯에 장착한다. 현재 검은 가방으로 보관하고(시작 검이면 버림),
  // itemId 1개를 가방에서 뺀다. 검이 아니거나 미보유면 아무 변화 없음(방어).
  // canStore 와 달리 canEquip 게이트는 두지 않는다 — 가방에 렌더되는 검 행은 항상 보유(count>0)
  // 하는 실제 검이라 장착이 늘 유효하다(게이팅할 무효 상태가 없음). 판매·강화처럼 무효 상태가
  // 발생할 수 있는 동작만 canX 게이트를 둔다.
  equip: (itemId: string) => void
  // 파괴 드랍 "수집": pendingDrops 에서 itemId 를 count 만큼(보유 대기분 한도 내에서) items 로 옮긴다.
  // 흩뿌림 연출에서 토큰이 인벤토리에 도착할 때마다 호출된다. 대기분을 초과해 추가하지 않으므로
  // flushDrops 와 겹쳐도 중복 합산되지 않는다(연출 완료 콜백이 flush 뒤 늦게 와도 안전).
  collectDrop: (itemId: string, count: number) => void
  // 남은 pendingDrops 전체를 items 로 합산하고 비운다(연출 종료 시 미수집분 유실 방지). 멱등 —
  // 대기분이 없으면 무변화라 종료 트리거가 여러 번 와도 안전하다.
  flushDrops: () => void
  // 거래 성사 가능 여부(비용을 지불할 수 있는가). 비용이 골드면 보유 골드, 아이템이면 가방 수량(또는 검이면 장착 중·수량 1). 카드 게이팅용.
  canFulfill: (cost: Material) => boolean
  // 거래 성사: 비용(cost)을 지불하고 보상(reward)을 지급한다. 비용이 골드면 골드 차감, 아이템이면 가방 우선(→ 검이면 장착 검) 소모.
  // cost·reward 는 거래 생성 시 freeze 한 Material — store 에서 재계산하지 않는다(단일 출처).
  // 성사 성공이면 true, 지불 불가면 false(아무 변화 없음).
  fulfillCommission: (cost: Material, reward: Material) => boolean
}

export type GameState = PlayerState & GameActions

type CreateOpts = {
  // 확률 판정 엔진(테스트에서 결정적 rng 주입). 미지정 시 Math.random 기반.
  enhancer?: Enhancer
  gold?: number
  currentSwordId?: string | null
  items?: ItemStack[]
}

// 불변 차감: removals 수량만큼 빼고, 0 이하가 된 슬롯은 제거한다.
// (전제조건은 호출 전 enhancer가 검증하므로 음수는 발생하지 않지만 방어적으로 필터)
function subtractItems(
  items: readonly ItemStack[],
  removals: readonly ItemStack[],
): ItemStack[] {
  const next = items.map((i) => ({ ...i }))
  for (const r of removals) {
    const slot = next.find((i) => i.itemId === r.itemId)
    if (slot) slot.count -= r.count
  }
  return next.filter((i) => i.count > 0)
}

// 불변 추가: additions를 기존 스택에 합산(없으면 새 슬롯 생성).
function addItems(
  items: readonly ItemStack[],
  additions: readonly ItemStack[],
): ItemStack[] {
  const next = items.map((i) => ({ ...i }))
  for (const a of additions) {
    const slot = next.find((i) => i.itemId === a.itemId)
    if (slot) slot.count += a.count
    else next.push({ ...a })
  }
  return next
}

// 가격(골드/아이템/무료) 충족 여부 — canBuy 게이트와 buy 게이트가 공유하는 단일 정의.
function canAfford(
  price: Material,
  qty: number,
  gold: number,
  items: readonly ItemStack[],
): boolean {
  if (price.kind === 'free') return true
  if (price.kind === 'gold') return gold >= price.amount * qty
  return countOf(items, price.itemId) >= price.count * qty
}

// 가격 차감 후의 골드·인벤토리(구매 아이템 적재 전). buy 의 적용부가 공유한다.
function chargeFor(
  price: Material,
  qty: number,
  gold: number,
  items: readonly ItemStack[],
): { gold: number; items: readonly ItemStack[] } {
  if (price.kind === 'gold') return { gold: gold - price.amount * qty, items }
  if (price.kind === 'item')
    return {
      gold,
      items: subtractItems(items, [
        { itemId: price.itemId, count: price.count * qty },
      ]),
    }
  return { gold, items } // free
}

// 빈 강화 슬롯은 항상 낡은 단검(INITIAL_SWORD_ID, +0)으로 재시작한다(파괴·판매·의뢰완료 공통 규칙).
// 인벤토리에 검이 있어도 자동 장착하지 않는다 — 플레이어가 모르는 사이 보관 검이 강화되는 것을 막기 위함.
// 보관 검은 가방에 그대로 남고, 다시 쓰려면 명시적으로 equip 해야 한다(items 변화 없음).

// 강화 슬롯에서 빠지는 검(outgoingId)을 가방에 보관한다(보관·장착 공통).
// 불변식: 가방엔 시작 검(낡은 단검)이 없다 — 빈 슬롯은 시작 검을 '생성'해 채울 뿐
// 보관하지 않는 것과 동일하게, 시작 검(과 null=검 없음)은 가방에 두지 않고 버린다.
function bankOutgoing(
  items: readonly ItemStack[],
  outgoingId: string | null,
): ItemStack[] {
  if (outgoingId === null || outgoingId === INITIAL_SWORD_ID) {
    return items.map((i) => ({ ...i }))
  }
  return addItems(items, [{ itemId: outgoingId, count: 1 }])
}

// 게임 진행 상태 store 팩토리. 기본 인스턴스(useGameStore)는 Math.random 엔진을 쓰고,
// 테스트는 결정적 enhancer와 초기 상태를 주입해 독립 store를 만든다.
export function createGameStore(opts: CreateOpts = {}) {
  const enhancer = opts.enhancer ?? new Enhancer()

  return create<GameState>((set, get) => {
    // 현재 검(id) → 검 정의 + 공급(골드·아이템)으로 EnhanceInput 구성.
    // 검이 없거나(파산) 정의를 못 찾으면 null. 이것이 id↔items seam이다.
    const buildInput = (useProtection: boolean): EnhanceInput | null => {
      const id = get().currentSwordId
      if (id === null) return null
      const sword = dataManager.getSwordById(id)
      if (!sword) return null
      return {
        sword,
        supply: { gold: get().gold, items: get().items },
        useProtection,
      }
    }

    return {
      gold: opts.gold ?? INITIAL_GOLD,
      currentSwordId:
        opts.currentSwordId !== undefined
          ? opts.currentSwordId
          : INITIAL_SWORD_ID,
      items: opts.items ?? [],
      pendingDrops: [],

      canEnhance: (useProtection) => {
        const input = buildInput(useProtection)
        return input !== null && enhancer.canEnhance(input)
      },

      enhance: (useProtection) => {
        const input = buildInput(useProtection)
        if (input === null || !enhancer.canEnhance(input)) return null

        const result = enhancer.enhance(input)
        // 반환하는 result는 엔진 이벤트 그대로(파괴는 outcome 'destroyed', toId null) — 연출·드랍 표시용.
        set((state) => {
          // 소모 적용(골드 + consumed.items). 드랍은 즉시 items 에 넣지 않는다 — "수집 연출"에서
          // 토큰이 인벤토리에 도착할 때 collectDrop 으로 옮긴다(deferred). 그 전까지 pendingDrops 에 둔다.
          const baseItems = subtractItems(state.items, result.consumed.items)
          // 파괴 시 낡은 단검(+0)으로 재시작한다(판매·의뢰완료와 동일 규칙).
          // 인벤토리 검은 자동 장착하지 않고 그대로 둔다 — 보관 검의 의도치 않은 강화 방지.
          // 성공(다음 검)·방지(유지)는 엔진 결과의 toId를 그대로 따른다.
          if (result.outcome === 'destroyed') {
            return {
              gold: state.gold - result.consumed.gold,
              currentSwordId: INITIAL_SWORD_ID,
              items: baseItems,
              // 미수집 대기분에 합산(replace 가 아닌 merge) — 연속 파괴(파괴 후 가방 검 자동 장착 →
              // 같은 연출 창 안에서 재실패) 시에도 이전 잔여분이 유실되지 않는다. flush 가 한도 내에서 정리.
              pendingDrops: addItems(state.pendingDrops, result.drops),
            }
          }
          return {
            gold: state.gold - result.consumed.gold,
            currentSwordId: result.toId,
            items: baseItems,
          }
        })
        return result
      },

      canSell: () => {
        const id = get().currentSwordId
        if (id === null) return false
        const sword = dataManager.getSwordById(id)
        return sword !== undefined && sword.sellPrice !== null
      },

      sell: () => {
        const id = get().currentSwordId
        if (id === null) return null
        const sword = dataManager.getSwordById(id)
        if (!sword || sword.sellPrice === null) return null

        const price = sword.sellPrice
        set((state) => {
          // 판매 후 빈 슬롯은 낡은 단검(+0)으로 채운다(파괴·의뢰완료와 동일 규칙).
          // 인벤토리 검은 자동 장착하지 않고 그대로 둔다 — 보관 검의 의도치 않은 강화 방지.
          return {
            gold: state.gold + price,
            currentSwordId: INITIAL_SWORD_ID,
            items: state.items.map((i) => ({ ...i })),
          }
        })
        return price
      },

      canBuy: (shopId, qty = 1) => {
        if (!Number.isInteger(qty) || qty <= 0) return false
        const entry = dataManager.getShopItem(shopId)
        if (!entry) return false
        return canAfford(entry.price, qty, get().gold, get().items)
      },

      buy: (shopId, qty = 1) => {
        if (!Number.isInteger(qty) || qty <= 0) return null
        const entry = dataManager.getShopItem(shopId)
        if (!entry) return null
        // 게이트는 canBuy 와 동일한 canAfford 로 단일화한다(이중 작성 → 어긋남 방지).
        if (!canAfford(entry.price, qty, get().gold, get().items)) return null

        set((state) => {
          const paid = chargeFor(entry.price, qty, state.gold, state.items)
          // 구매한 아이템(지급 itemId)을 qty개 인벤토리에 적재(스택 합산).
          // (검 itemId를 파는 경우의 '장착' 처리는 검 상점 도입 시 별도로 다룬다.)
          return {
            gold: paid.gold,
            items: addItems(paid.items, [{ itemId: entry.itemId, count: qty }]),
          }
        })
        return entry
      },

      canStore: () => {
        const id = get().currentSwordId
        return id !== null && id !== INITIAL_SWORD_ID
      },

      store: () => {
        const id = get().currentSwordId
        // 게이트는 canStore 와 동일 조건(시작 검·검 없음이면 보관할 게 없음).
        if (id === null || id === INITIAL_SWORD_ID) return
        set((state) => ({
          currentSwordId: INITIAL_SWORD_ID,
          items: bankOutgoing(state.items, id),
        }))
      },

      equip: (itemId) => {
        // 방어적 전제: 검으로 해석되고 1개 이상 보유해야 한다(아니면 무변화).
        if (dataManager.getSwordById(itemId) === undefined) return
        if (countOf(get().items, itemId) <= 0) return
        set((state) => ({
          currentSwordId: itemId,
          // 현재 검을 가방으로 보관(시작 검이면 버림) → 장착할 검 1개를 가방에서 뺀다.
          // itemId === 현재 검이어도 보관 +1 / 차감 -1 이 상쇄돼 안전한 무변화다.
          items: subtractItems(
            bankOutgoing(state.items, state.currentSwordId),
            [{ itemId, count: 1 }],
          ),
        }))
      },

      collectDrop: (itemId, count) => {
        set((state) => {
          // 대기분(pendingDrops)을 한도로만 옮긴다 — 음수·과다 추가, flush 와의 중복 합산을 막는다.
          const take = Math.min(count, countOf(state.pendingDrops, itemId))
          if (take <= 0) return state
          return {
            items: addItems(state.items, [{ itemId, count: take }]),
            pendingDrops: subtractItems(state.pendingDrops, [
              { itemId, count: take },
            ]),
          }
        })
      },

      flushDrops: () => {
        set((state) =>
          state.pendingDrops.length === 0
            ? state // 멱등 — 대기분이 없으면 무변화(종료 트리거 중복 호출 안전)
            : {
                items: addItems(state.items, state.pendingDrops),
                pendingDrops: [],
              },
        )
      },

      canFulfill: (cost) => {
        const s = get()
        if (cost.kind === 'gold') return s.gold >= cost.amount
        if (cost.kind === 'item')
          return (
            countOf(s.items, cost.itemId) >= cost.count ||
            (cost.count === 1 && s.currentSwordId === cost.itemId)
          )
        return true // free(비용 없음) — 방어
      },

      fulfillCommission: (cost, reward) => {
        const state = get()
        // 보상(Material) 지급을 items/gold 에 반영한 상태 조각을 만든다(비용 차감과 합성).
        const grant = (
          items: readonly ItemStack[],
          gold: number,
        ): { items: ItemStack[]; gold: number } => {
          if (reward.kind === 'gold')
            return { items: items.map((i) => ({ ...i })), gold: gold + reward.amount }
          if (reward.kind === 'item')
            return {
              items: addItems(items, [
                { itemId: reward.itemId, count: reward.count },
              ]),
              gold,
            }
          return { items: items.map((i) => ({ ...i })), gold } // free
        }

        // 골드 비용(골드로 구매): 보유 골드로 지불하고 보상을 지급한다(가방/검 무관).
        if (cost.kind === 'gold') {
          if (state.gold < cost.amount) return false
          set(grant(state.items, state.gold - cost.amount))
          return true
        }

        // 아이템 비용(납품): 가방 우선 → 없으면 장착 검(수량 1). 기존 경로 유지.
        if (cost.kind === 'item') {
          // 가방 우선: count 개 이상 보유하면 거기서 차감하고 장착 슬롯은 건드리지 않는다.
          // 재료(철조각·형광물질 등)는 항상 이 경로로 처리된다(가방에만 존재).
          if (countOf(state.items, cost.itemId) >= cost.count) {
            set(
              grant(
                subtractItems(state.items, [
                  { itemId: cost.itemId, count: cost.count },
                ]),
                state.gold,
              ),
            )
            return true
          }
          // 가방에 없고 현재 장착 검이 요구 검이면(수량 1) 그것을 소모하고 낡은 단검(+0)으로 재시작한다
          // (판매·파괴와 동일 규칙). 재료 itemId 는 currentSwordId 와 일치할 수 없어 이 분기를 타지 않는다.
          if (cost.count === 1 && state.currentSwordId === cost.itemId) {
            set({ ...grant(state.items, state.gold), currentSwordId: INITIAL_SWORD_ID })
            return true
          }
        }
        return false // 지불 불가 — 변화 없음
      },
    }
  })
}

// 앱 전역 공유 store 인스턴스.
export const useGameStore = createGameStore()
