import { create } from 'zustand'
import { dataManager } from '../data/DataManager'
import { Enhancer, type EnhanceInput } from '../game/enhancer'
import type { EnhanceResult, ItemStack, PlayerState } from '../game/types'
import { swordItemLevel } from '../lib/items'

// 시작 자금 / 시작 검. 시작 자금은 사용자 지정값(100만). 시작 검 획득 방식 등 나머지
// '게임 시작 설정'은 디자인 미확정이며, 밸런스 확정 시 이 값은 조정될 수 있다.
export const INITIAL_GOLD = 1_000_000
export const INITIAL_SWORD_LEVEL = 0

type GameActions = {
  // 강화 가능 여부(전제조건 충족). UI 버튼 게이팅용.
  canEnhance: (useProtection: boolean) => boolean
  // 강화 1회 시도. 전제조건 미충족이면 null(아무 변화 없음),
  // 충족이면 엔진 결과를 플레이어 상태에 적용하고 그 결과를 반환한다.
  enhance: (useProtection: boolean) => EnhanceResult | null
  // 판매 가능 여부(검 보유 + 판매가 존재). UI 버튼 게이팅용.
  canSell: () => boolean
  // 현재 검 판매: 판매가만큼 골드를 받고 검을 비운다(currentSwordLevel = null).
  // 판매 불가(검 없음 / sellPrice null)면 null 반환(변화 없음). 반환값 = 받은 골드.
  sell: () => number | null
}

export type GameState = PlayerState & GameActions

type CreateOpts = {
  // 확률 판정 엔진(테스트에서 결정적 rng 주입). 미지정 시 Math.random 기반.
  enhancer?: Enhancer
  gold?: number
  currentSwordLevel?: number | null
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

// 빈 강화 슬롯을 채울 다음 검을 정한다(파괴·판매 공통 규칙).
//  - 인벤토리에 검(sword_<n>)이 있으면 최고 레벨을 장착하고 그 스택 1개를 차감,
//  - 없으면 낡은 단검(+0 = INITIAL_SWORD_LEVEL)을 생성해 장착(items 변화 없음).
function equipNextFromBag(items: readonly ItemStack[]): {
  level: number
  items: ItemStack[]
} {
  const bagSwords: { itemId: string; lvl: number }[] = []
  for (const it of items) {
    const lvl = swordItemLevel(it.itemId)
    if (lvl !== null) bagSwords.push({ itemId: it.itemId, lvl })
  }
  if (bagSwords.length === 0) {
    return { level: INITIAL_SWORD_LEVEL, items: items.map((i) => ({ ...i })) }
  }
  const best = bagSwords.reduce((a, b) => (b.lvl > a.lvl ? b : a))
  return {
    level: best.lvl,
    items: subtractItems(items, [{ itemId: best.itemId, count: 1 }]),
  }
}

// 게임 진행 상태 store 팩토리. 기본 인스턴스(useGameStore)는 Math.random 엔진을 쓰고,
// 테스트는 결정적 enhancer와 초기 상태를 주입해 독립 store를 만든다.
export function createGameStore(opts: CreateOpts = {}) {
  const enhancer = opts.enhancer ?? new Enhancer()

  return create<GameState>((set, get) => {
    // 현재 검(레벨) → 검 정의 + 공급(골드·아이템)으로 EnhanceInput 구성.
    // 검이 없거나(파산) 정의를 못 찾으면 null. 이것이 레벨↔items(sword_<level>) seam이다.
    const buildInput = (useProtection: boolean): EnhanceInput | null => {
      const level = get().currentSwordLevel
      if (level === null) return null
      const sword = dataManager.getSwordByLevel(level)
      if (!sword) return null
      return {
        sword,
        supply: { gold: get().gold, items: get().items },
        useProtection,
      }
    }

    return {
      gold: opts.gold ?? INITIAL_GOLD,
      currentSwordLevel:
        opts.currentSwordLevel !== undefined
          ? opts.currentSwordLevel
          : INITIAL_SWORD_LEVEL,
      items: opts.items ?? [],

      canEnhance: (useProtection) => {
        const input = buildInput(useProtection)
        return input !== null && enhancer.canEnhance(input)
      },

      enhance: (useProtection) => {
        const input = buildInput(useProtection)
        if (input === null || !enhancer.canEnhance(input)) return null

        const result = enhancer.enhance(input)
        // 반환하는 result는 엔진 이벤트 그대로(파괴는 outcome 'destroyed', toLevel null) — 토스트·드랍 표시용.
        set((state) => {
          // 1) 소모 적용(골드 + consumed.items) → 2) 드랍 병합.
          const baseItems = addItems(
            subtractItems(state.items, result.consumed.items),
            result.drops,
          )
          // 파괴 시 검을 잃지 않고 인벤토리 검(없으면 낡은 단검)으로 재시작(판매와 동일 규칙).
          // 성공(+1)·방지(유지)는 엔진 결과의 toLevel을 그대로 따른다.
          if (result.outcome === 'destroyed') {
            const next = equipNextFromBag(baseItems)
            return {
              gold: state.gold - result.consumed.gold,
              currentSwordLevel: next.level,
              items: next.items,
            }
          }
          return {
            gold: state.gold - result.consumed.gold,
            currentSwordLevel: result.toLevel,
            items: baseItems,
          }
        })
        return result
      },

      canSell: () => {
        const level = get().currentSwordLevel
        if (level === null) return false
        const sword = dataManager.getSwordByLevel(level)
        return sword !== undefined && sword.sellPrice !== null
      },

      sell: () => {
        const level = get().currentSwordLevel
        if (level === null) return null
        const sword = dataManager.getSwordByLevel(level)
        if (!sword || sword.sellPrice === null) return null

        const price = sword.sellPrice
        set((state) => {
          // 판매 후 빈 슬롯을 인벤토리 검(없으면 낡은 단검)으로 채운다(파괴와 동일 규칙).
          const next = equipNextFromBag(state.items)
          return {
            gold: state.gold + price,
            currentSwordLevel: next.level,
            items: next.items,
          }
        })
        return price
      },
    }
  })
}

// 앱 전역 공유 store 인스턴스.
export const useGameStore = createGameStore()
