// 의뢰(Commission) 큐의 "순수 전이 코어" — 타이머/DataManager/React 의존이 전혀 없다.
// 생성·만료·완료·재생성 전이를 순수 함수로만 표현해 단위 테스트가 결정적이게 한다
// (effectQueue ↔ effectStore 와 같은 분리: 로직은 여기, 시간/데이터는 commissionStore).
//
// 튜닝 설정(CommissionConfig)은 DataManager 가 데이터 파일에서 로드하고, 셸(commissionStore)이
// 이 순수 함수들에 인자로 주입한다(rng·now 주입과 동일 규율) — 그래서 코어는 DataManager 비의존이고
// 테스트는 config 픽스처를 주입해 production 값 변경에 흔들리지 않는다.
//
// 모델 — "단일 스폰 타이머":
//  - active: 현재 화면에 떠 있는 의뢰들(각자 절대 만료 시각 expiresAt). 최대 maxCommissions 개.
//  - nextSpawnAt: 다음 1개가 등장할 절대 시각. null = 타이머 정지(슬롯이 꽉 차 신규 스폰을 멈춤).
//  - 불변식(매 tick 후): nextSpawnAt === null  ⟺  active.length === maxCommissions.
//    즉 자리가 비면 타이머가 돌고(시각 보유), 꽉 차면 멈춘다(null). 만료는 정지와 무관하게 계속 일어난다.
//  - 의뢰는 spawnInterval 간격으로 "1개씩" 등장한다(한 tick 에 1개). 꽉 차면 멈췄다가 한 자리 비면
//    그 시점부터 다시 간격을 세어 1개씩 채운다.
//  - 절대 타임스탬프만 쓰고 카운트다운 감산은 하지 않는다 — 탭 throttle·드리프트에 강하고 now 주입으로 결정적.

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
  nextSpawnAt: number | null // 다음 스폰 예정 절대 시각. null = 꽉 차서 정지.
  nextId: number // 다음 의뢰에 부여할 id(1 부터 — 0 은 "없음" 센티넬)
}

// 부트스트랩: 빈 상태 + 즉시(now) 첫 스폰 예정 → 첫 tick 에서 1개가 바로 등장하고, 이후 간격대로 1개씩 채운다.
// (빈 바를 한 간격 내내 방치하지 않으려는 선택 — 첫 1개는 즉시, 나머지는 spawnInterval 간격.)
export function emptyCommissionQueue(now: number): CommissionQueueState {
  return { active: [], nextSpawnAt: now, nextId: 1 }
}

// 다음 스폰 시각 = now + [spawnIntervalMinMs, spawnIntervalMaxMs] 무작위. rng 1회 소비.
function nextSpawnTime(
  now: number,
  rng: () => number,
  config: CommissionConfig,
): number {
  return (
    now +
    config.spawnIntervalMinMs +
    rng() * (config.spawnIntervalMaxMs - config.spawnIntervalMinMs)
  )
}

// 출제 풀(순수 — DataManager 비의존, 검 목록을 입력으로 받는다).
// 현재 의뢰 레벨에서 허용된 검 단계(swordLevels)에 속하고 sellPrice 가 있는 검만 남긴다.
//  - swordLevels: 의뢰 레벨이 결정하는 등장 검 단계 목록(commissionProgress.swordLevelsFor 로 해석).
//  - sellPrice === null 검(낡은 단검 sword_0 · 최종 단계)은 자동 제외된다 — 이는 단순 필터가 아니라
//    "시작 검 소모 → 빈 슬롯이 sword_0 재생성 → 무한 골드" 익스플로잇을 막는 load-bearing 조건이다
//    (레벨 정의가 1~27 단계만 담도록 로더가 강제하므로 실제로 걸릴 일은 없지만 방어적으로 유지).
// 자격 검이 없으면 [].
export function commissionPool(
  swords: readonly SwordData[],
  swordLevels: readonly number[],
): SwordData[] {
  return swords.filter(
    (s) => s.sellPrice !== null && swordLevels.includes(s.level),
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
//  1) 만료: active 중 now 도달분을 제거(expired 로 반환 — 셸이 그 수만큼 경험치 차감).
//  2) 재개: 만료/완료로 자리가 비어 active < max 인데 타이머가 멈춰(null) 있었다면, 지금부터 다시
//     spawnInterval 을 세기 시작한다(nextSpawnAt = now + 간격). "한 자리 비면 타이머가 다시 돈다".
//  3) 스폰: 타이머가 돌고(시각 보유) now 도달 + 자리 있으면 1개 등장. 등장 후 자리가 남으면 다음 간격을,
//     꽉 차면 정지(null)한다. 풀이 비어 만들지 못하면 시각을 유지하고 다음 tick 에 재시도(보류).
//
// tick 후 불변식: nextSpawnAt === null ⟺ active.length === max.
// 완료(complete)는 active 에서 이미 제거되므로 expired 에 잡히지 않는다(만료/완료 이중계산 없음).
// 백그라운드로 오래 묶여 여러 간격이 지났어도 복귀 tick 에 1개만 스폰한다(상대 스케줄링 — 트리클이 의도).
export function tick(
  state: CommissionQueueState,
  now: number,
  rng: () => number,
  pool: readonly SwordData[],
  config: CommissionConfig,
): { state: CommissionQueueState; expired: Commission[] } {
  const max = config.maxCommissions

  // 1) 만료 처리
  const active: Commission[] = []
  const expired: Commission[] = []
  for (const c of state.active) {
    if (now >= c.expiresAt) expired.push(c)
    else active.push(c)
  }

  let nextSpawnAt = state.nextSpawnAt
  let nextId = state.nextId

  // 2) 재개: 자리가 비었는데 멈춰 있었다면(꽉 차서 null) 지금부터 다시 간격을 센다.
  if (nextSpawnAt === null && active.length < max) {
    nextSpawnAt = nextSpawnTime(now, rng, config)
  }

  // 3) 스폰: 타이머가 돌고 도달 + 자리 있으면 1개 등장(한 tick 에 1개). 재개로 막 세팅된 경우
  //    nextSpawnAt > now 라 이번 tick 엔 발화하지 않는다 → 재개·발화가 같은 tick 에 안 겹친다.
  if (nextSpawnAt !== null && now >= nextSpawnAt && active.length < max) {
    const made = generateOne(pool, now, rng, config)
    if (made) {
      active.push({ ...made, id: nextId })
      nextId += 1
      // 자리가 남으면 다음 간격을, 꽉 차면 정지.
      nextSpawnAt = active.length < max ? nextSpawnTime(now, rng, config) : null
    }
    // made 가 null(풀 비었음)이면 nextSpawnAt(과거 시각)을 그대로 둬 다음 tick 에 재시도한다.
  } else if (active.length >= max) {
    // 방어: 자리가 없으면 항상 정지(불변식 유지).
    nextSpawnAt = null
  }

  return { state: { active, nextSpawnAt, nextId }, expired }
}

// 의뢰 완료: active 에서 id 를 제거하기만 한다. 자리가 비면 타이머 재개는 다음 tick(≤tickInterval)이 처리한다
// (nextSpawnAt 을 읽는 곳은 tick 뿐이라 그 사이 불변식의 과도기 위반은 관측되지 않는다). 없는 id 면 무변화.
export function complete(
  state: CommissionQueueState,
  id: number,
): CommissionQueueState {
  if (!state.active.some((c) => c.id === id)) return state
  return { ...state, active: state.active.filter((c) => c.id !== id) }
}
