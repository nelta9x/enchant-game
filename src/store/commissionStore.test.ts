import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { createCommissionStore } from './commissionStore'
import { useGameStore } from './gameStore'
import { dataManager } from '../data/DataManager'
import type { CommissionConfig, GoldBucket, Material } from '../data/types'

// 골드 보상 Material 에서 금액 추출(본 픽스처는 전부 골드 의뢰 — 아니면 0 으로 단언 실패 유도).
const goldOf = (reward: Material): number =>
  reward.kind === 'gold' ? reward.amount : 0
// 아이템 비용 의뢰의 납품 itemId 추출(본 픽스처는 골드 비용을 쓰지 않음 — 골드면 빈 문자열로 단언 실패 유도).
const costItemId = (cost: Material): string =>
  cost.kind === 'item' ? cost.itemId : ''
// active 의 id 목록(세션 동일성 비교용).
const idsOf = (store: ReturnType<typeof createCommissionStore>): number[] =>
  store.getState().active.map((c) => c.id)

// 셸(강화 시도 신호+데이터) 통합 테스트. 풀 basePrice 는 실제 데이터(DataManager)를 쓰되, 설정은 픽스처를
// 주입해 production 값과 독립시킨다. 출제 풀은 보유 골드가 고르므로(currentBucket), 테스트는 gold 를 세팅해
// 어느 버킷이 뽑히는지 제어한다. 갱신 카운터는 결정적이도록 refreshWeights 를 단일 후보(value 3)로 둔다.
beforeAll(() => {
  dataManager.load()
})

beforeEach(() => {
  // 기본은 버킷 A([0, 500000)) 구간. 개별 테스트가 필요하면 gold 를 덮어 다른 버킷을 고른다.
  // maxLevelReached 를 0 으로 리셋해 잠금 게이트 테스트의 출발 바닥을 고정한다(전역 store 공유 → 이전 테스트
  // 잔존값 방지). 본 파일의 CONFIG/BARTER 픽스처는 unlockAtLevel:0 이라 나머지 테스트는 값과 무관하게 활성.
  useGameStore.setState({ gold: 1000, maxLevelReached: 0 })
})

// 결정적 버킷 헬퍼: 갱신 후보 단일(value 3), incentive 1.0·additive 0 고정(reward = basePrice).
function bucket(
  minGold: number,
  maxGold: number | null,
  items: { itemId: string; weight: number }[],
): GoldBucket {
  return {
    minGold,
    maxGold,
    // 아이템별 incentive 1.0·additive 0 고정 → reward = basePrice(결정적). 골드 보상·수량 1.
    items: items.map((it) => ({
      ...it,
      requiredCount: 1,
      rewardKind: 'gold' as const,
      incentiveMin: 1.0,
      incentiveMax: 1.0,
      additiveMin: 0,
      additiveMax: 0,
    })),
    refreshWeights: [{ value: 3, weight: 1 }],
  }
}

// 버킷 A([0,500000)): 검 3~5 / 버킷 B([500000,1000000)): 검 4~6 / 버킷 C([1000000,∞)): 재료 iron_scrap.
// 보유 골드 구간이 [0,∞) 를 연속으로 덮는다(로더 불변 미러).
const CONFIG: CommissionConfig = {
  maxCommissions: 3,
  // unlockAtLevel:0 = 항상 활성(레거시 동작 유지). 잠금 게이트는 별도 describe 에서 nonzero 로 검증한다.
  unlockAtLevel: 0,
  buckets: [
    bucket(0, 500_000, [
      { itemId: 'sword_3', weight: 1 },
      { itemId: 'sword_4', weight: 1 },
      { itemId: 'sword_5', weight: 1 },
    ]),
    bucket(500_000, 1_000_000, [
      { itemId: 'sword_4', weight: 1 },
      { itemId: 'sword_5', weight: 1 },
      { itemId: 'sword_6', weight: 1 },
    ]),
    bucket(1_000_000, null, [{ itemId: 'iron_scrap', weight: 1 }]),
  ],
}

