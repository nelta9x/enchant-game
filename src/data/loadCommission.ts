import commissionRaw from './sources/commission.json'
import type { CommissionConfig, CommissionLevel } from './types'

// 의뢰에 출제될 수 있는 검 단계의 허용 범위(판매가가 있는 검 단계 = sword_1 ~ sword_27).
// swords.json 과 결합도를 낮추기 위해 데이터 레이어에서는 정수 범위로만 검증한다(현 데이터와 일치).
const MIN_SWORD_LEVEL = 1
const MAX_SWORD_LEVEL = 27

// 데이터 파일(commission.json)을 검증해 CommissionConfig 로 만드는 로더(loadShop 패턴 미러링).
//
// 원칙:
//  - 의뢰 튜닝 값은 코드 상수가 아니라 별도 데이터 파일(JSON)에 둔다.
//  - JSON은 컴파일 타임 타입 보장이 없으므로 로드 시점에 런타임 검증으로 형태를 강제한다.
//  - 구조뿐 아니라 *의미*도 검증한다(min ≤ max, 양수 등) — reducer(commissionQueue)가 전제하는 불변을
//    로드 시점에 보장해, 잘못 편집된 JSON 이 조용히 이상 동작하지 않고 즉시 실패하게 한다.
//
// parseCommissionConfig 는 순수 함수로 분리해 테스트 가능하게 두고, loadCommission 이 번들 데이터의 진입점이다.

function fail(msg: string): never {
  throw new Error(`Commission config validation failed: ${msg}`)
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// 유한 숫자 필드 추출(누락·비숫자·NaN·Infinity 거부).
function num(raw: Record<string, unknown>, key: string): number {
  const v = raw[key]
  if (typeof v !== 'number' || !Number.isFinite(v))
    fail(`${key} must be a finite number`)
  return v
}

// 정수이며 최소값 이상인 필드(maxCommissions·딜레이 등 "개수/밀리초"는 정수가 자연스럽다).
function intAtLeast(
  raw: Record<string, unknown>,
  key: string,
  min: number,
): number {
  const v = num(raw, key)
  if (!Number.isInteger(v)) fail(`${key} must be an integer`)
  if (v < min) fail(`${key} must be >= ${min}`)
  return v
}

// 의뢰 레벨 1단계 검증. swordLevels 비어있지 않고 전부 판매가 있는 단계(1~27), xpToNext > 0.
function parseLevel(raw: unknown, idx: number): CommissionLevel {
  const where = `levels[${idx}]`
  if (!isRecord(raw)) fail(`${where} must be an object`)

  const swordLevels = raw.swordLevels
  if (!Array.isArray(swordLevels) || swordLevels.length === 0)
    fail(`${where}.swordLevels must be a non-empty array`)
  for (const lv of swordLevels) {
    if (typeof lv !== 'number' || !Number.isInteger(lv))
      fail(`${where}.swordLevels must contain integers`)
    if (lv < MIN_SWORD_LEVEL || lv > MAX_SWORD_LEVEL)
      fail(
        `${where}.swordLevels entry ${lv} out of range [${MIN_SWORD_LEVEL}, ${MAX_SWORD_LEVEL}] (must be a sellable sword level)`,
      )
  }

  const xpToNext = intAtLeast(raw, 'xpToNext', 1)
  return { swordLevels: [...swordLevels] as number[], xpToNext }
}

// 순수 검증기: 임의 입력(unknown)을 검증된 CommissionConfig 로 변환한다.
// 구조(필드 present + 타입) + 의미(범위·관계) 검증을 거친다.
export function parseCommissionConfig(raw: unknown): CommissionConfig {
  if (!isRecord(raw)) fail('config root must be an object')

  const maxCommissions = intAtLeast(raw, 'maxCommissions', 1)
  const durationMinMs = intAtLeast(raw, 'durationMinMs', 1)
  const durationMaxMs = intAtLeast(raw, 'durationMaxMs', 1)
  const incentiveMin = num(raw, 'incentiveMin')
  const incentiveMax = num(raw, 'incentiveMax')
  const spawnIntervalMinMs = intAtLeast(raw, 'spawnIntervalMinMs', 1)
  const spawnIntervalMaxMs = intAtLeast(raw, 'spawnIntervalMaxMs', 1)
  const tickIntervalMs = intAtLeast(raw, 'tickIntervalMs', 1)
  const xpReward = intAtLeast(raw, 'xpReward', 0)
  const xpPenalty = intAtLeast(raw, 'xpPenalty', 0)

  // 의미(관계) 검증 — reducer 가 전제하는 불변.
  if (durationMinMs > durationMaxMs)
    fail('durationMinMs must be <= durationMaxMs')
  if (incentiveMin < 0) fail('incentiveMin must be >= 0')
  if (incentiveMin > incentiveMax) fail('incentiveMin must be <= incentiveMax')
  if (spawnIntervalMinMs > spawnIntervalMaxMs)
    fail('spawnIntervalMinMs must be <= spawnIntervalMaxMs')

  // levels: 1레벨부터 연속(배열), 비어있지 않음. 각 레벨은 parseLevel 로 검증.
  const rawLevels = raw.levels
  if (!Array.isArray(rawLevels) || rawLevels.length === 0)
    fail('levels must be a non-empty array (commission level 1 = levels[0])')
  const levels = rawLevels.map(parseLevel)

  return {
    maxCommissions,
    durationMinMs,
    durationMaxMs,
    incentiveMin,
    incentiveMax,
    spawnIntervalMinMs,
    spawnIntervalMaxMs,
    tickIntervalMs,
    xpReward,
    xpPenalty,
    levels,
  }
}

// 게임 시작 시 호출되는 로드 진입점. 번들된 데이터 파일을 검증해 CommissionConfig 로 만든다.
export function loadCommission(): CommissionConfig {
  return parseCommissionConfig(commissionRaw)
}
