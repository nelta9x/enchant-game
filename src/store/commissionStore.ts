import { create } from 'zustand'
import { dataManager } from '../data/DataManager'
import type { CommissionConfig, GoldBucket } from '../data/types'
import {
  bootstrapCommissionQueue,
  commissionPool,
  complete,
  attempt,
  refresh,
  type CommissionQueueState,
  type BucketSettings,
  type PoolEntry,
} from './commissionQueue'
import { useGameStore } from './gameStore'

// 골드 버킷 정의에서 세션 생성에 필요한 설정 묶음만 뽑는다(코어 BucketSettings 형태로).
// (보상 배수/가산은 아이템별이라 여기 없고 buildPool 이 PoolEntry 로 실어 나른다.)
function settingsOf(bucket: GoldBucket): BucketSettings {
  return { refreshWeights: bucket.refreshWeights }
}

// 의뢰(Commission) 시스템의 얇은 셸 — 순수 전이 코어(commissionQueue)에 "강화 시도 신호"와 "데이터"만 입힌다.
// 생성/갱신 규칙은 전부 코어에 있고, 여기서는 강화가 일어날 때마다 GameScreen 이 notifyAttempt() 를 호출하면
// 출제 풀(DataManager)·보유 골드(gameStore)·튜닝 설정(DataManager)을 읽어 코어에 주입한다. 타이머는 없다
// (시간 기반에서 강화 시도 기반으로 전환 — fulfill 과 동일하게 호출 측이 imperative 하게 밀어 넣는다).
//
// 설정(config)은 DataManager.getCommissionConfig() 에서 읽는다. 단 이 호출은 반드시 load 이후여야 하므로
// (DataManager.ensureLoaded), 모듈 평가 시점에 즉시 도는 zustand 초기화에서는 읽지 않는다 — 초기 상태는
// config 없는 빈 큐로 두고, start()(App useEffect → load 이후)에서 bootstrapCommissionQueue 로 재초기화한다.
//
// 출제 풀은 "보유 골드"가 고른다: 매 갱신 시 현재 골드로 담당 버킷(currentBucket)을 골라 그 items[] 을 제안
// 풀로 삼는다. 세션이 갱신될 때 spawnSession 이 그 풀에서 서로 다른 항목 maxCommissions 개를 골라 한 번에
// 출제한다. 골드가 바뀌어 버킷이 달라지면 다음 갱신부터 반영된다(이미 발급된 제안은 freeze 유지).
//
// 완료는 두 store 에 걸친 트랜잭션이다: PlayerState 변경(검 소모+골드)은 gameStore 가 소유하고,
// 제안 생명주기(선택 시 세션 카드 제거)는 여기가 소유한다 — gameStore 가 완료를 수락(true)할 때만 complete 를
// 적용해 두 store 의 일관성을 보장한다. complete 는 이번 세션의 카드를 전부 비우고(고른 것 + 나머지) 갱신
// 카운터는 그대로 둔다 — 카드들은 사라지고 갱신 바만 남으며, 새 제안은 강화 시도로 카운터가 0 이 될 때 뜬다.

type CommissionActions = {
  // 큐 시작(App 마운트 시 1회). 이미 시작했으면 무시. config 로 큐를 초기화한다(잠금 해제 상태면 첫 세션을 채운다).
  start: () => void
  // 큐 정지 + 비우기(App 언마운트 시).
  stop: () => void
  // 강화 시도 1회 알림 — GameScreen 이 enhance() 직후 호출. 잠금/부트스트랩/카운터 차감·갱신을 처리한다.
  notifyAttempt: () => void
  // 제안 강제 갱신: refreshCost 골드를 지불하고 현재 세션을 즉시 새로 출제한다(상단 갱신 버튼). 정지/잠금이거나
  // 골드가 부족하면 무변화로 false(골드는 지불 성공 시에만 빠진다). 성공이면 true.
  refreshNow: () => boolean
  // 의뢰 완료 시도: gameStore 가 검 소모+보상을 수락하면 complete 적용 후 true. 미보유면 false(무변화).
  fulfill: (id: number) => boolean
}

export type CommissionStore = CommissionQueueState & CommissionActions

type CreateOpts = {
  // 생성 rng(테스트에서 결정적 주입). 미지정 시 Math.random.
  rng?: () => number
  // 튜닝 설정(테스트에서 production 값과 독립된 픽스처 주입). 미지정 시 DataManager 에서 읽는다(load 이후).
  config?: CommissionConfig
}

