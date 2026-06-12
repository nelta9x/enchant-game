import { create } from 'zustand'
import { dataManager } from '../data/DataManager'
import type { Material, ShopItem } from '../data/types'
import { Enhancer, type EnhanceInput } from '../game/enhancer'
import {
  startPress,
  pressRound,
  pressBank,
  type GambleParams,
  type PressState,
} from '../game/gamble'
import type { EnhanceResult, ItemStack, PlayerState } from '../game/types'
import type { Commission } from './commissionQueue'
import { countOf } from '../lib/items'

// 수상한 상인(도박) 확정 결과(연출용). 셸이 base/최종 레벨의 검 id 를 해석해 돌려준다 — 뷰(GameScreen)가
// won(=banked)으로 연출(승=상승 버스트 / 패=하락 폭발)을 고르고, fromId/toId 로 잔상·등장 검을 그린다.
export type GambleOutcome = { won: boolean; fromId: string; toId: string }

// 진행 중인 press-your-luck 세션(셸 상태). 순수 진행 상태(press)에 셸 관심사(만료 시각·튜닝값)를 더한다.
//  - press: 순수 코어 상태(레벨·라운드·status). 라운드 진행의 단일 출처.
//  - params: 발급 시 freeze 된 도박 튜닝값(라운드마다 동일하게 적용).
//  - deadline: 절대 만료 시각(의뢰 카드의 expiresAt 을 이어받음). 카드 타이머 카운트다운 + 만료 시 자동 확정(bank)용.
export type GambleSession = {
  press: PressState
  params: GambleParams
  deadline: number
}

// 시작 자금 / 시작 검. 시작 자금은 사용자 지정값(10만) — 새 플레이어가 의뢰 첫 골드 버킷(보유 50만 미만)에서
// 시작하도록 한다. 시작 검 획득 방식 등 나머지 '게임 시작 설정'은 디자인 미확정이며 조정될 수 있다.
export const INITIAL_GOLD = 100_000
export const INITIAL_SWORD_ID = 'sword_1'

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
  // 현재 검을 인벤토리에 보관하고 시작 검(검 +1)으로 되돌린다.
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
  // 의뢰 카드 게이팅(거래 또는 도박 공통). 거래는 canFulfill(cost), 도박은 비용이 없어 "검 보유"만 본다.
  // (canFulfill 은 Material 만 받아 도박을 게이팅할 수 없으므로 Commission 전체를 받는 진입점을 둔다.)
  canFulfillCommission: (commission: Commission) => boolean
  // 도박 시작: 현재 검 레벨을 base 로 press-your-luck 세션을 연다(아직 안 굴림 — currentSwordId 불변).
  // deadline 은 의뢰 카드의 만료(expiresAt)를 이어받는다(카드 타이머·만료 자동 확정용). 검이 없으면 무변화.
  startGamble: (params: GambleParams, deadline: number) => void
  // 한 라운드 굴림. rolling 일 때만 동작(아니면 무변화 — 멱등 가드). 매 판정마다 검을 즉시 교체한다(non-escrow):
  // 성공이면 누적 레벨 검으로 바꾸고 세션 유지, 확정/실패면 최종 레벨 검으로 바꾸고 세션을 비운다. 갱신된 세션을
  // 돌려준다(뷰가 from→to 강화 성공/실패 연출에 사용).
  rollGamble: () => GambleSession | null
  // 멈춤/만료 확정. rolling 일 때만 현재 누적 레벨로 확정하고 세션을 비운다(검은 직전 성공이 이미 그 레벨로 바꿔 둠).
  bankGamble: () => GambleSession | null
  // 거래 성사: 비용(cost)을 지불하고 보상(reward)을 지급한다. 비용이 골드면 골드 차감, 아이템이면 가방 우선(→ 검이면 장착 검) 소모.
  // cost·reward 는 거래 생성 시 freeze 한 Material — store 에서 재계산하지 않는다(단일 출처).
  // 성사 성공이면 true, 지불 불가면 false(아무 변화 없음).
  fulfillCommission: (cost: Material, reward: Material) => boolean
  // 데이터 적재 후 1회 호출(main). 전역 store 는 적재 전(모듈 평가 시점) 생성돼 maxLevelReached 가 0 으로
  // 출발하므로, 현재(시작) 검을 set 래퍼에 다시 흘려보내 최고 도달치를 그 검 레벨까지 끌어올린다.
  syncRecordToCurrent: () => void
}

