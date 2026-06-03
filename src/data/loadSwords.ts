import swordsRaw from './sources/swords.json'
import { ko, type TranslationKey } from '../i18n/locales/ko'
import type { Material, SwordData, SwordNote } from './types'

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

// itemId 가 재료로 쓰이는 '검'을 가리키는 경우의 패턴: sword_<level>_<slug>
const SWORD_MATERIAL_RE = /^sword_(\d+)_/

// 스프라이트 폴백 적용 전의 중간 표현(sprite 가 아직 null 일 수 있음).
type ParsedSword = Omit<SwordData, 'sprite'> & { sprite: string | null }

function fail(msg: string): never {
  throw new Error(`검 데이터 검증 실패: ${msg}`)
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function parseMaterial(raw: unknown, ctx: string): Material {
  if (!isRecord(raw)) fail(`${ctx} enhanceCost가 객체가 아닙니다`)
  const kind = raw.kind
  if (kind === 'gold') {
    const amount = raw.amount
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0)
      fail(`${ctx} gold amount는 양수여야 합니다 (got ${String(amount)})`)
    return { kind: 'gold', amount }
  }
  if (kind === 'item') {
    const itemId = raw.itemId
    const count = raw.count
    if (typeof itemId !== 'string' || itemId.length === 0)
      fail(`${ctx} item itemId가 비어 있습니다`)
    if (typeof count !== 'number' || !Number.isInteger(count) || count <= 0)
      fail(`${ctx} item count는 양의 정수여야 합니다 (got ${String(count)})`)
    return { kind: 'item', itemId, count }
  }
  if (kind === 'free') return { kind: 'free' }
  fail(`${ctx} 알 수 없는 enhanceCost kind: ${String(kind)}`)
}

function parseNotes(raw: unknown, ctx: string): SwordNote[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) fail(`${ctx} notes는 배열이어야 합니다`)
  return raw.map((n) => {
    if (typeof n !== 'string' || !SWORD_NOTES.includes(n as SwordNote))
      fail(`${ctx} 알 수 없는 note: ${String(n)}`)
    return n as SwordNote
  })
}

function parseSword(raw: unknown): ParsedSword {
  if (!isRecord(raw)) fail('검 항목이 객체가 아닙니다')
  const level = raw.level
  if (typeof level !== 'number' || !Number.isInteger(level) || level < 0)
    fail(`level은 0 이상 정수여야 합니다 (got ${String(level)})`)
  const ctx = `[+${level}]`

  // enhanceCost / successRate 는 둘 다 null 이면 최종 단계(terminal)다.
  // 한쪽만 null 이면 데이터 오류로 본다.
  const costNull = raw.enhanceCost === null
  const rateNull = raw.successRate === null
  if (costNull !== rateNull)
    fail(
      `${ctx} enhanceCost와 successRate는 함께 null(최종 단계)이거나 함께 값이어야 합니다`,
    )

  const enhanceCost = costNull ? null : parseMaterial(raw.enhanceCost, ctx)

  let successRate: number | null = null
  if (!rateNull) {
    const r = raw.successRate
    if (typeof r !== 'number' || !Number.isFinite(r) || r < 0 || r > 1)
      fail(`${ctx} successRate는 0~1 범위여야 합니다 (got ${String(r)})`)
    successRate = r
  }

  let sellPrice: number | null = null
  if (raw.sellPrice !== null && raw.sellPrice !== undefined) {
    const s = raw.sellPrice
    if (typeof s !== 'number' || !Number.isFinite(s) || s < 0)
      fail(
        `${ctx} sellPrice는 0 이상이거나 null이어야 합니다 (got ${String(s)})`,
      )
    sellPrice = s
  }

  let protectionTickets: number | 'disabled'
  if (raw.protectionTickets === 'disabled') {
    protectionTickets = 'disabled'
  } else {
    const p = raw.protectionTickets
    if (typeof p !== 'number' || !Number.isInteger(p) || p < 0)
      fail(
        `${ctx} protectionTickets는 0 이상 정수 또는 'disabled'여야 합니다 (got ${String(p)})`,
      )
    protectionTickets = p
  }

  let dropItemOnFail: string | null = null
  if (raw.dropItemOnFail !== null && raw.dropItemOnFail !== undefined) {
    const d = raw.dropItemOnFail
    if (typeof d !== 'string' || d.length === 0)
      fail(
        `${ctx} dropItemOnFail는 비어 있지 않은 문자열 또는 null이어야 합니다`,
      )
    dropItemOnFail = d
  }

  // 전용 스프라이트 파일명(선택). 없으면 null — parseSwords 에서 폴백을 채운다.
  let sprite: string | null = null
  if (raw.sprite !== null && raw.sprite !== undefined) {
    if (typeof raw.sprite !== 'string' || raw.sprite.length === 0)
      fail(`${ctx} sprite는 비어 있지 않은 문자열이어야 합니다`)
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
    dropItemOnFail,
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
  if (!Array.isArray(raw)) fail('검 데이터 루트는 배열이어야 합니다')
  const parsed = raw.map(parseSword)

  const levels = new Set<number>()
  for (const s of parsed) {
    if (levels.has(s.level)) fail(`중복된 단계: +${s.level}`)
    levels.add(s.level)
  }

  // 재료검 참조 무결성: itemId 가 sword_<level>_* 형태면 그 단계 검이 존재해야 한다.
  // (잡템 itemId 는 아이템 카탈로그가 생기는 스프린트에서 검증한다.)
  for (const s of parsed) {
    if (s.enhanceCost?.kind === 'item') {
      const m = SWORD_MATERIAL_RE.exec(s.enhanceCost.itemId)
      if (m && !levels.has(Number(m[1])))
        fail(
          `+${s.level} 강화 재료가 존재하지 않는 검 단계를 참조합니다: ${s.enhanceCost.itemId}`,
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
      fail(`검 nameKey가 번역 리소스에 없습니다: ${s.nameKey} (+${s.level})`)
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