describe('commissionStore — 제안 세션 모델', () => {
  it('start 는 첫 세션(서로 다른 제안 maxCommissions 개)을 즉시 한 번에 출제한다', () => {
    const store = createCommissionStore({ rng: () => 0.5, config: CONFIG })
    store.getState().start()
    expect(store.getState().active).toHaveLength(3) // 세션 3개 한 번에
    // 버킷 A(검 단계 3,4,5)에서만 출제 + 세션 내 중복 없음.
    const ids = store.getState().active.map((c) => costItemId(c.cost))
    for (const id of ids)
      expect(['sword_3', 'sword_4', 'sword_5']).toContain(id)
    expect(new Set(ids).size).toBe(3) // 서로 다른 제안
    // 갱신 카운터가 세팅됐고 가득 차 있다.
    expect(store.getState().attemptsTotal).toBeGreaterThan(0)
    expect(store.getState().attemptsRemaining).toBe(
      store.getState().attemptsTotal,
    )
    store.getState().stop()
  })

  it('강화 시도 1회로는 세션이 갱신되지 않고 카운터만 줄어든다', () => {
    const store = createCommissionStore({ rng: () => 0.5, config: CONFIG })
    store.getState().start()
    const before = idsOf(store)
    const total = store.getState().attemptsTotal
    store.getState().notifyAttempt()
    expect(idsOf(store)).toEqual(before) // 같은 세션
    expect(store.getState().attemptsRemaining).toBe(total - 1)
    store.getState().stop()
  })

  it('카운터가 0이 되는 시도에 세션 전체가 새로 갱신된다(새 ids)', () => {
    const store = createCommissionStore({ rng: () => 0.5, config: CONFIG })
    store.getState().start()
    const before = idsOf(store)
    const total = store.getState().attemptsTotal
    for (let i = 0; i < total; i += 1) store.getState().notifyAttempt()
    expect(store.getState().active).toHaveLength(3)
    // 새 세션이라 직전 세션과 id 가 겹치지 않는다(단조 증가).
    for (const id of idsOf(store)) expect(before).not.toContain(id)
    expect(store.getState().attemptsRemaining).toBe(
      store.getState().attemptsTotal,
    )
    store.getState().stop()
  })

  it('제안 하나를 선택(fulfill)하면 그 카드만 사라지고 나머지·카운터는 그대로다', () => {
    const store = createCommissionStore({ rng: () => 0.5, config: CONFIG })
    store.getState().start()
    expect(store.getState().active).toHaveLength(3)
    const target = store.getState().active[0]
    const total = store.getState().attemptsTotal
    // 고른 제안의 납품 재료만 보유시킨다.
    useGameStore.setState({
      currentSwordId: null,
      items: [{ itemId: costItemId(target.cost), count: 1 }],
      gold: 0,
    })
    expect(store.getState().fulfill(target.id)).toBe(true)
    expect(store.getState().active).toHaveLength(2) // 그 카드만 제거
    expect(store.getState().active.some((c) => c.id === target.id)).toBe(false)
    expect(store.getState().attemptsRemaining).toBe(total) // 납품은 카운터 불변
    store.getState().stop()
  })

  it('stop 후에는 notifyAttempt 가 아무 동작도 하지 않는다', () => {
    const store = createCommissionStore({ rng: () => 0.5, config: CONFIG })
    store.getState().start()
    store.getState().stop()
    expect(store.getState().active).toHaveLength(0)
    store.getState().notifyAttempt() // 정지 상태 — 무동작
    expect(store.getState().active).toHaveLength(0)
  })

  it('보유 골드가 출제 버킷을 결정한다: 저골드→버킷 A, 고골드→버킷 B (헤드라인 동작)', () => {
    // 저골드(1000) → 버킷 A(검 3~5).
    useGameStore.setState({ gold: 1000 })
    const low = createCommissionStore({ rng: () => 0.5, config: CONFIG })
    low.getState().start()
    expect(low.getState().active.length).toBeGreaterThan(0)
    for (const c of low.getState().active) {
      expect(['sword_3', 'sword_4', 'sword_5']).toContain(costItemId(c.cost))
    }
    low.getState().stop()

    // 고골드(600000) → 버킷 B(검 4~6).
    useGameStore.setState({ gold: 600_000 })
    const high = createCommissionStore({ rng: () => 0.5, config: CONFIG })
    high.getState().start()
    expect(high.getState().active.length).toBeGreaterThan(0)
    for (const c of high.getState().active) {
      expect(['sword_4', 'sword_5', 'sword_6']).toContain(costItemId(c.cost)) // buckets[1]
    }
    high.getState().stop()
  })

  it('버킷 경계(500000)는 상위 버킷에 속한다: 499999→버킷 A, 500000→버킷 B (50만 미만/이상 스펙)', () => {
    // maxGold 는 미포함(gold < maxGold): 499999 는 버킷 A, 정확히 500000 은 버킷 B 로 떨어진다.
    useGameStore.setState({ gold: 499_999 })
    const below = createCommissionStore({ rng: () => 0.5, config: CONFIG })
    below.getState().start()
    for (const c of below.getState().active) {
      expect(['sword_3', 'sword_4', 'sword_5']).toContain(costItemId(c.cost)) // 버킷 A
    }
    below.getState().stop()

    useGameStore.setState({ gold: 500_000 })
    const atBoundary = createCommissionStore({ rng: () => 0.5, config: CONFIG })
    atBoundary.getState().start()
    for (const c of atBoundary.getState().active) {
      expect(['sword_4', 'sword_5', 'sword_6']).toContain(costItemId(c.cost)) // 버킷 B
    }
    atBoundary.getState().stop()
  })

  it('재료(검이 아닌) 아이템도 의뢰로 출제된다(최상위 골드 버킷)', () => {
    useGameStore.setState({ gold: 1_500_000 }) // 버킷 C = iron_scrap 전용
    const store = createCommissionStore({ rng: () => 0.5, config: CONFIG })
    store.getState().start()
    expect(store.getState().active.length).toBeGreaterThan(0)
    for (const c of store.getState().active) {
      expect(costItemId(c.cost)).toBe('iron_scrap')
      expect(goldOf(c.reward)).toBeGreaterThan(0) // basePrice(items.json) 기반 골드 보상
    }
    store.getState().stop()
  })

  it('fulfill: gameStore 가 거절(false)하면 complete 되지 않는다', () => {
    useGameStore.setState({
      currentSwordId: null,
      items: [],
      gold: 0,
    })
    const store = createCommissionStore({ rng: () => 0.5, config: CONFIG })
    store.getState().start()
    const target = store.getState().active[0]
    expect(store.getState().fulfill(target.id)).toBe(false)
    expect(store.getState().active.some((c) => c.id === target.id)).toBe(true)
    expect(useGameStore.getState().gold).toBe(0)
    store.getState().stop()
  })

  it('fulfill: 요구 검 보유 시 골드 지급 + 그 카드만 제거', () => {
    const store = createCommissionStore({ rng: () => 0.5, config: CONFIG })
    store.getState().start()
    const target = store.getState().active[0]
    useGameStore.setState({
      currentSwordId: null,
      items: [{ itemId: costItemId(target.cost), count: 1 }],
      gold: 0,
    })
    expect(store.getState().fulfill(target.id)).toBe(true)
    expect(useGameStore.getState().gold).toBe(goldOf(target.reward))
    expect(store.getState().active).toHaveLength(2) // 그 카드만 제거(나머지 유지)
    store.getState().stop()
  })

  it('fulfill: 재료 의뢰는 인벤토리에서 차감하고 장착 검은 건드리지 않는다', () => {
    useGameStore.setState({ gold: 1_500_000 }) // 버킷 C → iron_scrap 의뢰
    const store = createCommissionStore({ rng: () => 0.5, config: CONFIG })
    store.getState().start()
    const target = store.getState().active[0]
    expect(costItemId(target.cost)).toBe('iron_scrap')
    useGameStore.setState({
      currentSwordId: 'sword_1',
      items: [{ itemId: 'iron_scrap', count: 3 }],
      gold: 1_500_000,
    })
    expect(store.getState().fulfill(target.id)).toBe(true)
    expect(useGameStore.getState().gold).toBe(1_500_000 + goldOf(target.reward))
    expect(
      useGameStore.getState().items.find((i) => i.itemId === 'iron_scrap')
        ?.count,
    ).toBe(2) // 1개 차감
    expect(useGameStore.getState().currentSwordId).toBe('sword_1') // 장착검 불변
    store.getState().stop()
  })

  it('발급된 의뢰의 보상은 발급 시점 freeze: 이후 골드가 바뀌어 버킷이 달라져도 보상은 그대로다', () => {
    // 저골드(버킷 A)에서 발급 → 발급 시점 reward freeze.
    useGameStore.setState({ gold: 1000 })
    const store = createCommissionStore({ rng: () => 0.5, config: CONFIG })
    store.getState().start()
    const target = store.getState().active[0]
    const frozenReward = goldOf(target.reward)
    // 발급 후 고골드로 올려도(버킷 B) 이미 떠 있는 의뢰의 보상은 freeze 값을 유지한다.
    useGameStore.setState({
      currentSwordId: null,
      items: [{ itemId: costItemId(target.cost), count: 1 }],
      gold: 600_000,
    })
    expect(store.getState().fulfill(target.id)).toBe(true)
    expect(useGameStore.getState().gold).toBe(600_000 + frozenReward)
    store.getState().stop()
  })

  // 물물교환 의뢰 전용 설정: 형광물질 2개 납품 → sword_12 1개 지급(아이템 보상).
  const BARTER: CommissionConfig = {
    maxCommissions: 1,
    unlockAtLevel: 0,
    buckets: [
      {
        minGold: 0,
        maxGold: null,
        items: [
          {
            itemId: 'faded_fluorescent',
            requiredCount: 2,
            weight: 1,
            rewardKind: 'item',
            rewardItemId: 'sword_12',
            rewardItemCount: 1,
          },
        ],
        refreshWeights: [{ value: 3, weight: 1 }],
      },
    ],
  }

  it('fulfill: 물물교환 — 재료 requiredCount 개 소모하고 아이템 보상을 지급한다', () => {
    useGameStore.setState({
      gold: 777,
      currentSwordId: 'sword_1',
      items: [{ itemId: 'faded_fluorescent', count: 3 }],
    })
    const store = createCommissionStore({ rng: () => 0.5, config: BARTER })
    store.getState().start()
    const target = store.getState().active[0]
    expect(costItemId(target.cost)).toBe('faded_fluorescent')
    expect(target.cost).toEqual({
      kind: 'item',
      itemId: 'faded_fluorescent',
      count: 2,
    })
    expect(target.reward).toEqual({
      kind: 'item',
      itemId: 'sword_12',
      count: 1,
    })
    expect(store.getState().fulfill(target.id)).toBe(true)
    const items = useGameStore.getState().items
    expect(items.find((i) => i.itemId === 'faded_fluorescent')?.count).toBe(1) // 3→1 (2 소모)
    expect(items.find((i) => i.itemId === 'sword_12')?.count).toBe(1) // 검 1개 지급
    expect(useGameStore.getState().gold).toBe(777) // 골드 불변(아이템 보상)
    expect(useGameStore.getState().currentSwordId).toBe('sword_1') // 장착검 불변
    store.getState().stop()
  })

  it('fulfill: 물물교환 — 재료가 requiredCount 미만이면 납품 불가(false)', () => {
    useGameStore.setState({
      gold: 0,
      currentSwordId: 'sword_1',
      items: [{ itemId: 'faded_fluorescent', count: 1 }], // 2개 필요한데 1개뿐
    })
    const store = createCommissionStore({ rng: () => 0.5, config: BARTER })
    store.getState().start()
    const target = store.getState().active[0]
    expect(store.getState().fulfill(target.id)).toBe(false)
    expect(store.getState().active.some((c) => c.id === target.id)).toBe(true)
    expect(
      useGameStore.getState().items.find((i) => i.itemId === 'sword_12'),
    ).toBeUndefined() // 미지급
    store.getState().stop()
  })
})

