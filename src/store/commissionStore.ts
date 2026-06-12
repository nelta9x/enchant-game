import { create } from 'zustand'
import { dataManager } from '../data/DataManager'
import type { CommissionConfig, GoldBucket } from '../data/types'
import {
  bootstrapCommissionQueue,
  commissionPool,
  complete,
  gamblePoolEntry,
  tick,
  type CommissionQueueState,
  type BucketSettings,
  type PoolEntry,
} from './commissionQueue'
import { useGameStore } from './gameStore'

// 골드 버킷 정의에서 생성에 필요한 설정 묶음만 뽑는다(코어 BucketSettings 형태로).
// (보상 배수/가산은 아이템별이라 여기 없고 buildPool 이 PoolEntry 로 실어 나른다.)
function settingsOf(bucket: GoldBucket): BucketSettings {
  return {
    durationMinMs: bucket.durationMinMs,
    durationMaxMs: bucket.durationMaxMs,
    spawnIntervalMinMs: bucket.spawnIntervalMinMs,
    spawnIntervalMaxMs: bucket.spawnIntervalMaxMs,
  }
}

// 의뢰(Commission) 시스템의 얇은 셸 — 순수 전이 코어(commissionQueue)에 "시간"과 "데이터"만 입힌다.
// 생성/만료/재생성 규칙은 전부 코어에 있고, 여기서는 setInterval 로 주기적으로 tick(Date.now()) 을 돌리고,
// 출제 풀(DataManager)·보유 골드(gameStore)·튜닝 설정(DataManager)을 읽어 주입한다. effectStore 와 같은 셸 패턴.
//
// 설정(config)은 DataManager.getCommissionConfig() 에서 읽는다. 단 이 호출은 반드시 load 이후여야 하므로
// (DataManager.ensureLoaded), 모듈 평가 시점에 즉시 도는 zustand 초기화에서는 읽지 않는다 — 초기 상태는
// config 없는 빈 큐로 두고, start()(App useEffect → load 이후)에서 bootstrapCommissionQueue 로 재초기화한다.
//
// 출제 풀은 "보유 골드"가 고른다: 매 tick 현재 골드로 담당 버킷(currentBucket)을 골라 그 items[] 을 제안 풀로
// 삼는다. 세션이 시작될 때 spawnSession 이 그 풀에서 서로 다른 항목 maxCommissions 개를 골라 한 번에 출제한다.
// 골드가 바뀌어 버킷이 달라지면 다음 세션부터 반영된다(이미 발급된 제안은 freeze 유지).
//
// 완료는 두 store 에 걸친 트랜잭션이다: PlayerState 변경(검 소모+골드)은 gameStore 가 소유하고,
// 제안 생명주기(선택 시 세션 전체 제거 + 다음 세션 예약)는 여기가 소유한다 — gameStore 가 완료를 수락(true)할
// 때만 complete 를 적용해 두 store 의 일관성을 보장한다. complete 는 고른 제안만이 아니라 그 세션의 모든 제안을
// 비운다(하나를 고르면 세션이 끝난다) — 나머지 제안은 비용 없이 사라지고 다음 tick 이 쿨다운을 세서 재시작한다.

