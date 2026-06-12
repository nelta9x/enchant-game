import animationRaw from './sources/animation.json'
import type { AnimationConfig, ShakeBand } from './types'
import { isRecord, makeFail } from './validate'

// 데이터 파일(animation.json)을 검증해 AnimationConfig 로 만드는 로더(loadConfig 패턴 미러링).
//
// 원칙:
//  - 강화 연출의 "시퀀스 타이밍"(망치 임팩트 시점·떨림 길이 범위·재강화 가드)은 코드 상수가 아니라
//    별도 데이터 파일(JSON)에 둔다 — 요구사항: "연출 타이밍 관련 상수들은 별도의 데이터 파일로 관리".
//  - JSON 은 컴파일 타임 타입 보장이 없으므로 로드 시점에 런타임 검증으로 형태를 강제한다(잘못 편집된
//    JSON 이 조용히 이상 동작하지 않고 시작 단계에서 즉시 실패하게 한다).
//
// 데이터 vs 코드 경계: 이 파일이 담는 것은 강화 1회의 "언제"(시퀀스 마일스톤)뿐이다. 개별 파티클의
// 분출 반경·비행 시간(particles.ts), 떨림 키프레임 모양(shake.ts), 플로팅 텍스트 체공 길이
// (floatingText.ts) 같은 "모양/연출 디테일" 상수는 프레젠테이션 코드에 남긴다 — 운영자가 흔히 만지는
// 게임 호흡(타이밍)은 데이터로, 디자이너가 손대는 모션 디테일은 코드로 나눈다.
//
// parseAnimationConfig 는 순수 함수로 분리해 테스트 가능하게 두고, loadAnimation 이 번들 데이터의 진입점이다.

const fail: (msg: string) => never = makeFail('Animation config')

// 정수 >= 0 필드 1개를 검증해 반환한다(여러 타이밍 필드가 같은 제약이라 한 곳으로 모은다).
function intNonNeg(raw: Record<string, unknown>, key: string): number {
  const v = raw[key]
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0)
    fail(`${key} must be an integer >= 0 (got ${String(v)})`)
  return v as number
}

// 떨림 레벨 밴드 1구간 검증. maxLevel(상한, null=∞) + 떨림 범위(minMs <= maxMs, 정수 >= 0).
function parseShakeBand(raw: unknown, idx: number): ShakeBand {
  const where = `shakeBands[${idx}]`
  if (!isRecord(raw)) fail(`${where} must be an object`)

  // 밴드 컨텍스트(where)를 붙인 "정수 >= 0" 검증 헬퍼 — 에러 메시지로 어느 밴드·필드인지 즉시 알 수 있게.
  const fint = (key: string): number => {
    const v = raw[key]
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0)
      fail(`${where}.${key} must be an integer >= 0 (got ${String(v)})`)
    return v
  }

  // maxLevel: null(=∞, 마지막 밴드) 또는 정수 >= 1(레벨 1 미만 구간은 의미 없음).
  const maxLevel =
    raw.maxLevel === null
      ? null
      : (() => {
          const v = raw.maxLevel
          if (typeof v !== 'number' || !Number.isInteger(v) || v < 1)
            fail(
              `${where}.maxLevel must be an integer >= 1 or null (got ${String(v)})`,
            )
          return v
        })()

  const minMs = fint('minMs')
  const maxMs = fint('maxMs')
  if (minMs > maxMs)
    fail(`${where}.minMs must be <= maxMs (got ${minMs} > ${maxMs})`)

  return { maxLevel, minMs, maxMs }
}

// 순수 검증기: 임의 입력(unknown)을 검증된 AnimationConfig 로 변환한다.
export function parseAnimationConfig(raw: unknown): AnimationConfig {
  if (!isRecord(raw)) fail('animation root must be an object')

  const hammerImpactMs = intNonNeg(raw, 'hammerImpactMs')
  const hammerSnapMs = intNonNeg(raw, 'hammerSnapMs')
  const hammerHoldAfterMs = intNonNeg(raw, 'hammerHoldAfterMs')
  const hammerFadeoutMs = intNonNeg(raw, 'hammerFadeoutMs')
  const reEnhanceGuardMs = intNonNeg(raw, 'reEnhanceGuardMs')

  // shakeBands: 비어있지 않은 배열. 각 밴드는 parseShakeBand 로 검증.
  const rawBands = raw.shakeBands
  if (!Array.isArray(rawBands) || rawBands.length === 0)
    fail(
      'shakeBands must be a non-empty array (lowest level band = shakeBands[0])',
    )
  const shakeBands = rawBands.map((b, i) => parseShakeBand(b, i))

  // 커버리지 불변: 검 레벨 [1, ∞) 를 빈틈·겹침 없이 덮어야 한다(셀렉터가 maxLevel 만으로 담당 밴드를 고르는 전제).
  //  - maxLevel 은 엄격 증가(겹침·역순 금지). 비말단 밴드의 maxLevel 은 정수(null 금지).
  //  - 마지막 밴드만 maxLevel === null(=∞, 그 위 모든 레벨). 연속성은 "이전 maxLevel 다음 레벨부터"라
  //    별도 minLevel 없이 자동으로 보장된다(밴드 i 는 (이전 maxLevel, 이 maxLevel] 을 담당).
  for (let i = 0; i < shakeBands.length - 1; i += 1) {
    const cur = shakeBands[i].maxLevel
    if (cur === null)
      fail(
        `shakeBands[${i}].maxLevel must not be null (only the last band spans to infinity)`,
      )
    const next = shakeBands[i + 1].maxLevel
    if (next !== null && next <= cur)
      fail(
        `shakeBands[${i + 1}].maxLevel must be greater than shakeBands[${i}].maxLevel (ascending, no gap/overlap)`,
      )
  }
  if (shakeBands[shakeBands.length - 1].maxLevel !== null)
    fail('the last shakeBands entry maxLevel must be null (spans to infinity)')

  return {
    hammerImpactMs,
    hammerSnapMs,
    hammerHoldAfterMs,
    hammerFadeoutMs,
    reEnhanceGuardMs,
    shakeBands,
  }
}

// 게임 시작 시 호출되는 로드 진입점. 번들된 데이터 파일을 검증해 AnimationConfig 로 만든다.
export function loadAnimation(): AnimationConfig {
  return parseAnimationConfig(animationRaw)
}
