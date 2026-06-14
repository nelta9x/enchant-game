// 의뢰(Commission)·제안 큐의 "순수 전이 코어" — 타이머/DataManager/React 의존이 전혀 없다.
// 세션 시작·갱신·완료 전이를 순수 함수로만 표현해 단위 테스트가 결정적이게 한다
// (effectQueue ↔ effectStore 와 같은 분리: 로직은 여기, 강화 시도 신호/데이터는 commissionStore).
//
// 튜닝 설정(CommissionConfig)은 DataManager 가 데이터 파일에서 로드하고, 셸(commissionStore)이
// 이 순수 함수들에 인자로 주입한다(rng 주입과 동일 규율) — 그래서 코어는 DataManager 비의존이고
// 테스트는 config 픽스처를 주입해 production 값 변경에 흔들리지 않는다.
//
// 모델 — "제안 세션(배치)"은 시간이 아니라 강화 시도 횟수로 굴러간다:
//  - active: 현재 화면에 떠 있는 한 세션의 제안들. 세션이 시작되면 서로 다른 제안 sessionSize 개를 "한 번에"
//    출제한다(풀의 서로 다른 항목 수가 그보다 적으면 있는 만큼만 — min). 세션 내 중복 제안은 없다(비복원 추출).
//  - attemptsTotal / attemptsRemaining: 세션이 갱신되기까지의 강화 시도 카운터. 세션 시작 시 버킷의
//    refreshWeights 에서 가중 추첨으로 한 번 뽑아(attemptsTotal) attemptsRemaining 을 같게 둔다. 강화 시도가
//    한 번 일어날 때마다 attemptsRemaining 을 1 줄이고, 1 에서 0 으로 떨어지는 그 시도에 세션 전체를 새로
//    갱신한다(쿨다운 없음 — 즉시 교체). 카운트다운 UI 는 세그먼트 바로 표현한다(총 칸 attemptsTotal, 켜진
//    칸 attemptsRemaining — 시도마다 한 칸씩 꺼짐).
//  - 세션은 "한 번에" 출제되고 도중에 보충하지 않는다(트리클 아님).
//  - 제안 선택(complete): 고른 카드 "하나만" 사라지고 나머지는 그대로 남는다 — 카운터도 건드리지 않는다.
//    즉 납품은 세션을 갱신하지 않는다. 세션이 통째로 새로 뜨는 것은 오직 attemptsRemaining 이 0 이 될 때뿐.
//  - 시간 개념(타임스탬프·만료·쿨다운)은 없다 — 탭 throttle·드리프트에 영향받지 않고 rng 주입으로 결정적.

import type {
  CommissionItemEntry,
  Material,
  RefreshWeight,
} from '../data/types'
import { weightedIndex } from '../lib/weightedPick'

// 거래 비용은 골드 또는 아이템뿐이다('free' 는 강화 비용 전용 — 거래엔 쓰지 않는다).
export type CommissionCost = Exclude<Material, { kind: 'free' }>

// 화면에 떠 있는 거래 1건. 비용·보상은 생성 시점 기준으로 정해져 freeze 된다.
// (생성 후 보유 골드가 바뀌어 다른 버킷이 되어도, 발급된 거래의 비용/보상은 발급 시점 값을 유지한다 → freeze.)
//  - cost: 지불(납품)할 것 — Material(골드 또는 아이템). shop price 와 동일 타입 재사용.
//  - reward: 지불 시 받는 것 — Material(골드 계산값 또는 아이템).
export type Commission = {
  id: number
  cost: CommissionCost
  reward: Material
}

// 출제 풀 1항목 — 셸이 버킷 items[] 의 비용(cost)을 해석하고 (골드 보상이면) basePrice 를 붙여 만든다.
// 비용/보상 산정값이 아이템별이라 PoolEntry 가 그 값을 들고 다닌다(코어는 DataManager 비의존 유지).
export type PoolEntry = {
  weight: number
  cost: CommissionCost // 해석된 비용(골드 또는 아이템) — 항목별 고정
} & (
  | {
      rewardKind: 'gold'
      basePrice: number
      incentiveMin: number
      incentiveMax: number
      additiveMin: number
      additiveMax: number
    }
  | {
      rewardKind: 'item'
      rewardItemId: string
      rewardItemCount: number
    }
)

// 제안 세션의 버킷 공통 설정 묶음 — 셸이 현재 버킷에서 합성해 주입한다.
// (보상 배수/가산은 아이템별이라 여기 없고 PoolEntry 에 있다. 세션 크기 등 글로벌도 별도 인자.)
//  - refreshWeights: 세션 카운터(갱신까지의 강화 시도 횟수) 후보의 가중 추첨 목록.
export type BucketSettings = {
  refreshWeights: readonly RefreshWeight[]
}

export type CommissionQueueState = {
  active: Commission[]
  attemptsRemaining: number // 갱신까지 남은 강화 시도 수(0 = 다음 시도에 갱신/재시도)
  attemptsTotal: number // 세션 시작 시 뽑은 총 카운터(세그먼트 바의 총 칸 수). 세션 없음 = 0.
  nextId: number // 다음 제안에 부여할 id(1 부터 — 0 은 "없음" 센티넬)
}

