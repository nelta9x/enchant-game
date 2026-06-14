import type { SwordData } from '../data/types'
import { weightedIndex } from '../lib/weightedPick'
import { countOf } from './inventory'
import type { ConsumedMaterials, EnhanceResult, ItemStack } from './types'

// 파괴보호장치 아이템 itemId 규약(게임 도메인 items 인벤토리와 동일).
export const PROTECTION_TICKET_ID = 'protection_ticket'

// 강화기 입력: 강화할 검 + 제공 재료(골드/아이템) + 파괴보호장치 사용 여부.
// 엔진은 supply 를 변경하지 않는다 — 소모분은 결과(consumed)로 돌려주고 호출자가 적용한다.
export type EnhanceInput = {
  sword: SwordData
  supply: { gold: number; items: readonly ItemStack[] }
  useProtection?: boolean
}

// 강화 확률 엔진.
// 순수(DataManager 비의존 — 검 정의를 입력으로 받음)하며, 확률 판정용 rng 를
// 주입할 수 있어 테스트에서 결정적으로 동작시킬 수 있다.
export class Enhancer {
  private readonly rng: () => number

  constructor(rng: () => number = Math.random) {
    this.rng = rng
  }

  // 전제조건 검증. 통과하면 null, 실패하면 사유(영어 메시지)를 반환한다.
  // enhance()의 throw 판정과 canEnhance()가 이 로직을 공유한다.
  private validate(input: EnhanceInput): string | null {
    const { sword, supply, useProtection } = input

    if (sword.enchantCost === null || sword.successRate === null)
      return `Cannot enhance a terminal sword (level ${sword.level})`
    // 강화 가능한 검은 성공 시 되는 검(nextId)을 반드시 가진다. 없으면 데이터 오류.
    if (sword.nextId === null)
      return `Enhanceable sword is missing nextId (data error): ${sword.id}`

    const cost = sword.enchantCost
    if (cost.kind === 'gold' && supply.gold < cost.amount)
      return `Insufficient gold: need ${cost.amount}, have ${supply.gold}`
    if (cost.kind === 'item' && countOf(supply.items, cost.itemId) < cost.count)
      return `Insufficient material: need ${cost.count} x ${cost.itemId}, have ${countOf(supply.items, cost.itemId)}`

    if (useProtection) {
      const pt = sword.protectionTickets
      // 'disabled'거나 0('-' = 해당 단계 방지 불가)이면 방지 사용 불가.
      if (pt === 'disabled' || pt === 0)
        return `Protection is not available at this stage (level ${sword.level})`
      if (countOf(supply.items, PROTECTION_TICKET_ID) < pt)
        return `Insufficient protection tickets: need ${pt}, have ${countOf(supply.items, PROTECTION_TICKET_ID)}`
    }

    return null
  }

  // 강화 가능 여부(전제조건 충족). UI 버튼 게이팅 등에서 사용.
  canEnhance(input: EnhanceInput): boolean {
    return this.validate(input) === null
  }

  // 강화 1회 시도. 전제조건 미충족 시 throw, 충족 시 확률 판정 결과를 반환한다.
  enhance(input: EnhanceInput): EnhanceResult {
    const reason = this.validate(input)
    if (reason !== null) throw new Error(reason)

    const { sword, useProtection } = input
    // validate 통과 → enchantCost / successRate / nextId 는 non-null 임이 보장된다.
    const cost = sword.enchantCost!
    const rate = sword.successRate!
    const fromId = sword.id

    const costGold = cost.kind === 'gold' ? cost.amount : 0
    const costItems: ItemStack[] =
      cost.kind === 'item' ? [{ itemId: cost.itemId, count: cost.count }] : []
    const baseConsumed: ConsumedMaterials = { gold: costGold, items: costItems }

    // 확률 판정: 시도당 정확히 rng() 1회.
    const success = this.rng() < rate
    if (success) {
      return {
        outcome: 'success',
        fromId,
        toId: sword.nextId!, // validate 통과 → 강화 가능한 검은 다음 검 id 보장
        consumed: baseConsumed,
        drops: [],
      }
    }

    // 실패. 우선순위: 파괴보호장치(사용 시 검 보존, 파괴보호장치만 추가 소모) > 헛방/파괴 가중 추첨.
    if (useProtection === true) {
      const used = sword.protectionTickets as number // validate 가 number>0 보장
      return {
        outcome: 'protected',
        fromId,
        toId: fromId, // 같은 검 유지
        consumed: {
          gold: costGold,
          items: [...costItems, { itemId: PROTECTION_TICKET_ID, count: used }],
        },
        protectionUsed: used,
        drops: [],
      }
    }

    // 파괴보호 미사용 실패 → 헛방(whiff, 파괴 없는 실패) vs 파괴를 weight 로 추첨한다.
    // 한쪽 weight 가 0 이면 결과가 정해져 추첨이 불필요하다 → rng 를 소비하지 않는다
    // (성공률 판정의 rng 소비 횟수 불변 — 통계 검증의 결정성 보호).
    const whiffW = sword.whiffWeight
    const destroyW = sword.destroyWeight
    const isWhiff =
      whiffW > 0 && destroyW > 0
        ? weightedIndex([whiffW, destroyW], (w) => w, this.rng) === 0
        : whiffW > 0
    if (isWhiff) {
      return {
        outcome: 'whiff',
        fromId,
        toId: fromId, // 검 보존(파괴 없음)
        consumed: baseConsumed, // 강화 비용만 소모(검은 살아남음)
        drops: [], // 파괴가 아니므로 드랍 없음
      }
    }

    const drops: ItemStack[] = sword.dropOnFail ? [{ ...sword.dropOnFail }] : []
    return {
      outcome: 'destroyed',
      fromId,
      toId: null,
      consumed: baseConsumed,
      drops,
    }
  }
}