// 의뢰 store 팩토리. 기본 인스턴스(useCommissionStore)는 앱 전역 공유, 테스트는 독립 인스턴스를 만든다.
export function createCommissionStore(opts: CreateOpts = {}) {
  const rng = opts.rng ?? Math.random
  // 설정 해석: 명시 주입이 있으면 그것을, 없으면 DataManager 에서 읽는다(반드시 load 이후 — start/notifyAttempt/fulfill 안에서만 호출).
  const getConfig = (): CommissionConfig =>
    opts.config ?? dataManager.getCommissionConfig()
  // 시작 여부 래치(타이머가 없으므로 start/stop 의 가드 역할). 시작 후 stop 전까지 notifyAttempt 가 동작한다.
  let started = false
  // 잠금 해제 후 "첫 세션을 채웠는지" 일방향 래치. maxLevelReached 는 단조라 잠금→해제는 한 번뿐이므로
  // 해제 시 한 번만 부트스트랩하고 이후엔 일반 attempt 로 굴린다. start/stop 에서 리셋.
  let bootstrapped = false

  // 제안 활성화 게이트: 도달 강화 레벨(maxLevelReached, 단조)이 설정 임계(unlockAtLevel) 이상이면 활성.
  // gold 와 마찬가지로 gameStore 에서 매번 새로 읽는다(달성 즉시 다음 알림에 반영).
  const isUnlocked = (config: CommissionConfig): boolean =>
    useGameStore.getState().maxLevelReached >= config.unlockAtLevel

  // 현재 보유 골드가 담당하는 버킷을 읽는다. 매 갱신 새로 읽어 골드 변동이 다음 스폰부터 반영된다.
  // 로더가 보장(정렬·연속·첫 minGold=0·마지막 maxGold=null)하므로 "maxGold 가 null 이거나 gold < maxGold 인
  // 첫 버킷"이 담당이다(minGold 는 스폰 시 읽지 않는다). find 가 못 찾는 경우(방어)는 마지막 버킷으로 폴백.
  const currentBucket = (config: CommissionConfig): GoldBucket => {
    const gold = useGameStore.getState().gold
    return (
      config.buckets.find((b) => b.maxGold === null || gold < b.maxGold) ??
      config.buckets[config.buckets.length - 1]
    )
  }

  // 출제 풀 조립: 현재 버킷의 items[] 에 basePrice 를 붙여 PoolEntry[] 로. start(부트스트랩)·notifyAttempt 가 공유.
  const buildPool = (bucket: GoldBucket): PoolEntry[] =>
    commissionPool(bucket.items, (id) => dataManager.getItemBasePrice(id))

  return create<CommissionStore>((set, get) => ({
    // 초기 상태는 빈 큐 — start()에서 bootstrapCommissionQueue 로 채운다(모듈 평가 시 load 전이라 config 미접근).
    active: [],
    attemptsRemaining: 0,
    attemptsTotal: 0,
    nextId: 1,

    start: () => {
      if (started) return
      started = true
      const config = getConfig()
      bootstrapped = false
      // 시작 시점에 이미 해제됐으면(예: 도달 레벨이 임계 이상) 즉시 첫 세션을 채운다. 아직 잠겨 있으면 초기
      // 빈 상태(active:[]) 그대로 두고, 해제되는 첫 notifyAttempt 가 부트스트랩한다(아래). 잠금 중엔 set 0회.
      if (isUnlocked(config)) {
        const bucket = currentBucket(config)
        set(
          bootstrapCommissionQueue(
            rng,
            buildPool(bucket),
            settingsOf(bucket),
            config.maxCommissions,
          ),
        )
        bootstrapped = true
      }
    },

    stop: () => {
      started = false
      bootstrapped = false
      set({ active: [], attemptsRemaining: 0, attemptsTotal: 0, nextId: 1 })
    },

    notifyAttempt: () => {
      if (!started) return
      const config = getConfig()
      // 잠금 중이면 아무것도 하지 않는다 — 초기 빈 상태를 그대로 두므로 set 호출이 없어 리렌더가 없다.
      if (!isUnlocked(config)) return
      const bucket = currentBucket(config)
      if (!bootstrapped) {
        // 해제 직후 첫 알림 — 이 강화 시도가 잠금을 넘긴 경우. 즉시 첫 세션을 채우고 카운터는 차감하지 않는다
        // (해제 교차 시도는 첫 세션을 "만드는" 시도이지 그 세션의 시도를 소비하는 게 아니다).
        set(
          bootstrapCommissionQueue(
            rng,
            buildPool(bucket),
            settingsOf(bucket),
            config.maxCommissions,
          ),
        )
        bootstrapped = true
        return
      }
      set(
        attempt(
          get(),
          rng,
          buildPool(bucket),
          settingsOf(bucket),
          config.maxCommissions,
        ),
      )
    },

    refreshNow: () => {
      if (!started) return false
      const config = getConfig()
      // 잠금 중이면 갱신할 세션이 없다 — 강제 갱신도 불가(잠금 게이트를 골드로 우회하지 못하게). 무변화 false.
      if (!isUnlocked(config)) return false
      // 골드 지불은 gameStore 소유(fulfill 과 동일한 두 store 트랜잭션 규율) — 차감 성공일 때만 갱신한다.
      // (지불 후 줄어든 골드로 currentBucket 을 읽어 출제 풀을 고른다 — 갱신은 항상 현재 골드를 반영한다.)
      if (!useGameStore.getState().spendGold(config.refreshCost)) return false
      const bucket = currentBucket(config)
      set(
        refresh(
          rng,
          buildPool(bucket),
          settingsOf(bucket),
          config.maxCommissions,
          get().nextId,
        ),
      )
      // 강제 갱신은 잠금 해제 후에만 도달하므로 부트스트랩 래치를 세워 둔다 — 만약 자연 부트스트랩 전에
      // 갱신했다면, 다음 notifyAttempt 가 다시 부트스트랩해 방금 산 세션을 덮어쓰지 않도록(방어).
      bootstrapped = true
      return true
    },

    fulfill: (id) => {
      const c = get().active.find((x) => x.id === id)
      if (!c) return false
      // PlayerState 변경(검 소모+골드)은 gameStore 소유 — 수락(true)일 때만 생명주기에서 제거한다.
      const ok = useGameStore.getState().fulfillCommission(c.cost, c.reward)
      if (!ok) return false
      set((s) => complete(s, id))
      return true
    },
  }))
}

// 앱 전역 공유 의뢰 store 인스턴스.
export const useCommissionStore = createCommissionStore()