// 제안 활성화 잠금(unlockAtLevel) — 도달 강화 레벨(maxLevelReached)이 임계 미만이면 제안이 전혀 출제되지 않고,
// 임계에 도달한 순간(다음 강화 시도)부터 첫 세션이 부트스트랩된다. maxLevelReached 는 단조라 한 번 해제되면 유지된다.
describe('commissionStore — 제안 활성화 잠금(unlockAtLevel)', () => {
  // CONFIG(버킷 A) 그대로 + 활성화 임계만 10 으로. 잠금/해제는 maxLevelReached 로 제어한다.
  const GATED: CommissionConfig = { ...CONFIG, unlockAtLevel: 10 }

  it('도달 레벨이 임계 미만이면 start 가 제안을 출제하지 않는다', () => {
    useGameStore.setState({ maxLevelReached: 9 }) // 임계(10) 미만
    const store = createCommissionStore({ rng: () => 0.5, config: GATED })
    store.getState().start()
    expect(store.getState().active).toHaveLength(0)
    store.getState().stop()
  })

  it('잠금 중에는 강화 시도를 여러 번 알려도 계속 비어 있다', () => {
    useGameStore.setState({ maxLevelReached: 0 })
    const store = createCommissionStore({ rng: () => 0.5, config: GATED })
    store.getState().start()
    for (let i = 0; i < 5; i += 1) store.getState().notifyAttempt()
    expect(store.getState().active).toHaveLength(0)
    store.getState().stop()
  })

  it('도달 레벨이 임계에 닿으면 다음 강화 시도에서 첫 세션을 부트스트랩한다(차감 없음)', () => {
    useGameStore.setState({ maxLevelReached: 0 })
    const store = createCommissionStore({ rng: () => 0.5, config: GATED })
    store.getState().start()
    expect(store.getState().active).toHaveLength(0) // 아직 잠금
    // 임계 도달 → 다음 강화 시도에서 해제·부트스트랩.
    useGameStore.setState({ maxLevelReached: 10 })
    store.getState().notifyAttempt()
    expect(store.getState().active).toHaveLength(3) // 서로 다른 제안 3개 한 번에
    // 해제 교차 시도는 첫 세션을 만들 뿐 카운터를 소비하지 않는다(가득 찬 상태).
    expect(store.getState().attemptsRemaining).toBe(
      store.getState().attemptsTotal,
    )
    store.getState().stop()
  })

  it('start 시점에 이미 임계 이상이면 즉시 첫 세션을 출제한다', () => {
    useGameStore.setState({ maxLevelReached: 12 }) // 임계 초과
    const store = createCommissionStore({ rng: () => 0.5, config: GATED })
    store.getState().start()
    expect(store.getState().active).toHaveLength(3)
    store.getState().stop()
  })

  it('잠금 중 start→stop→start(StrictMode 이중 마운트) 후 해제되면 정상 부트스트랩한다', () => {
    useGameStore.setState({ maxLevelReached: 0 }) // 잠금
    const store = createCommissionStore({ rng: () => 0.5, config: GATED })
    // 마운트→언마운트→재마운트(App effect 의 start/stop/start 와 동일). 래치(bootstrapped/started)가
    // stop 에서 리셋되어 재start 후에도 잠금 상태가 유지되어야 한다(빈 상태).
    store.getState().start()
    store.getState().stop()
    store.getState().start()
    expect(store.getState().active).toHaveLength(0)
    // 이후 임계 도달 → 다음 강화 시도에서 1회 부트스트랩(중복 출제 없음).
    useGameStore.setState({ maxLevelReached: 10 })
    store.getState().notifyAttempt()
    expect(store.getState().active).toHaveLength(3)
    store.getState().stop()
  })
})
