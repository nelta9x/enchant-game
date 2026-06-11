import itemsRaw from './sources/items.json'
import { ko, type TranslationKey } from '../i18n/locales/ko'
import type { ItemData } from './types'
import { isRecord, makeFail } from './validate'

// 데이터 파일(items.json)을 검증해 ItemData[]로 만드는 로더(loadSwords/loadShop 패턴 미러링).
//
// 원칙:
//  - 아이템 카탈로그는 코드 상수가 아니라 별도 데이터 파일(JSON)에 둔다.
//  - 표시명은 데이터에 박지 않고 id → i18n 키(item.<id>)로 파생한다.
//  - JSON은 컴파일 타임 타입 보장이 없으므로 로드 시점에 런타임 검증으로 형태를 강제한다.
//
// parseItems / assertItemNameKeysResolve 는 순수 함수로 분리해 테스트 가능하게 두고,
// loadItems 가 번들 데이터와 i18n 소스를 묶는 진입점이다.

const fail: (msg: string) => never = makeFail('Item data')

function parseItem(raw: unknown): ItemData {
  if (!isRecord(raw)) fail('item is not an object')

  const id = raw.id
  if (typeof id !== 'string' || id.length === 0)
    fail('item id must be a non-empty string')

  const basePrice = raw.basePrice
  if (
    typeof basePrice !== 'number' ||
    !Number.isFinite(basePrice) ||
    basePrice < 0
  )
    fail(
      `[${id}] basePrice must be a finite number >= 0 (got ${String(basePrice)})`,
    )

  // 전용 스프라이트 파일명(선택). 없으면 null — ItemIcon 이 토큰 아이콘으로 폴백한다.
  let sprite: string | null = null
  if (raw.sprite !== null && raw.sprite !== undefined) {
    if (typeof raw.sprite !== 'string' || raw.sprite.length === 0)
      fail(`[${id}] sprite must be a non-empty string`)
    sprite = raw.sprite
  }

  // 표시명은 데이터에 박지 않는다 — id 로부터 i18n 키를 파생한다.
  // (키가 실제 리소스에 존재하는지는 assertItemNameKeysResolve 에서 검증한다.)
  const nameKey = `item.${id}` as TranslationKey

  return { id, basePrice, nameKey, sprite }
}

// 순수 검증기: 임의 입력(unknown)을 검증된 ItemData[]로 변환한다. 구조 검증 + id 중복 검사.
export function parseItems(raw: unknown): ItemData[] {
  if (!Array.isArray(raw)) fail('item data root must be an array')
  const parsed = raw.map(parseItem)

  const seen = new Set<string>()
  for (const item of parsed) {
    if (seen.has(item.id)) fail(`duplicate item id: ${item.id}`)
    seen.add(item.id)
  }

  return parsed
}

// 모든 nameKey 가 주어진 로케일 키 집합에 존재하는지 확인한다(load-time 보장 + 테스트 대상).
export function assertItemNameKeysResolve(
  items: readonly ItemData[],
  localeKeys: ReadonlySet<string>,
): void {
  for (const item of items) {
    if (!localeKeys.has(item.nameKey))
      fail(
        `item nameKey is missing from translation resources: ${item.nameKey} (${item.id})`,
      )
  }
}

// 게임 시작 시 호출되는 로드 진입점. 번들된 데이터 파일을 검증해 ItemData[]로 만들고,
// 모든 nameKey 가 i18n 소스(ko)에 존재하는지 즉시 확인한다(누락 시 시작 단계에서 실패).
export function loadItems(): ItemData[] {
  const items = parseItems(itemsRaw)
  assertItemNameKeysResolve(items, new Set(Object.keys(ko)))
  return items
}
