import shopRaw from './sources/shop.json'
import type { ShopItem } from './types'

// 데이터 파일(shop.json)을 검증해 ShopItem[]로 만드는 로더(loadSwords 패턴 미러링).
//
// 원칙:
//  - 상점 카탈로그는 코드 상수가 아니라 별도 데이터 파일(JSON)에 둔다.
//  - JSON은 컴파일 타임 타입 보장이 없으므로 로드 시점에 런타임 검증으로 형태를 강제한다.
//  - 표시명 검증(itemId → i18n 키 해석 가능 여부)은 하지 않는다 — 아이템 카탈로그 전반의
//    itemId 무결성 검증은 카탈로그가 도입되는 스프린트에서 일괄로 다룬다(현재는 구조 검증만).
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

  const itemId = raw.itemId
  if (typeof itemId !== 'string' || itemId.length === 0)
    fail('shop item itemId must be a non-empty string')

  const price = raw.price
  if (typeof price !== 'number' || !Number.isInteger(price) || price <= 0)
    fail(`[${itemId}] price must be a positive integer (got ${String(price)})`)

  return { itemId, price }
}

// 순수 검증기: 임의 입력(unknown)을 검증된 ShopItem[]로 변환한다.
// 구조 검증 + itemId 중복 검사를 거친다.
export function parseShop(raw: unknown): ShopItem[] {
  if (!Array.isArray(raw)) fail('shop data root must be an array')
  const parsed = raw.map(parseShopItem)

  const seen = new Set<string>()
  for (const item of parsed) {
    if (seen.has(item.itemId)) fail(`duplicate shop item: ${item.itemId}`)
    seen.add(item.itemId)
  }

  return parsed
}

// 게임 시작 시 호출되는 로드 진입점. 번들된 데이터 파일을 검증해 ShopItem[]로 만든다.
export function loadShop(): ShopItem[] {
  return parseShop(shopRaw)
}