// 빈 상태(세션 없음). 셸 부트스트랩(bootstrapCommissionQueue)이 잠금 해제 시 첫 세션을 채운다.
export function emptyCommissionQueue(): CommissionQueueState {
  return { active: [], attemptsRemaining: 0, attemptsTotal: 0, nextId: 1 }
}

// 시작 부트스트랩: 시작 시 첫 세션을 즉시 채운다(제안 sessionSize 개 + 갱신 카운터). refresh 에 위임한다.
export function bootstrapCommissionQueue(
  rng: () => number,
  pool: readonly PoolEntry[],
  settings: BucketSettings,
  sessionSize: number,
): CommissionQueueState {
  return refresh(rng, pool, settings, sessionSize, 1)
}

// 출제 풀(순수 — DataManager 비의존). 버킷 items[] 의 각 itemId 에 basePrice 를 붙여 PoolEntry[] 로 만든다.
// basePrice 를 못 구한 항목(basePriceOf 가 undefined)은 방어적으로 제외한다 — 로드 검증이 itemId 존재를
// 보장하므로 실제로는 걸리지 않지만(판매 가능 검·카탈로그만 출제 가능), 코어 단독으로도 안전하게 유지한다.
export function commissionPool(
  entries: readonly CommissionItemEntry[],
  basePriceOf: (itemId: string) => number | undefined,
): PoolEntry[] {
  const pool: PoolEntry[] = []
  for (const e of entries) {
    // 비용 해석: 골드 비용(골드로 구매) 또는 아이템 납품.
    const cost: CommissionCost =
      e.costKind === 'gold'
        ? { kind: 'gold', amount: e.costAmount }
        : { kind: 'item', itemId: e.itemId, count: e.requiredCount }
    if (e.rewardKind === 'item') {
      // 아이템 보상은 basePrice 가 필요 없다 — 고정 아이템을 그대로 싣는다(비용은 골드/아이템 무엇이든).
      pool.push({
        weight: e.weight,
        cost,
        rewardKind: 'item',
        rewardItemId: e.rewardItemId,
        rewardItemCount: e.rewardItemCount,
      })
      continue
    }
    // 골드 보상: basePrice 는 "납품 아이템"의 기준가 → 골드 보상은 아이템 비용에만 허용된다(로더 강제).
    // 방어: 골드 비용인데 골드 보상인 항목은 코어 단독에서도 제외(basePrice 없음).
    if (cost.kind !== 'item') continue
    const basePrice = basePriceOf(cost.itemId)
    if (basePrice === undefined) continue
    pool.push({
      weight: e.weight,
      cost,
      rewardKind: 'gold',
      basePrice,
      incentiveMin: e.incentiveMin,
      incentiveMax: e.incentiveMax,
      additiveMin: e.additiveMin,
      additiveMax: e.additiveMax,
    })
  }
  return pool
}

// 가중치 선택 1회(weightedIndex 공유 구현). rng 1회 소비. 빈 풀이면 null(rng 소비 없음).
function selectEntry(
  pool: readonly PoolEntry[],
  rng: () => number,
): PoolEntry | null {
  const idx = weightedIndex(pool, (e) => e.weight, rng)
  return idx < 0 ? null : pool[idx]
}

// 세션 갱신 카운터 1회 뽑기 — refreshWeights 에서 weight 비례로 후보 하나를 골라 그 value 를 반환한다.
// rng 1회 소비(weightedIndex). 빈 목록이면(방어 — 로더가 비어있지 않음을 강제) 1 로 폴백한다.
export function rollAttempts(
  rng: () => number,
  settings: BucketSettings,
): number {
  const idx = weightedIndex(settings.refreshWeights, (w) => w.weight, rng)
  return idx < 0 ? 1 : settings.refreshWeights[idx].value
}

// 주어진 항목으로 제안 1건의 내용(id 제외 — 발급은 호출자가 한다)을 만든다. 선택은 하지 않는다(항목은 이미 고른 것).
// rng 소비(결정성): 골드 보상이면 1) incentive  2) additive (총 2회), 아이템 보상이면 0회(보상 고정).
// 골드 보상 = round((basePrice + additive) * incentive), 아이템 보상 = 고정 아이템. 발급 시점에 freeze.
function makeOffer(
  entry: PoolEntry,
  rng: () => number,
): Omit<Commission, 'id'> {
  let reward: Material
  if (entry.rewardKind === 'gold') {
    // 1) incentive(보상 배수)  2) additive(보상 가산) — 선택된 아이템의 범위.
    const incentive =
      entry.incentiveMin + rng() * (entry.incentiveMax - entry.incentiveMin)
    const additive =
      entry.additiveMin + rng() * (entry.additiveMax - entry.additiveMin)
    reward = {
      kind: 'gold',
      amount: Math.round((entry.basePrice + additive) * incentive),
    }
  } else {
    reward = {
      kind: 'item',
      itemId: entry.rewardItemId,
      count: entry.rewardItemCount,
    }
  }
  return { cost: entry.cost, reward }
}

