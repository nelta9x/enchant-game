import configRaw from './sources/config.json'
import type { GameConfig } from './types'

// 데이터 파일(config.json)을 검증해 GameConfig 로 만드는 로더(loadCommission 패턴 미러링).
//
// 원칙:
//  - 게임플레이 튜닝 값(강화 입력 딜레이 등)은 코드 상수가 아니라 별도 데이터 파일(JSON)에 둔다.
//  - JSON 은 컴파일 타임 타입 보장이 없으므로 로드 시점에 런타임 검증으로 형태를 강제한다(잘못 편집된
//    JSON 이 조용히 이상 동작하지 않고 시작 단계에서 즉시 실패하게 한다).
//
// parseGameConfig 는 순수 함수로 분리해 테스트 가능하게 두고, loadConfig 가 번들 데이터의 진입점이다.

function fail(msg: string): never {
  throw new Error(`Game config validation failed: ${msg}`)
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// 순수 검증기: 임의 입력(unknown)을 검증된 GameConfig 로 변환한다.
// enhanceDelayMs 는 입력 잠금 길이(ms)라 정수 >= 0 만 강제한다(0 = 딜레이 없음). 참고(강제하지 않음):
// 떨림/등장 억제 창(~400ms)보다 짧게 두면 잠금이 그 창보다 먼저 풀려 새 검 등장이 깜빡일 수 있으니,
// 작은 값은 그 트레이드오프를 알고 쓰는 운영자 선택으로 본다.
export function parseGameConfig(raw: unknown): GameConfig {
  if (!isRecord(raw)) fail('config root must be an object')

  const enhanceDelayMs = raw.enhanceDelayMs
  if (
    typeof enhanceDelayMs !== 'number' ||
    !Number.isInteger(enhanceDelayMs) ||
    enhanceDelayMs < 0
  )
    fail(
      `enhanceDelayMs must be an integer >= 0 (got ${String(enhanceDelayMs)})`,
    )

  return { enhanceDelayMs }
}

// 게임 시작 시 호출되는 로드 진입점. 번들된 데이터 파일을 검증해 GameConfig 로 만든다.
export function loadConfig(): GameConfig {
  return parseGameConfig(configRaw)
}
