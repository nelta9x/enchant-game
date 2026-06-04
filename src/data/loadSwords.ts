import swordsRaw from './sources/swords.json'
import { ko, type TranslationKey } from '../i18n/locales/ko'
import { swordItemLevel } from './swordId'
import type { Drop, Material, SwordData, SwordNote } from './types'

// 데이터 파일(swords.json)을 검증해 SwordData[]로 만드는 로더.
//
// 원칙:
//  - 데이터는 코드 상수가 아니라 별도 데이터 파일(JSON)에 둔다.
//  - 표시명은 데이터에 박지 않고 level → i18n 키(sword.<level>.name)로 파생한다.
//  - JSON은 컴파일 타임 타입 보장이 없으므로, 로드 시점에 런타임 검증으로 형태를 강제한다.
//
// parseSwords / assertNameKeysResolve 는 순수 함수로 분리해 테스트 가능하게 두고,
// loadSwords 가 번들된 데이터와 i18n 소스를 묶는 진입점이다.

const SWORD_NOTES: readonly SwordNote[] = ['storable', 'easyBug']

// 스프라이트 폴백 적용 전의 중간 표현(sprite 가 아직 null 일 수 있음).
type ParsedSword = Omit<SwordData, 'sprite'> & { sprite: string | null }

function fail(msg: string): never {
  throw new Error(`Sword data validation failed: ${msg}`)
}

// Material(가격/비용) 검증 전용 실패 — 검 enhanceCost·상점 price 가 공유하므로 중립 접두사를 쓴다.
function failMaterial(msg: string): never {
  throw new Error(`Material validation failed: ${msg}`)
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// 임의 입력을 Material(gold / item / free)로 검증한다. ctx 는 에러 문맥 라벨.
// 검 enhanceCost 와 상점 price 가 공유하는 언어 중립 가격 모델 파서다.
export function parseMaterial(raw: unknown, ctx: string): Material {
  if (!isRecord(raw)) failMaterial(`${ctx} material is not an object`)
  const kind = raw.kind
  if (kind === 'gold') {
    const amount = raw.amount
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0)
      failMaterial(
        `${ctx} gold amount must be positive (got ${String(amount)})`,
      )
    return { kind: 'gold', amount }
  }
  if (kind === 'item') {
    const itemId = raw.itemId
    const count = raw.count
    if (typeof itemId !== 'string' || itemId.length === 0)
      failMaterial(`${ctx} item itemId is empty`)
    if (typeof count !== 'number' || !Number.isInteger(count) || count <= 0)
      failMaterial(
        `${ctx} item count must be a positive integer (got ${String(count)})`,
      )
    return { kind: 'item', itemId, count }
  }
  if (kind === 'free') return { kind: 'free' }
  failMaterial(`${ctx} unknown material kind: ${String(kind)}`)
}

function parseNotes(raw: unknown, ctx: string): SwordNote[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) fail(`${ctx} notes must be an array`)
  return raw.map((n) => {
    if (typeof n !== 'string' || !SWORD_NOTES.includes(n as SwordNote))
      fail(`${ctx} unknown note: ${String(n)}`)
    return n as SwordNote
  })
}

