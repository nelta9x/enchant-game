import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
} from 'vitest'
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

// 셸(타이머+데이터) 통합 테스트. 풀 basePrice 는 실제 데이터(DataManager)를 쓰되, 설정은 픽스처를 주입해
// production 값과 독립시킨다. 출제 풀은 보유 골드가 고르므로(currentBucket), 테스트는 gold 를 세팅해
// 어느 버킷이 뽑히는지 제어한다. 타이밍은 결정적이도록 spawnInterval·duration 의 min==max 로 둔다.
beforeAll(() => {
  dataManager.load()
})

beforeEach(() => {
  vi.useFakeTimers()
  // 기본은 버킷 A([0, 500000)) 구간. 개별 테스트가 필요하면 gold 를 덮어 다른 버킷을 고른다.
  useGameStore.setState({ gold: 1000 })
})
afterEach(() => vi.useRealTimers())

// 결정적 버킷 헬퍼: 간격 10s, 지속 30s, incentive 1.0·additive 0 고정(reward = basePrice).
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
    durationMinMs: 30_000,
    durationMaxMs: 30_000,
    spawnIntervalMinMs: 10_000,
    spawnIntervalMaxMs: 10_000,
  }
}

// 버킷 A([0,500000)): 검 3~5 / 버킷 B([500000,1000000)): 검 4~6 / 버킷 C([1000000,∞)): 재료 iron_scrap.
// 보유 골드 구간이 [0,∞) 를 연속으로 덮는다(로더 불변 미러).
const CONFIG: CommissionConfig = {
  maxCommissions: 3,
  tickIntervalMs: 250,
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
  it('start 는 첫 세션(서로 다른 제안 maxCommissions 개)을 즉시 한 번에 출제하고 타이머를 멈춘다', () => {
    const store = createCommissionStore({ rng: () => 0.5, config: CONFIG })
    store.getState().start()
    expect(store.getState().active).toHaveLength(3) // 세션 3개 한 번에
    // 버킷 A(검 단계 3,4,5)에서만 출제 + 세션 내 중복 없음.
    const ids = store.getState().active.map((c) => costItemId(c.cost))
    for (const id of ids) expect(['sword_3', 'sword_4', 'sword_5']).toContain(id)
    expect(new Set(ids).size).toBe(3) // 서로 다른 제안
    expect(store.getState().nextSpawnAt).toBeNull() // 세션이 떠 있음 → 정지
    // 세션이 떠 있는 동안은 시간이 흘러도 보충하지 않는다(트리클 아님).
    vi.advanceTimersByTime(10_000)
    expect(store.getState().active).toHaveLength(3)
    store.getState().stop()
  })

  it('제안 하나를 선택(fulfill)하면 나머지 제안까지 모두 사라지고 세션이 끝난다', () => {
    const store = createCommissionStore({ rng: () => 0.5, config: CONFIG })
    store.getState().start()
    expect(store.getState().active).toHaveLength(3)
    const target = store.getState().active[0]
    // 고른 제안의 납품 재료만 보유시킨다.
    useGameStore.setState({
      currentSwordId: null,
      items: [{ itemId: costItemId(target.cost), count: 1 }],
      gold: 0,
    })
    expect(store.getState().fulfill(target.id)).toBe(true)
    expect(store.getState().active).toHaveLength(0) // 세션 전체 종료(나머지도 사라짐)
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

  it('fulfill: 요구 검 보유 시 골드 지급 + active 제거', () => {
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
    expect(store.getState().active).toHaveLength(0) // 세션 전체 종료
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
    tickIntervalMs: 250,
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
        durationMinMs: 30_000,
        durationMaxMs: 30_000,
        spawnIntervalMinMs: 10_000,
        spawnIntervalMaxMs: 10_000,
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
    expect(target.cost).toEqual({ kind: 'item', itemId: 'faded_fluorescent', count: 2 })
    expect(target.reward).toEqual({ kind: 'item', itemId: 'sword_12', count: 1 })
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