export type GameState = PlayerState &
  GameActions & {
    // 진행 중인 도박(press-your-luck) 세션. null = 진행 중 아님. 의뢰 바가 구독해 수상한 상인 카드를 그리고,
    // 누를 때마다 1라운드씩 굴린다. 매 판정이 검을 실제로 교체하지만(non-escrow), 세션 중엔 강화·판매·보관을
    // 막아(canX→false) 진행 중 검을 다른 데 못 쓰게 한다(골드 복제 등 차단).
    gambleSession: GambleSession | null
  }

type CreateOpts = {
  // 확률 판정 엔진(테스트에서 결정적 rng 주입). 미지정 시 Math.random 기반.
  enhancer?: Enhancer
  // 도박(takeGamble) 판정용 rng(테스트에서 결정적 주입). 미지정 시 Math.random. enhancer 의 rng 와 독립이다.
  gambleRng?: () => number
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

// 빈 강화 슬롯은 항상 시작 검(INITIAL_SWORD_ID = 검 +1)으로 재시작한다(파괴·판매·의뢰완료 공통 규칙).
// 인벤토리에 검이 있어도 자동 장착하지 않는다 — 플레이어가 모르는 사이 보관 검이 강화되는 것을 막기 위함.
// 보관 검은 가방에 그대로 남고, 다시 쓰려면 명시적으로 equip 해야 한다(items 변화 없음).

// 강화 슬롯에서 빠지는 검(outgoingId)을 가방에 보관한다(보관·장착 공통).
// 불변식: 가방엔 시작 검(검 +1)이 없다 — 빈 슬롯은 시작 검을 '생성'해 채울 뿐
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
  const gambleRng = opts.gambleRng ?? Math.random

  return create<GameState>((rawSet, get) => {
    // 검 id → 레벨(검 없음/미상은 0). maxLevelReached 초기화·갱신이 공유한다.
    const levelOf = (id: string | null): number =>
      id ? (dataManager.getSwordById(id)?.level ?? 0) : 0

    // ── 단조 최고 도달 레벨(maxLevelReached)의 단일 출처 ──
    // currentSwordId 가 "더 높은 레벨" 검으로 바뀌는 모든 갱신을 가로채 maxLevelReached 를 끌어올린다.
    // 강화 성공·장착(보관검·의뢰 보상검)·향후 검 상점 등 경로에 무관하게 자동 반영되고(어느 액션에서
    // currentSwordId 를 올리든 한 곳에서 잡는다), 파괴·판매로 시작 검(+1)이 돼도 내려가지 않는다(high-water-mark).
    // next 를 그대로 펼치고 maxLevelReached 만 더하므로 다른 상태(골드·아이템 등)는 손대지 않는다(안전).
    // 모든 액션은 set 을 단일 인자(부분 상태 또는 갱신 함수)로만 호출한다 — zustand 의 replace 인자는 쓰지 않는다.
    const set = (
      partial: Partial<GameState> | ((state: GameState) => Partial<GameState>),
    ): void => {
      rawSet((state) => {
        const next = typeof partial === 'function' ? partial(state) : partial
        if ('currentSwordId' in next) {
          const level = levelOf(next.currentSwordId ?? null)
          if (level > state.maxLevelReached)
            return { ...next, maxLevelReached: level }
        }
        return next
      })
    }

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

    // 도박 매 라운드 검 교체 — 누적 레벨(press.currentLevel)의 검으로 currentSwordId 를 즉시 바꾼다(non-escrow).
    // 도박은 "강화의 변형"이라 매 판정이 실제 검을 강화(성공=레벨 상승)/약화(실패=base-loseDelta 하락)시키고,
    // 메인 스테이지가 그 변화를 강화 성공/실패 연출로 그린다(별도 패널 없음). 레벨↔검 1:1 이므로 클램프된 레벨의
    // 검은 항상 존재해야 한다(없으면 데이터 이상 — 방어적으로 검을 유지). set 래퍼가 상승을 잡아 maxLevelReached 를
    // 갱신하므로 중간 누적(잠정 +N)도 "실제 도달"로 기록된다 — 강화처럼 그 레벨 검을 실제로 손에 쥐었기 때문.
    // ends=true 면 세션을 비운다(확정/실패), false 면 세션은 유지하고 검만 갱신한다(성공 후 다음 라운드 대기).
    const applyLevel = (level: number, ends: boolean, next?: GambleSession): void => {
      const toSword = dataManager.getSwordByLevel(level)
      set((s) => ({
        currentSwordId: toSword ? toSword.id : s.currentSwordId,
        gambleSession: ends ? null : (next ?? s.gambleSession),
      }))
    }

    return {
      gold: opts.gold ?? INITIAL_GOLD,
      currentSwordId:
        opts.currentSwordId !== undefined
          ? opts.currentSwordId
          : INITIAL_SWORD_ID,
      items: opts.items ?? [],
      pendingDrops: [],
      // 역대 최고 도달 강화 레벨(단조). 전역 store 생성은 dataManager.load() 이전(모듈 평가 시점)이라
      // 여기서 검을 조회하면 안 된다(미적재 → throw). opts.currentSwordId 미지정(전역)은 null 로 단락해 0 —
      // 시작 검(sword_1 = +1)을 들고도 0 으로 출발하므로, main 이 적재 후 syncRecordToCurrent 로 +1 까지 보정한다.
      // 테스트처럼 currentSwordId 를 지정하면(load 이후 생성) 그 검 레벨에서 시작한다.
      // 이후 상승은 위 set 래퍼가 단일 지점에서 반영한다.
      maxLevelReached: levelOf(opts.currentSwordId ?? null),
      // 진행 중인 도박 세션(시작 시 없음). startGamble 에서 열고 roll/bank/만료에서 비운다.
      gambleSession: null,

      canEnhance: (useProtection) => {
        // 도박 세션 중엔 검이 에스크로라 강화 불가 — canX 가 false 면 버튼이 자동 비활성된다.
        if (get().gambleSession !== null) return false
        const input = buildInput(useProtection)
        return input !== null && enhancer.canEnhance(input)
      },

      enhance: (useProtection) => {
        // 에스크로 보호 — 도박 확정 전 검을 강화하지 못하게 단일 차단점에서 막는다(마우스·키보드·향후 경로 공통).
        if (get().gambleSession !== null) return null
        const input = buildInput(useProtection)
        if (input === null || !enhancer.canEnhance(input)) return null

        const result = enhancer.enhance(input)
        // 반환하는 result는 엔진 이벤트 그대로(파괴는 outcome 'destroyed', toId null) — 연출·드랍 표시용.
        set((state) => {
          // 소모 적용(골드 + consumed.items). 드랍은 즉시 items 에 넣지 않는다 — "수집 연출"에서
          // 토큰이 인벤토리에 도착할 때 collectDrop 으로 옮긴다(deferred). 그 전까지 pendingDrops 에 둔다.
          const baseItems = subtractItems(state.items, result.consumed.items)
          // 파괴 시 시작 검(+1)으로 재시작한다(판매·의뢰완료와 동일 규칙).
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
        // 도박 세션 중엔 검이 에스크로 — 판매 불가(에스크로 검 판매 후 확정이 복원하는 골드 복제 차단).
        if (get().gambleSession !== null) return false
        const id = get().currentSwordId
        if (id === null) return false
        const sword = dataManager.getSwordById(id)
        return sword !== undefined && sword.sellPrice !== null
      },

      sell: () => {
        if (get().gambleSession !== null) return null
        const id = get().currentSwordId
        if (id === null) return null
        const sword = dataManager.getSwordById(id)
        if (!sword || sword.sellPrice === null) return null

        const price = sword.sellPrice
        set((state) => {
          // 판매 후 빈 슬롯은 시작 검(+1)으로 채운다(파괴·의뢰완료와 동일 규칙).
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
        // 도박 세션 중엔 검이 에스크로 — 보관 불가(확정 전까지 currentSwordId 를 옮기지 못하게).
        if (get().gambleSession !== null) return false
        const id = get().currentSwordId
        return id !== null && id !== INITIAL_SWORD_ID
      },

      store: () => {
        if (get().gambleSession !== null) return
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
          // 가방에 없고 현재 장착 검이 요구 검이면(수량 1) 그것을 소모하고 시작 검(+1)으로 재시작한다
          // (판매·파괴와 동일 규칙). 재료 itemId 는 currentSwordId 와 일치할 수 없어 이 분기를 타지 않는다.
          if (cost.count === 1 && state.currentSwordId === cost.itemId) {
            set({ ...grant(state.items, state.gold), currentSwordId: INITIAL_SWORD_ID })
            return true
          }
        }
        return false // 지불 불가 — 변화 없음
      },

      canFulfillCommission: (commission) => {
        // 도박은 비용이 없다 — "검을 건다"가 전제이므로 검 보유만 본다(레벨 게이트는 출제 단계에서 이미 적용).
        if (commission.kind === 'gamble') return get().currentSwordId !== null
        return get().canFulfill(commission.cost)
      },

      startGamble: (params, deadline) => {
        const id = get().currentSwordId
        if (id === null) return
        const sword = dataManager.getSwordById(id)
        if (!sword) return
        // 세션만 연다(아직 굴리지 않음 — currentLevel=base). 첫 굴림은 곧바로 rollGamble 이 한다(카드 클릭 = 즉시 1회 판정).
        // 검을 거는 도박이라 인벤토리·골드는 건드리지 않는다.
        set({
          gambleSession: { press: startPress(sword.level), params, deadline },
        })
      },

      rollGamble: () => {
        const session = get().gambleSession
        // 멱등 가드: rolling 이 아니면 무변화 — 만료 타이머와 입력의 경합을 "먼저 끝낸 쪽이 이긴다"로 해소한다.
        if (!session || session.press.status !== 'rolling') return session
        // 하한=시작 검 레벨, 상한=최고 검 레벨 — 순수 코어(pressRound)에 주입한다(검 데이터 해석은 셸 몫).
        const floorLevel = levelOf(INITIAL_SWORD_ID)
        const ceilLevel = dataManager.getMaxSwordLevel()
        const press = pressRound(
          session.press,
          session.params,
          { floorLevel, ceilLevel },
          gambleRng,
        )
        const next: GambleSession = { ...session, press }
        // 매 판정마다 검을 즉시 교체한다(non-escrow). 성공(rolling)이면 누적 레벨 검으로 바꾸고 세션 유지(다음 라운드
        // 대기), 확정(banked)·실패(busted)면 최종 레벨 검으로 바꾸고 세션을 비운다. 반환값(next)은 뷰의 결과 연출용.
        applyLevel(press.currentLevel, press.status !== 'rolling', next)
        return next
      },

      bankGamble: () => {
        const session = get().gambleSession
        if (!session || session.press.status !== 'rolling') return session
        // 멈춤/만료 확정 — 현재 누적 레벨 그대로 확정하고 세션을 비운다. non-escrow 라 검은 이미 그 레벨이지만
        // (직전 성공 굴림이 교체했다) applyLevel 로 idempotent 하게 맞춘다(굴림 0회 만료면 base 그대로).
        const press = pressBank(session.press)
        const next: GambleSession = { ...session, press }
        applyLevel(press.currentLevel, true)
        return next
      },

      // 데이터 적재 후(main) 전역 store 의 최고 도달치를 현재 검 레벨로 보정한다. 현재 검을 그대로
      // set 에 다시 흘려보내면 위 set 래퍼가 levelOf 로 maxLevelReached 를 끌어올린다(단일 출처 재사용 —
      // 상수·레벨 파싱 없음). 같은 검이라 다른 상태는 건드리지 않고, 단조라 이미 더 높으면 무변화다.
      syncRecordToCurrent: () => {
        set((s) => ({ currentSwordId: s.currentSwordId }))
      },
    }
  })
}

// 앱 전역 공유 store 인스턴스.
export const useGameStore = createGameStore()
