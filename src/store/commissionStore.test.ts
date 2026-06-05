import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { createCommissionStore } from './commissionStore'
import { useGameStore } from './gameStore'
import { dataManager } from '../data/DataManager'
import type { CommissionConfig } from '../data/types'

// 셸(타이머+데이터) 통합 테스트. 풀은 실제 검 데이터(DataManager)를 쓰되, 설정은 픽스처를 주입해
// production 값과 독립시킨다. 타이밍은 결정적이도록 spawnInterval·duration 의 min==max 로 둔다.
beforeAll(() => {
  dataManager.load()
})

beforeEach(() => {
  vi.useFakeTimers()
  useGameStore.setState({ commissionLevel: 1, commissionXp: 0 }) // 레벨 1 → 풀 = 검 단계 3,4,5
})
afterEach(() => vi.useRealTimers())

// 간격 10s, 지속 30s — 0·10·20s 에 1개씩 등장해 20s 에 꽉 차고(정지), 30s 에 첫 의뢰 만료.
const CONFIG: CommissionConfig = {
  maxCommissions: 3,
  durationMinMs: 30_000,
  durationMaxMs: 30_000,
  incentiveMin: 0.1,
  incentiveMax: 2.0,
  spawnIntervalMinMs: 10_000,
  spawnIntervalMaxMs: 10_000,
  tickIntervalMs: 250,
  xpReward: 34,
  xpPenalty: 20,
  levels: [
    { swordLevels: [3, 4, 5], xpToNext: 100 },
    { swordLevels: [4, 5, 6], xpToNext: 100 },
  ],
}

describe('commissionStore — 단일 스폰 타이머', () => {
  it('start 는 1개만 즉시 등장, 이후 간격마다 1개씩 채워 꽉 차면 멈춘다', () => {
    const store = createCommissionStore({ rng: () => 0.5, config: CONFIG })
    store.getState().start()
    expect(store.getState().active).toHaveLength(1) // 즉시 1개
    // 레벨 1 풀(검 단계 3,4,5)에서만 출제.
    for (const c of store.getState().active) {
      expect(['sword_3', 'sword_4', 'sword_5']).toContain(c.swordId)
    }
    vi.advanceTimersByTime(10_000)
    expect(store.getState().active).toHaveLength(2)
    vi.advanceTimersByTime(10_000)
    expect(store.getState().active).toHaveLength(3)
    expect(store.getState().nextSpawnAt).toBeNull() // 꽉 차서 정지
    store.getState().stop()
  })

  it('stop 후 tick 이 더 이상 돌지 않는다', () => {
    const store = createCommissionStore({ rng: () => 0.5, config: CONFIG })
    store.getState().start()
    store.getState().stop()
    expect(store.getState().active).toHaveLength(0)
    expect(store.getState().nextSpawnAt).toBeNull()
    vi.advanceTimersByTime(CONFIG.tickIntervalMs * 8)
    expect(store.getState().active).toHaveLength(0) // 타이머 해제 — 재생성 없음
  })

  it('의뢰 레벨이 오르면 상위 검 단계 풀에서 출제된다(헤드라인 동작)', () => {
    useGameStore.setState({ commissionLevel: 2, commissionXp: 0 })
    const store = createCommissionStore({ rng: () => 0.5, config: CONFIG })
    store.getState().start()
    expect(store.getState().active.length).toBeGreaterThan(0)
    for (const c of store.getState().active) {
      expect(['sword_4', 'sword_5', 'sword_6']).toContain(c.swordId) // CONFIG.levels[1]
    }
    store.getState().stop()
  })

  it('fulfill: gameStore 가 거절(false)하면 complete·경험치 변동 없음', () => {
    useGameStore.setState({ currentSwordId: null, items: [], gold: 0, commissionXp: 0 })
    const store = createCommissionStore({ rng: () => 0.5, config: CONFIG })
    store.getState().start()
    const target = store.getState().active[0]
    expect(store.getState().fulfill(target.id)).toBe(false)
    expect(store.getState().active.some((c) => c.id === target.id)).toBe(true)
    expect(useGameStore.getState().gold).toBe(0)
    expect(useGameStore.getState().commissionXp).toBe(0)
    store.getState().stop()
  })

  it('fulfill: 요구 검 보유 시 골드 지급 + active 제거 + 경험치 획득', () => {
    const store = createCommissionStore({ rng: () => 0.5, config: CONFIG })
    store.getState().start()
    const target = store.getState().active[0]
    useGameStore.setState({
      currentSwordId: null,
      items: [{ itemId: target.swordId, count: 1 }],
      gold: 0,
      commissionLevel: 1,
      commissionXp: 0,
    })
    expect(store.getState().fulfill(target.id)).toBe(true)
    expect(useGameStore.getState().gold).toBe(target.reward)
    expect(useGameStore.getState().commissionXp).toBe(CONFIG.xpReward) // +reward
    expect(store.getState().active.some((c) => c.id === target.id)).toBe(false)
    store.getState().stop()
  })

  it('만료(미달성) 시 만료 건수만큼 경험치 차감', () => {
    useGameStore.setState({ commissionLevel: 1, commissionXp: 50 })
    const store = createCommissionStore({ rng: () => 0.5, config: CONFIG })
    store.getState().start() // c1 @0 (exp 30000)
    // 31s 로 전진 → c1(첫 의뢰)만 만료(c2@10s exp40s, c3@20s exp50s 는 아직).
    vi.advanceTimersByTime(31_000)
    expect(useGameStore.getState().commissionXp).toBe(50 - CONFIG.xpPenalty) // 1건 만료 → -20
    store.getState().stop()
  })
})
