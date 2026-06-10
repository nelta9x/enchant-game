import shopRaw from './sources/shop.json'
import type { ShopItem } from './types'
import { parseMaterial } from './loadSwords'

// 데이터 파일(shop.json)을 검증해 ShopItem[]로 만드는 로더(loadSwords 패턴 미러링).
//
// 원칙:
//  - 상점 카탈로그는 코드 상수가 아니라 별도 데이터 파일(JSON)에 둔다.
//  - JSON은 컴파일 타임 타입 보장이 없으므로 로드 시점에 런타임 검증으로 형태를 강제한다.
//  - 가격(price)은 검 enchantCost 와 같은 Material 모델을 재사용한다(parseMaterial 공유).
//  - 표시명 검증(itemId → i18n 키 해석 가능 여부)은 하지 않는다 — 표시명 무결성은
//    DataManager 시드 테스트가 강제한다(현재는 구조 검증만).
//
// parseShop 은 순수 함수로 분리해 테스트 가능하게 두고, loadShop 이 번들 데이터의 진입점이다.

function fail(msg: string): never {
  throw new Error(`Shop data validation failed: ${msg}`)
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function parseShopItem(raw: unknown): ShopItem {
  if (!isRecord(raw)) fail('shop item is not an object')

  const id = raw.id
  if (typeof id !== 'string' || id.length === 0)
    fail('shop item id must be a non-empty string')

  const itemId = raw.itemId
  if (typeof itemId !== 'string' || itemId.length === 0)
    fail(`[${id}] shop item itemId must be a non-empty string`)

  // 가격은 Material(gold / item / free) — 검 비용 파서를 재사용한다.
  const price = parseMaterial(raw.price, `[shop ${id}]`)

  return { id, itemId, price }
}

// 순수 검증기: 임의 입력(unknown)을 검증된 ShopItem[]로 변환한다.
// 구조 검증 + 항목 id(SKU) 중복 검사를 거친다.
export function parseShop(raw: unknown): ShopItem[] {
  if (!Array.isArray(raw)) fail('shop data root must be an array')
  const parsed = raw.map(parseShopItem)

  const seen = new Set<string>()
  for (const item of parsed) {
    if (seen.has(item.id)) fail(`duplicate shop item id: ${item.id}`)
    seen.add(item.id)
  }

  return parsed
}

// 게임 시작 시 호출되는 로드 진입점. 번들된 데이터 파일을 검증해 ShopItem[]로 만든다.
export function loadShop(): ShopItem[] {
  return parseShop(shopRaw)
}
