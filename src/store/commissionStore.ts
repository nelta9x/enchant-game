import { create } from 'zustand'
import { dataManager } from '../data/DataManager'
import type { CommissionConfig } from '../data/types'
import {
  commissionPool,
  complete,
  emptyCommissionQueue,
  tick,
  type CommissionQueueState,
} from './commissionQueue'
import { playerMaxLevel, useGameStore } from './gameStore'

// 의뢰(Commission) 시스템의 얇은 셸 — 순수 전이 코어(commissionQueue)에 "시간"과 "데이터"만 입힌다.
// 생성/만료/재생성 규칙은 전부 코어에 있고, 여기서는 setInterval 로 주기적으로 tick(Date.now()) 을 돌리고,
// 출제 풀(DataManager)·진행도(gameStore)·튜닝 설정(DataManager)을 읽어 주입한다. effectStore 와 같은 셸 패턴.
//
// 설정(config)은 DataManager.getCommissionConfig() 에서 읽는다. 단 이 호출은 반드시 load 이후여야 하므로
// (DataManager.ensureLoaded), 모듈 평가 시점에 즉시 도는 zustand 초기화에서는 읽지 않는다 — 초기 상태는
// config 없는 빈 큐로 두고, start()(App useEffect → load 이후)에서 emptyCommissionQueue 로 재초기화한다.
//
// 완료는 두 store 에 걸친 트랜잭션이다: PlayerState 변경(검 소모+골드)은 gameStore 가 소유하고,
// 의뢰 생명주기(active 에서 제거 + 재생성 예약)는 여기가 소유한다 — gameStore 가 완료를 수락(true)할
// 때만 complete 를 적용해 두 store 의 일관성을 보장한다.

type CommissionActions = {
  // 주기 tick 시작(App 마운트 시 1회). 이미 돌고 있으면 무시. config 로 큐를 초기화한 뒤 첫 tick 을 돈다.
  start: () => void
  // tick 정지 + 큐 비우기(App 언마운트 시).
  stop: () => void
  // 내부: 시간 전진 1회 — 설정·풀·진행도를 읽어 tick 에 주입.
  _tick: () => void
  // 의뢰 완료 시도: gameStore 가 검 소모+보상을 수락하면 complete 적용 후 true. 미보유면 false(무변화).
  fulfill: (id: number) => boolean
}

export type CommissionStore = CommissionQueueState & CommissionActions

type CreateOpts = {
  // 생성 rng(테스트에서 결정적 주입). 미지정 시 Math.random.
  rng?: () => number
  // 시각 공급원(테스트에서 가짜 타이머와 함께 주입 가능). 미지정 시 Date.now.
  now?: () => number
  // 튜닝 설정(테스트에서 production 값과 독립된 픽스처 주입). 미지정 시 DataManager 에서 읽는다(load 이후).
  config?: CommissionConfig
}

// 의뢰 store 팩토리. 기본 인스턴스(useCommissionStore)는 앱 전역 공유, 테스트는 독립 인스턴스를 만든다.
export function createCommissionStore(opts: CreateOpts = {}) {
  const rng = opts.rng ?? Math.random
  const now = opts.now ?? Date.now
  // 설정 해석: 명시 주입이 있으면 그것을, 없으면 DataManager 에서 읽는다(반드시 load 이후 — start/_tick/fulfill 안에서만 호출).
  const getConfig = (): CommissionConfig =>
    opts.config ?? dataManager.getCommissionConfig()
  // setInterval 핸들은 store 상태가 아니라 클로저에 둔다(직렬화/구독 대상 아님).
  let timer: ReturnType<typeof setInterval> | null = null

  return create<CommissionStore>((set, get) => ({
    // 초기 상태는 config 없이 빈 큐 — 실제 슬롯 수는 start()에서 config 로 초기화한다(모듈 평가 시 load 전이라 config 미접근).
    active: [],
    pending: [],
    nextId: 1,

    start: () => {
      if (timer !== null) return
      const config = getConfig()
      set(emptyCommissionQueue(now(), config.maxCommissions))
      get()._tick() // 마운트 즉시 한 번 채운다(첫 tick 까지 빈 화면 방지).
      timer = setInterval(() => get()._tick(), config.tickIntervalMs)
    },

    stop: () => {
      if (timer !== null) {
        clearInterval(timer)
        timer = null
      }
      set({ active: [], pending: [], nextId: 1 })
    },

    _tick: () => {
      const config = getConfig()
      const pool = commissionPool(
        dataManager.getSwords(),
        playerMaxLevel(useGameStore.getState()),
        config,
      )
      set((s) => tick(s, now(), rng, pool, config))
    },

    fulfill: (id) => {
      const c = get().active.find((x) => x.id === id)
      if (!c) return false
      // PlayerState 변경은 gameStore 소유 — 수락(true)일 때만 생명주기에서 제거한다.
      const ok = useGameStore.getState().fulfillCommission(c.swordId, c.reward)
      if (!ok) return false
      set((s) => complete(s, id, now(), getConfig()))
      return true
    },
  }))
}

// 앱 전역 공유 의뢰 store 인스턴스.
export const useCommissionStore = createCommissionStore()
