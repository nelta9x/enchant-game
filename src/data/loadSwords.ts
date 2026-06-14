import swordsRaw from './sources/swords.json'
import { ko, type TranslationKey } from '../i18n/locales/ko'
import type { Drop, Material, SwordData, SwordNote } from './types'
import { isRecord, makeFail } from './validate'

// 데이터 파일(swords.json)을 검증해 SwordData[]로 만드는 로더.
//
// 원칙:
//  - 데이터는 코드 상수가 아니라 별도 데이터 파일(JSON)에 둔다.
//  - 표시명은 데이터에 박지 않고 level → i18n 키(sword.<level>.name)로 파생한다.
//  - JSON은 컴파일 타임 타입 보장이 없으므로, 로드 시점에 런타임 검증으로 형태를 강제한다.
//
// parseSwords / assertNameKeysResolve 는 순수 함수로 분리해 테스트 가능하게 두고,
// loadSwords 가 번들된 데이터와 i18n 소스를 묶는 진입점이다.

const SWORD_NOTES: readonly SwordNote[] = ['storable']

// 스프라이트 폴백 적용 전의 중간 표현(sprite 가 아직 null 일 수 있음).
type ParsedSword = Omit<SwordData, 'sprite'> & { sprite: string | null }

const fail: (msg: string) => never = makeFail('Sword data')

// Material(가격/비용) 검증 전용 실패 — 검 enchantCost·상점 price 가 공유하므로 중립 접두사를 쓴다.
const failMaterial: (msg: string) => never = makeFail('Material')

// 임의 입력을 Material(gold / item / free)로 검증한다. ctx 는 에러 문맥 라벨.
// 검 enchantCost 와 상점 price 가 공유하는 언어 중립 가격 모델 파서다.
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

// 가중치 필드(헛방/파괴) 검증 — 생략 시 기본값, 제공 시 비음 정수만 허용한다.
function parseWeight(
  raw: unknown,
  ctx: string,
  field: string,
  fallback: number,
): number {
  if (raw === undefined || raw === null) return fallback
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0)
    fail(`${ctx} ${field} must be a non-negative integer (got ${String(raw)})`)
  return raw
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

  // 검 식별자(= 인벤토리 itemId). 검은 이 id로 조회한다(레벨 파싱 없음).
  const id = raw.id
  if (typeof id !== 'string' || id.length === 0)
    fail(`${ctx} id must be a non-empty string`)

  // 강화 성공 시 되는 검 id. null = 최종 단계(다음 없음). 체인 무결성은 parseSwords에서 검증.
  let nextId: string | null = null
  if (raw.nextId !== null && raw.nextId !== undefined) {
    if (typeof raw.nextId !== 'string' || raw.nextId.length === 0)
      fail(`${ctx} nextId must be a non-empty string or null`)
    nextId = raw.nextId
  }

  // enchantCost / successRate 는 둘 다 null 이면 최종 단계(terminal)다.
  // 한쪽만 null 이면 데이터 오류로 본다.
  const costNull = raw.enchantCost === null
  const rateNull = raw.successRate === null
  if (costNull !== rateNull)
    fail(
      `${ctx} enchantCost and successRate must both be null (terminal) or both be set`,
    )

  const enchantCost = costNull ? null : parseMaterial(raw.enchantCost, ctx)

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

  // 강화 실패 시 헛방(파괴 없는 실패) vs 파괴를 가르는 가중치. 생략 시 기본값(헛방 0 / 파괴 1)은
  // 기존 동작("실패 = 파괴")을 보존한다 — 헛방을 쓰려면 데이터에서 명시적으로 weight 를 켠다.
  const whiffWeight = parseWeight(raw.whiffWeight, ctx, 'whiffWeight', 0)
  const destroyWeight = parseWeight(raw.destroyWeight, ctx, 'destroyWeight', 1)
  // 강화 가능한 검은 실패 시 적어도 하나의 결과가 가능해야 한다(둘 다 0 = 추첨 불가 데이터 오류).
  if (!rateNull && whiffWeight + destroyWeight <= 0)
    fail(`${ctx} whiffWeight + destroyWeight must be > 0 for an enhanceable sword`)

  // 파괴 시 드랍될 수 있는 후보 목록. 누락/null = [](드랍 없음). 후보마다 itemId/count 를 검증하고,
  // chance(엔트리별 독립 추첨 확률)는 생략 시 1(항상 드랍), 제공 시 (0, 1] 만 허용한다.
  let dropOnFail: Drop[] = []
  if (raw.dropOnFail !== null && raw.dropOnFail !== undefined) {
    if (!Array.isArray(raw.dropOnFail))
      fail(`${ctx} dropOnFail must be an array or null`)
    dropOnFail = raw.dropOnFail.map((d, i): Drop => {
      const dctx = `${ctx} dropOnFail[${i}]`
      if (!isRecord(d)) fail(`${dctx} must be an object`)
      const itemId = d.itemId
      if (typeof itemId !== 'string' || itemId.length === 0)
        fail(`${dctx} itemId must be a non-empty string`)
      const count = d.count
      if (typeof count !== 'number' || !Number.isInteger(count) || count <= 0)
        fail(`${dctx} count must be a positive integer (got ${String(count)})`)
      let chance = 1
      if (d.chance !== undefined) {
        const c = d.chance
        if (typeof c !== 'number' || !Number.isFinite(c) || c <= 0 || c > 1)
          fail(`${dctx} chance must be within (0, 1] (got ${String(c)})`)
        chance = c
      }
      return { itemId, count, chance }
    })
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
    id,
    nextId,
    level,
    nameKey,
    enchantCost,
    successRate,
    sellPrice,
    protectionTickets,
    whiffWeight,
    destroyWeight,
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
  const ids = new Set<string>()
  for (const s of parsed) {
    if (levels.has(s.level)) fail(`duplicate stage: +${s.level}`)
    levels.add(s.level)
    if (ids.has(s.id)) fail(`duplicate sword id: ${s.id}`)
    ids.add(s.id)
  }

  // 진행 체인 무결성: nextId 는 null(최종 단계)이거나 실재하는 검 id 를 가리켜야 한다.
  // (검 재료 itemId 오타 검증은 검과 잡템이 itemId 네임스페이스를 공유해 패턴으로 구분할 수 없으므로
  //  여기서 하지 않는다 — 아이템 카탈로그 스프린트에서 전체 itemId 를 검증하며 그쪽으로 이관한다.)
  for (const s of parsed) {
    if (s.nextId !== null && !ids.has(s.nextId))
      fail(`${s.id} nextId references a non-existent sword: ${s.nextId}`)
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