type CommissionActions = {
  // 주기 tick 시작(App 마운트 시 1회). 이미 돌고 있으면 무시. config 로 큐를 초기화한 뒤 첫 tick 을 돈다.
  start: () => void
  // tick 정지 + 큐 비우기(App 언마운트 시).
  stop: () => void
  // 내부: 시간 전진 1회 — 설정·풀·보유 골드를 읽어 tick 에 주입.
  _tick: () => void
  // 의뢰 완료 시도. 거래(trade)는 gameStore 가 검 소모+보상을 수락하면 complete 적용 후 true(미보유면 false).
  // 도박(gamble)은 검이 있으면 press-your-luck 세션을 열고(startGamble) 카드 세션을 종료한 뒤 true — 실제
  // 결과는 모달에서 라운드별로 정해진다. 검이 없으면 false(무변화). 어느 쪽이든 boolean 만 돌려준다.
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
  // 잠금 해제 후 "첫 세션을 채웠는지" 일방향 래치(타이머와 같은 클로저 상태). maxLevelReached 는 단조라
  // 잠금→해제는 한 번뿐이므로 해제 시 한 번만 부트스트랩하고 이후엔 일반 tick 으로 굴린다. start/stop 에서 리셋.
  let bootstrapped = false

  // 제안 활성화 게이트: 도달 강화 레벨(maxLevelReached, 단조)이 설정 임계(unlockAtLevel) 이상이면 활성.
  // gold 와 마찬가지로 gameStore 에서 매 tick 새로 읽는다(달성 즉시 다음 tick 에 반영).
  const isUnlocked = (config: CommissionConfig): boolean =>
    useGameStore.getState().maxLevelReached >= config.unlockAtLevel

  // 현재 보유 골드가 담당하는 버킷을 읽는다. 매 tick 새로 읽어 골드 변동이 다음 스폰부터 반영된다.
  // 로더가 보장(정렬·연속·첫 minGold=0·마지막 maxGold=null)하므로 "maxGold 가 null 이거나 gold < maxGold 인
  // 첫 버킷"이 담당이다(minGold 는 스폰 시 읽지 않는다). find 가 못 찾는 경우(방어)는 마지막 버킷으로 폴백.
  const currentBucket = (config: CommissionConfig): GoldBucket => {
    const gold = useGameStore.getState().gold
    return (
      config.buckets.find((b) => b.maxGold === null || gold < b.maxGold) ??
      config.buckets[config.buckets.length - 1]
    )
  }

  // 출제 풀 조립: 현재 버킷의 items[] 에 basePrice 를 붙여 PoolEntry[] 로. start(부트스트랩)·_tick 이 공유.
  // 수상한 상인(도박)은 글로벌 설정이라 버킷 풀에 합류시킨다 — 단 "현재 장착 검 레벨 >= minSwordLevel" 게이트를
  // 통과할 때만(maxLevelReached 가 아니라 현재 검 레벨 — 파괴로 낮아지면 다음 세션부터 사라진다). 골드 버킷이
  // "다음 세션부터" 반영되는 패턴과 동일하게, 검 레벨 변동은 다음 풀 조립(= 다음 세션)부터 반영된다.
  const buildPool = (
    bucket: GoldBucket,
    config: CommissionConfig,
  ): PoolEntry[] => {
    const pool = commissionPool(bucket.items, (id) =>
      dataManager.getItemBasePrice(id),
    )
    const g = config.gamble
    if (g) {
      const curId = useGameStore.getState().currentSwordId
      const curLevel = curId
        ? (dataManager.getSwordById(curId)?.level ?? 0)
        : 0
      // 하한(minSwordLevel)과 상한(최고 검 미만) 사이에서만 출제한다. 최종 검에선 승리가 상한에 클램프돼
      // 무의미(또는 클리어 모달 재발화)하고 패배만 남아 순수 손해가 되므로 제외한다(하한 게이트의 거울상).
      if (
        curLevel >= g.minSwordLevel &&
        curLevel < dataManager.getMaxSwordLevel()
      )
        pool.push(gamblePoolEntry(g))
    }
    return pool
  }

  return create<CommissionStore>((set, get) => ({
    // 초기 상태는 빈 큐(정지) — start()에서 bootstrapCommissionQueue 로 채우고 타이머를 켠다(모듈 평가 시 load 전이라 config 미접근).
    active: [],
    nextSpawnAt: null,
    nextId: 1,

    start: () => {
      if (timer !== null) return
      const config = getConfig()
      bootstrapped = false
      // 시작 시점에 이미 해제됐으면(예: 도달 레벨이 임계 이상) 즉시 첫 세션을 채운다 — 빈 바를 한 쿨다운
      // 내내 두지 않으려는 선택. 아직 잠겨 있으면 초기 빈 상태(active:[]) 그대로 두고 타이머만 켠다.
      // 그러면 해제되는 첫 _tick 이 부트스트랩한다(아래). 어느 쪽이든 잠금 중엔 set 을 하지 않아 리렌더 0.
      if (isUnlocked(config)) {
        const bucket = currentBucket(config)
        set(
          bootstrapCommissionQueue(
            now(),
            rng,
            buildPool(bucket, config),
            settingsOf(bucket),
            config.maxCommissions,
          ),
        )
        bootstrapped = true
      }
      timer = setInterval(() => get()._tick(), config.tickIntervalMs)
    },

    stop: () => {
      if (timer !== null) {
        clearInterval(timer)
        timer = null
      }
      bootstrapped = false
      set({ active: [], nextSpawnAt: null, nextId: 1 })
    },

    _tick: () => {
      const config = getConfig()
      // 잠금 중이면 아무것도 하지 않는다 — 초기 빈 상태(active:[], nextSpawnAt:null)를 그대로 두므로
      // set 호출이 없어 구독자 리렌더가 발생하지 않는다(잠금 구간이 길어도 비용 0). 풀 조립도 건너뛴다.
      if (!isUnlocked(config)) return
      // 도박 세션 중엔 큐를 동결한다 — 새 제안을 스폰·만료시키지 않아 클릭 시 비워진 바에 도박 패널만 남는다
      // ("수상한 상인 제안만 남고"). 세션이 확정/실패로 비워지면 다음 tick 부터 동결이 풀려 쿨다운 뒤 재스폰.
      if (useGameStore.getState().gambleSession !== null) return
      const bucket = currentBucket(config)
      if (!bootstrapped) {
        // 해제 직후 첫 tick — start 가 잠금 상태로 켜졌던 경로의 진입점. 즉시 첫 세션을 채운다(start 부트스트랩과 동일).
        set(
          bootstrapCommissionQueue(
            now(),
            rng,
            buildPool(bucket, config),
            settingsOf(bucket),
            config.maxCommissions,
          ),
        )
        bootstrapped = true
        return
      }
      const { state } = tick(
        get(),
        now(),
        rng,
        buildPool(bucket, config),
        settingsOf(bucket),
        config.maxCommissions,
      )
      set(state)
      // 만료된 의뢰(expired)는 단순히 active 에서 제거된다 — 별도 패널티 없음.
    },

    fulfill: (id) => {
      const c = get().active.find((x) => x.id === id)
      if (!c) return false
      // 도박: 검을 걸어 press-your-luck 세션을 연다(검은 에스크로 — 확정 전까지 안 바뀜). 검이 있어야 시작된다.
      // 세션이 열리면 카드 세션을 종료(complete)하고 GameScreen 이 gambleSession 을 구독해 모달을 띄운다.
      // 카드 만료(expiresAt)를 모달이 이어받아 카운트다운·만료 자동 확정에 쓴다(타이머는 유지된다).
      if (c.kind === 'gamble') {
        const game = useGameStore.getState()
        if (game.currentSwordId === null) return false // 검 없음(파산) — 세션 유지
        game.startGamble(
          {
            successChance: c.successChance,
            winDelta: c.winDelta,
            loseDelta: c.loseDelta,
            maxRounds: c.maxRounds,
          },
          c.expiresAt,
        )
        set((s) => complete(s, id))
        return true
      }
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
