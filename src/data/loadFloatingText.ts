import floatingTextRaw from '../../public/data/floatingText.json'
import { ko, type TranslationKey } from '../i18n/locales/ko'
import type { FloatingTextData, FloatingTextEntry } from './types'
import { isRecord, makeFail } from './validate'

// 데이터 파일(floatingText.json)을 검증해 FloatingTextData 로 만드는 로더(loadItems 패턴 미러링).
//
// 원칙:
//  - 연출 문구 후보는 코드 상수가 아니라 별도 데이터 파일(JSON)에 둔다(이벤트 타이밍 키 → 후보 목록).
//  - 문구는 데이터에 박지 않고 i18n 키(text)로 두어 표시 시점에 t()로 해석한다(검 nameKey 패턴 미러).
//  - JSON 은 컴파일 타임 타입 보장이 없으므로 로드 시점에 런타임 검증으로 형태를 강제한다.
//
// parseFloatingText / assertFloatingTextKeysResolve 는 순수 함수로 분리해 테스트 가능하게 두고,
// loadFloatingText 가 번들 데이터와 i18n 소스를 묶는 진입점이다.

const fail: (msg: string) => never = makeFail('Floating text data')

function parseEntry(raw: unknown, eventKey: string): FloatingTextEntry {
  if (!isRecord(raw)) fail(`[${eventKey}] entry is not an object`)

  const text = raw.text
  if (typeof text !== 'string' || text.length === 0)
    fail(`[${eventKey}] entry text must be a non-empty string`)

  const weight = raw.weight
  if (typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0)
    fail(
      `[${eventKey}] entry weight must be a finite number > 0 (got ${String(weight)})`,
    )

  // text 가 실제 i18n 키인지는 assertFloatingTextKeysResolve 에서 검증한다.
  return { text: text as TranslationKey, weight }
}

// 순수 검증기: 임의 입력(unknown)을 검증된 FloatingTextData 로 변환한다.
// 루트는 "이벤트 키 → 엔트리 배열" 객체. 빈 배열은 통과(아직 안 채운 슬롯 = 미표시).
export function parseFloatingText(raw: unknown): FloatingTextData {
  if (!isRecord(raw)) fail('floating text data root must be an object')

  const out: FloatingTextData = {}
  for (const [eventKey, entries] of Object.entries(raw)) {
    if (!Array.isArray(entries))
      fail(`[${eventKey}] value must be an array of entries`)
    out[eventKey] = entries.map((e) => parseEntry(e, eventKey))
  }
  return out
}

// 모든 text 키가 주어진 로케일 키 집합에 존재하는지 확인한다(load-time 보장 + 테스트 대상).
export function assertFloatingTextKeysResolve(
  data: FloatingTextData,
  localeKeys: ReadonlySet<string>,
): void {
  for (const [eventKey, entries] of Object.entries(data)) {
    for (const entry of entries) {
      if (!localeKeys.has(entry.text))
        fail(
          `floating text key is missing from translation resources: ${entry.text} (${eventKey})`,
        )
    }
  }
}

// 게임 시작 시 호출되는 로드 진입점. 번들된 데이터 파일을 검증해 FloatingTextData 로 만들고,
// 모든 문구 키가 i18n 소스(ko)에 존재하는지 즉시 확인한다(누락 시 시작 단계에서 실패).
export function loadFloatingText(): FloatingTextData {
  const data = parseFloatingText(floatingTextRaw)
  assertFloatingTextKeysResolve(data, new Set(Object.keys(ko)))
  return data
}
