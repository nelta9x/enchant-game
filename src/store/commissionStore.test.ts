import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { createCommissionStore } from './commissionStore'
import { useGameStore } from './gameStore'
import { dataManager } from '../data/DataManager'
import type { CommissionConfig } from '../data/types'

// 셸(타이머+데이터) 통합 테스트 — 순수 코어(commissionQueue.test)와 달리, setInterval 이 실제로
// tick 을 돌려 생성/만료가 시간축에서 도는지와, fulfill 이 gameStore 수락 여부에 따라 complete 하는지 본다.
// 풀은 실제 검 데이터(DataManager)를 쓰되, 설정은 픽스처를 주입해 production 값(minLevel=8 등)과 독립시킨다.
beforeAll(() => {
  dataManager.load()
})

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

// 테스트 설정 픽스처 — minLevel=0 으로 둬 진행도 sword_5 수준에서도 풀이 비지 않는다.
const CONFIG: CommissionConfig = {
  maxCommissions: 3,
  durationMinMs: 30_000,
  durationMaxMs: 60_000,
  incentiveMin: 0.1,
  incentiveMax: 2.0,
  respawnDelayMs: 10_000,
  tickIntervalMs: 250,
  minLevel: 0,
  poolLevelBelow: 5,
  poolLevelAbove: 2,
}

describe('commissionStore — 타이머 셸 생명주기', () => {
  it('start 시 즉시 maxCommissions 개 의뢰가 채워진다(진행도 근처 풀)', () => {
    // 플레이어 진행도를 sword_5 수준으로 → 풀이 비지 않도록.
    useGameStore.setState({ currentSwordId: 'sword_5', items: [] })
    const store = createCommissionStore({ rng: () => 0.5, config: CONFIG })
    store.getState().start()
    expect(store.getState().active).toHaveLength(CONFIG.maxCommissions)
    expect(store.getState().pending).toHaveLength(0)
    store.getState().stop()
  })

  it('stop 후 tick 이 더 이상 돌지 않는다', () => {
    useGameStore.setState({ currentSwordId: 'sword_5', items: [] })
    const store = createCommissionStore({ rng: () => 0.5, config: CONFIG })
    store.getState().start()
    store.getState().stop()
    expect(store.getState().active).toHaveLength(0) // stop 이 큐를 비움
    vi.advanceTimersByTime(CONFIG.tickIntervalMs * 4)
    expect(store.getState().active).toHaveLength(0) // 타이머 해제됨 — 재생성 없음
  })

  it('만료된 의뢰는 시간이 지나면 재생성된다', () => {
    useGameStore.setState({ currentSwordId: 'sword_5', items: [] })
    const store = createCommissionStore({ rng: () => 0.5, config: CONFIG })
    store.getState().start()
    const firstIds = store.getState().active.map((c) => c.id)
    // 만료(최대 60s) + 재생성 딜레이(10s)를 모두 지나도록 크게 전진.
    vi.advanceTimersByTime(80_000)
    expect(store.getState().active).toHaveLength(CONFIG.maxCommissions)
    // 새 id 가 발급되어 이전 의뢰와 다르다.
    const laterIds = store.getState().active.map((c) => c.id)
    expect(laterIds.some((id) => !firstIds.includes(id))).toBe(true)
    store.getState().stop()
  })

  it('fulfill: gameStore 가 거절(false)하면 complete 하지 않는다', () => {
    // 플레이어가 요구 검을 전혀 보유하지 않도록 비운다.
    useGameStore.setState({ currentSwordId: null, items: [], gold: 0 })
    const store = createCommissionStore({ rng: () => 0.5, config: CONFIG })
    store.getState().start()
    const target = store.getState().active[0]
    const before = store.getState().active.length
    expect(store.getState().fulfill(target.id)).toBe(false)
    expect(store.getState().active).toHaveLength(before) // 제거 안 됨
    expect(useGameStore.getState().gold).toBe(0)
    store.getState().stop()
  })

  it('fulfill: 요구 검 보유 시 골드 지급 + active 에서 제거', () => {
    const store = createCommissionStore({ rng: () => 0.5, config: CONFIG })
    store.getState().start()
    const target = store.getState().active[0]
    // 플레이어에게 요구 검을 가방에 쥐여 준다.
    useGameStore.setState({
      currentSwordId: null,
      items: [{ itemId: target.swordId, count: 1 }],
      gold: 0,
    })
    expect(store.getState().fulfill(target.id)).toBe(true)
    expect(useGameStore.getState().gold).toBe(target.reward)
    expect(store.getState().active.some((c) => c.id === target.id)).toBe(false)
    expect(store.getState().active.length + store.getState().pending.length).toBe(
      CONFIG.maxCommissions,
    )
    store.getState().stop()
  })
})
