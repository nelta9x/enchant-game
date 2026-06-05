// 의뢰(Commission) 큐의 "순수 전이 코어" — 타이머/DataManager/React 의존이 전혀 없다.
// 생성·만료·완료·재생성 전이를 순수 함수로만 표현해 단위 테스트가 결정적이게 한다
// (effectQueue ↔ effectStore 와 같은 분리: 로직은 여기, 시간/데이터는 commissionStore).
//
// 튜닝 설정(CommissionConfig)은 DataManager 가 데이터 파일에서 로드하고, 셸(commissionStore)이
// 이 순수 함수들에 인자로 주입한다(rng·now 주입과 동일 규율) — 그래서 코어는 DataManager 비의존이고
// 테스트는 config 픽스처를 주입해 production 값 변경에 흔들리지 않는다.
//
// 모델:
//  - active: 현재 화면에 떠 있는 의뢰들. 각자 절대 만료 시각(expiresAt)을 가진다.
//  - pending: 빈 슬롯 = "이 시각이 되면 새 의뢰를 스폰한다"는 절대 스폰 시각의 목록.
//  - 불변식: active.length + pending.length === maxCommissions (항상). 빈 슬롯을 "재생성 카운터"가
//    아니라 스폰 타임스탬프로 모델링해 과잉/누락 재생성을 구조적으로 차단한다.
//  - 절대 타임스탬프(expiresAt/스폰 시각)만 쓰고 카운트다운 감산은 하지 않는다 — 탭 throttle·드리프트에
//    강하고, now 만 주입하면 테스트가 결정적이다.

import type { CommissionConfig, SwordData } from '../data/types'

// 화면에 떠 있는 의뢰 1건. reward/incentive/createdAt/expiresAt 은 생성 시점에 정해져 freeze 된다.
export type Commission = {
  id: number
  swordId: string
  reward: number // round(sellPrice * (1 + incentive)) — 생성 시 freeze
  incentive: number // [incentiveMin, incentiveMax] freeze (표시용)
  createdAt: number // 생성 시각(now 기준). 타이머 막대 비율 = (expiresAt - now) / (expiresAt - createdAt).
  expiresAt: number // 절대 만료 시각(now 기준)
}

export type CommissionQueueState = {
  active: Commission[]
  pending: number[] // 각 원소 = 스폰 예정 절대 시각(빈 슬롯)
  nextId: number // 다음 의뢰에 부여할 id(1 부터 — 0 은 "없음" 센티넬)
}

// 부트스트랩: maxCommissions 개 슬롯을 모두 now 스폰 예정으로 둔다 → 첫 tick 에서 풀이 있으면 즉시 채워진다.
export function emptyCommissionQueue(
  now: number,
  maxCommissions: number,
): CommissionQueueState {
  return {
    active: [],
    pending: Array.from({ length: maxCommissions }, () => now),
    nextId: 1,
  }
}

// "진행도 근처" 출제 풀(순수 — DataManager 비의존, 검 목록을 입력으로 받는다).
// 범위는 [max(maxLevel - poolLevelBelow, minLevel), maxLevel + poolLevelAbove] 이며, sellPrice 가 있는 검만.
//  - minLevel: 절대 최소 레벨 바닥 — 이 미만 검은 진행도와 무관하게 의뢰에 나오지 않는다(요청 기능).
//    그 결과 maxLevel + poolLevelAbove < minLevel 인 진행 초반에는 풀이 비어 의뢰가 뜨지 않는다(의도된 동작).
//  - sellPrice === null 검(낡은 단검 sword_0 · 최종 단계)은 자동 제외된다 — 이는 단순 필터가 아니라
//    "시작 검 소모 → equipNextFromBag 이 sword_0 재생성 → 무한 골드" 익스플로잇을 막는 load-bearing 조건이다.
// 자격 검이 없으면 [].
export function commissionPool(
  swords: readonly SwordData[],
  playerMaxLevel: number,
  config: CommissionConfig,
): SwordData[] {
  const lo = Math.max(playerMaxLevel - config.poolLevelBelow, config.minLevel)
  const hi = playerMaxLevel + config.poolLevelAbove
  return swords.filter(
    (s) => s.sellPrice !== null && s.level >= lo && s.level <= hi,
  )
}

// 의뢰 1건의 내용 생성(id 제외 — 발급은 tick 이 한다). 풀이 비면 null.
// rng 를 고정 순서·고정 횟수(3회)로 소비한다 → 시드가 같으면 swordId/incentive/expiresAt 가 동일(결정성).
export function generateOne(
  pool: readonly SwordData[],
  now: number,
  rng: () => number,
  config: CommissionConfig,
): Omit<Commission, 'id'> | null {
  if (pool.length === 0) return null
  // 1) 풀 인덱스
  const sword = pool[Math.floor(rng() * pool.length)]
  // 2) 인센티브(표시·보상 산정)
  const incentive =
    config.incentiveMin + rng() * (config.incentiveMax - config.incentiveMin)
  // 3) 시간 제한 → 절대 만료 시각
  const expiresAt =
    now +
    (config.durationMinMs +
      rng() * (config.durationMaxMs - config.durationMinMs))
  // sellPrice 는 풀 필터에서 non-null 보장.
  const reward = Math.round((sword.sellPrice as number) * (1 + incentive))
  return { swordId: sword.id, reward, incentive, createdAt: now, expiresAt }
}

// 시간 전진. 순서가 중요하다:
//  1) 만료: active 중 now 도달분을 제거하고, 각각 expiresAt + respawnDelayMs 를 pending 에 넣는다
//     (now + delay 가 아니라 expiresAt + delay — 어느 tick 이 감지하든 재생성 시각이 동일해 비결정성이 없다).
//  2) 스폰: pending 중 now 도달분마다 generateOne 으로 새 의뢰를 만들어 active 로 옮긴다.
//     풀이 비어 generateOne 이 null 이면 그 pending 항목은 보존한다(스폰 보류 — 크래시·합 불변식 위반 없음).
// 어떤 경로든 active.length + pending.length === maxCommissions 를 유지한다.
export function tick(
  state: CommissionQueueState,
  now: number,
  rng: () => number,
  pool: readonly SwordData[],
  config: CommissionConfig,
): CommissionQueueState {
  // 1) 만료 처리
  const survivors: Commission[] = []
  const pending = [...state.pending]
  for (const c of state.active) {
    if (now >= c.expiresAt) pending.push(c.expiresAt + config.respawnDelayMs)
    else survivors.push(c)
  }

  // 2) 스폰 처리
  const active = [...survivors]
  const stillPending: number[] = []
  let nextId = state.nextId
  for (const spawnAt of pending) {
    if (now >= spawnAt) {
      const made = generateOne(pool, now, rng, config)
      if (made) {
        active.push({ ...made, id: nextId })
        nextId += 1
        continue
      }
    }
    stillPending.push(spawnAt) // 아직 시각 미도달이거나 풀이 비어 스폰 보류
  }

  return { active, pending: stillPending, nextId }
}

// 의뢰 완료: active 에서 id 를 제거하고 빈 슬롯을 now + respawnDelayMs 스폰 예정으로 채운다
// (완료는 사용자 행위 시점 기준 → now + delay). 없는 id 면 무변화. 합 불변식 유지.
export function complete(
  state: CommissionQueueState,
  id: number,
  now: number,
  config: CommissionConfig,
): CommissionQueueState {
  if (!state.active.some((c) => c.id === id)) return state
  return {
    ...state,
    active: state.active.filter((c) => c.id !== id),
    pending: [...state.pending, now + config.respawnDelayMs],
  }
}