function parseSword(raw: unknown): ParsedSword {
  if (!isRecord(raw)) fail('sword entry is not an object')
  const level = raw.level
  if (typeof level !== 'number' || !Number.isInteger(level) || level < 0)
    fail(`level must be a non-negative integer (got ${String(level)})`)
  const ctx = `[+${level}]`

  // enhanceCost / successRate 는 둘 다 null 이면 최종 단계(terminal)다.
  // 한쪽만 null 이면 데이터 오류로 본다.
  const costNull = raw.enhanceCost === null
  const rateNull = raw.successRate === null
  if (costNull !== rateNull)
    fail(
      `${ctx} enhanceCost and successRate must both be null (terminal) or both be set`,
    )

  const enhanceCost = costNull ? null : parseMaterial(raw.enhanceCost, ctx)

  let successRate: number | null = null
  if (!rateNull) {
    const r = raw.successRate
    if (typeof r !== 'number' || !Number.isFinite(r) || r < 0 || r > 1)
      fail(`${ctx} successRate must be within 0~1 (got ${String(r)})`)
    successRate = r
  }

  let sellPrice: number | null = null
  if (raw.sellPrice !== null && raw.sellPrice !== undefined) {
    const s = raw.sellPrice
    if (typeof s !== 'number' || !Number.isFinite(s) || s < 0)
      fail(`${ctx} sellPrice must be >= 0 or null (got ${String(s)})`)
    sellPrice = s
  }

  let protectionTickets: number | 'disabled'
  if (raw.protectionTickets === 'disabled') {
    protectionTickets = 'disabled'
  } else {
    const p = raw.protectionTickets
    if (typeof p !== 'number' || !Number.isInteger(p) || p < 0)
      fail(
        `${ctx} protectionTickets must be a non-negative integer or 'disabled' (got ${String(p)})`,
      )
    protectionTickets = p
  }

  let dropOnFail: Drop | null = null
  if (raw.dropOnFail !== null && raw.dropOnFail !== undefined) {
    const d = raw.dropOnFail
    if (!isRecord(d)) fail(`${ctx} dropOnFail must be an object or null`)
    const itemId = d.itemId
    if (typeof itemId !== 'string' || itemId.length === 0)
      fail(`${ctx} dropOnFail itemId must be a non-empty string`)
    const count = d.count
    if (typeof count !== 'number' || !Number.isInteger(count) || count <= 0)
      fail(
        `${ctx} dropOnFail count must be a positive integer (got ${String(count)})`,
      )
    dropOnFail = { itemId, count }
  }

  // 전용 스프라이트 파일명(선택). 없으면 null — parseSwords 에서 폴백을 채운다.
  let sprite: string | null = null
  if (raw.sprite !== null && raw.sprite !== undefined) {
    if (typeof raw.sprite !== 'string' || raw.sprite.length === 0)
      fail(`${ctx} sprite must be a non-empty string`)
    sprite = raw.sprite
  }

  // 표시명은 데이터에 박지 않는다 — level 로부터 i18n 키를 파생한다.
  // (키가 실제 리소스에 존재하는지는 loadSwords 의 assertNameKeysResolve 에서 검증한다.)
  const nameKey = `sword.${level}.name` as TranslationKey

  return {
    level,
    nameKey,
    enhanceCost,
    successRate,
    sellPrice,
    protectionTickets,
    dropOnFail,
    notes: parseNotes(raw.notes, ctx),
    sprite,
  }
}

// 단계 오름차순 목록에서 가장 높은 단계의 스프라이트를 반환한다(보유 스프라이트가 없으면 '').
function lastSprite(sorted: readonly ParsedSword[]): string {
  for (let i = sorted.length - 1; i >= 0; i--) {
    const s = sorted[i].sprite
    if (s) return s
  }
  return ''
}

// 순수 검증기: 임의 입력(unknown)을 검증된 SwordData[]로 변환한다.
// 단계 중복 검사 + 재료검 참조 무결성까지 확인하고, 단계 오름차순으로 정렬해 반환한다.
export function parseSwords(raw: unknown): SwordData[] {
  if (!Array.isArray(raw)) fail('sword data root must be an array')
  const parsed = raw.map(parseSword)

  const levels = new Set<number>()
  for (const s of parsed) {
    if (levels.has(s.level)) fail(`duplicate stage: +${s.level}`)
    levels.add(s.level)
  }

  // 재료검 참조 무결성: itemId 가 sword_<level> 형태면 그 단계 검이 존재해야 한다.
  // (잡템 itemId 는 아이템 카탈로그가 생기는 스프린트에서 검증한다.)
  for (const s of parsed) {
    if (s.enhanceCost?.kind === 'item') {
      const lvl = swordItemLevel(s.enhanceCost.itemId)
      if (lvl !== null && !levels.has(lvl))
        fail(
          `+${s.level} enhance material references a non-existent sword stage: ${s.enhanceCost.itemId}`,
        )
    }
  }

  const sorted = parsed.sort((a, b) => a.level - b.level)

  // 전용 스프라이트가 없는 단계는 마지막(최고 단계) 보유 스프라이트로 채운다(임시 — 추후 대체).
  const fallback = lastSprite(sorted)
  return sorted.map((s) => ({ ...s, sprite: s.sprite ?? fallback }))
}

// 모든 nameKey 가 주어진 로케일 키 집합에 존재하는지 확인한다(load-time 보장 + 테스트 대상).
export function assertNameKeysResolve(
  swords: readonly SwordData[],
  localeKeys: ReadonlySet<string>,
): void {
  for (const s of swords) {
    if (!localeKeys.has(s.nameKey))
      fail(
        `sword nameKey is missing from translation resources: ${s.nameKey} (+${s.level})`,
      )
  }
}

// 게임 시작 시 호출되는 로드 진입점.
// 번들된 데이터 파일을 검증해 SwordData[]로 만들고,
// 모든 nameKey 가 i18n 소스(ko)에 존재하는지 즉시 확인한다(누락 시 시작 단계에서 실패).
export function loadSwords(): SwordData[] {
  const swords = parseSwords(swordsRaw)
  assertNameKeysResolve(swords, new Set(Object.keys(ko)))
  return swords
}