// 제안 1건의 내용 생성(id 제외) — 가중치 선택 + 내용. 풀이 비면 null. (단건 생성 진입점 — 테스트·내부용.)
// rng 소비 순서(결정성): 1) selectEntry(가중치 선택)  2~) makeOffer(보상).
export function generateOne(
  pool: readonly PoolEntry[],
  rng: () => number,
): Omit<Commission, 'id'> | null {
  const chosen = selectEntry(pool, rng)
  if (chosen === null) return null
  return makeOffer(chosen, rng)
}

// 비복원 가중 추출 — 풀에서 서로 다른 항목을 최대 count 개 고른다(세션 내 중복 제거의 핵심).
// 매 픽마다 남은 항목들의 가중치로 하나를 골라(weightedIndex 공유 구현) 빼낸다.
// rng 는 픽 수(min(count, 풀 길이))만큼 소비한다.
// "서로 다른 제안" = 서로 다른 풀 항목(같은 itemId 라도 비용/보상 조합이 다르면 다른 항목 = 다른 선택지).
export function pickDistinctEntries(
  pool: readonly PoolEntry[],
  rng: () => number,
  count: number,
): PoolEntry[] {
  const remaining = pool.slice()
  const chosen: PoolEntry[] = []
  const n = Math.min(count, remaining.length)
  for (let k = 0; k < n; k += 1) {
    const idx = weightedIndex(remaining, (e) => e.weight, rng)
    chosen.push(remaining[idx])
    remaining.splice(idx, 1)
  }
  return chosen
}

// 한 세션 출제: 서로 다른 항목 min(sessionSize, 풀 길이) 개를 골라 각각 제안 1건으로 만든다.
// rng 소비 순서(결정성): 1) pickDistinctEntries 가 픽 수만큼(선택)  2) 고른 순서대로 makeOffer(보상).
// 풀이 비면(픽 0개) 빈 세션을 반환한다.
export function spawnSession(
  rng: () => number,
  pool: readonly PoolEntry[],
  sessionSize: number,
  startId: number,
): { offers: Commission[]; nextId: number } {
  const entries = pickDistinctEntries(pool, rng, sessionSize)
  if (entries.length === 0) return { offers: [], nextId: startId }
  const offers: Commission[] = []
  let nextId = startId
  for (const e of entries) {
    offers.push({ ...makeOffer(e, rng), id: nextId })
    nextId += 1
  }
  return { offers, nextId }
}

// 새 세션 갱신: 제안 sessionSize 개를 한 번에 출제하고 갱신 카운터를 뽑아 새 상태를 만든다.
// rng 소비 순서(결정성): 1) spawnSession(선택+보상)  2) rollAttempts(카운터). 이 순서를 바꾸지 말 것 —
// "세션을 먼저 짓고 그 카운터를 정한다". 풀이 비면(방어) active:[], 카운터 0 → 다음 attempt 가 재시도한다.
export function refresh(
  rng: () => number,
  pool: readonly PoolEntry[],
  settings: BucketSettings,
  sessionSize: number,
  startId: number,
): CommissionQueueState {
  const { offers, nextId } = spawnSession(rng, pool, sessionSize, startId)
  if (offers.length === 0) {
    return { active: [], attemptsRemaining: 0, attemptsTotal: 0, nextId }
  }
  const attempts = rollAttempts(rng, settings)
  return {
    active: offers,
    attemptsRemaining: attempts,
    attemptsTotal: attempts,
    nextId,
  }
}

// 강화 시도 1회 반영: 갱신 카운터를 1 줄인다. 카운터가 1→0 으로 떨어지는(또는 빈-풀로 0 인) 시도에는
// 세션 전체를 새로 갱신한다(쿨다운 없이 즉시 교체) — 0 칸만 켜진 죽은 프레임을 만들지 않는다.
// 아직 1 보다 크면 active 는 그대로 두고 카운터만 줄인다(rng 소비 없음).
export function attempt(
  state: CommissionQueueState,
  rng: () => number,
  pool: readonly PoolEntry[],
  settings: BucketSettings,
  sessionSize: number,
): CommissionQueueState {
  if (state.attemptsRemaining <= 1) {
    return refresh(rng, pool, settings, sessionSize, state.nextId)
  }
  return { ...state, attemptsRemaining: state.attemptsRemaining - 1 }
}

// 제안 선택(납품): 고른 id 가 active 에 있으면 그 카드 "하나만" 제거한다 — 나머지 제안과 갱신 카운터는
// 그대로 둔다(납품은 세션을 갱신하지 않는다). 없는 id 면 무변화(참조 동일 반환).
export function complete(
  state: CommissionQueueState,
  id: number,
): CommissionQueueState {
  if (!state.active.some((c) => c.id === id)) return state
  return { ...state, active: state.active.filter((c) => c.id !== id) }
}
