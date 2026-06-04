import { describe, it, expect } from 'vitest'
import { destructionTargetOf } from './destruction'
import type { EnhanceResult } from '../game/types'

const consumed = { gold: 0, items: [] }

describe('destructionTargetOf — 연출 대상 판정(순수 로직)', () => {
  it('destroyed 결과면 파괴된 검(fromId)을 대상으로 반환한다', () => {
    const result: EnhanceResult = {
      outcome: 'destroyed',
      fromId: 'sword_7',
      toId: null,
      consumed,
      drops: [],
    }
    expect(destructionTargetOf(result)).toEqual({ id: 'sword_7' })
  })

  // 핵심 결정: 스토어는 파괴 즉시 검을 +0 으로 교체하지만(gameStore.test 참조),
  // 연출 대상은 새 검이 아니라 "터진 검(fromId)"이어야 한다.
  it('새 검(+0)이 아니라 파괴된 검(fromId)을 가리킨다', () => {
    const result: EnhanceResult = {
      outcome: 'destroyed',
      fromId: 'sword_14',
      toId: null,
      consumed,
      drops: [{ itemId: 'iron_scrap', count: 10 }],
    }
    expect(destructionTargetOf(result)?.id).toBe('sword_14')
  })

  it('success 결과면 null(파괴 연출 없음)', () => {
    const result: EnhanceResult = {
      outcome: 'success',
      fromId: 'sword_3',
      toId: 'sword_4',
      consumed,
      drops: [],
    }
    expect(destructionTargetOf(result)).toBeNull()
  })

  it('protected 결과면 null(방지 = 파괴되지 않음)', () => {
    const result: EnhanceResult = {
      outcome: 'protected',
      fromId: 'sword_14',
      toId: 'sword_14',
      consumed,
      protectionUsed: 3,
      drops: [],
    }
    expect(destructionTargetOf(result)).toBeNull()
  })

  it('result 가 null 이면 null', () => {
    expect(destructionTargetOf(null)).toBeNull()
  })
})
