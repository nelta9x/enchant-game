import animationRaw from './sources/animation.json'
import type { AnimationConfig } from './types'

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

function fail(msg: string): never {
  throw new Error(`Animation config validation failed: ${msg}`)
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// 정수 >= 0 필드 1개를 검증해 반환한다(여러 타이밍 필드가 같은 제약이라 한 곳으로 모은다).
function intNonNeg(raw: Record<string, unknown>, key: string): number {
  const v = raw[key]
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0)
    fail(`${key} must be an integer >= 0 (got ${String(v)})`)
  return v as number
}

// 순수 검증기: 임의 입력(unknown)을 검증된 AnimationConfig 로 변환한다.
export function parseAnimationConfig(raw: unknown): AnimationConfig {
  if (!isRecord(raw)) fail('animation root must be an object')

  const hammerImpactMs = intNonNeg(raw, 'hammerImpactMs')
  const weaponShakeMinMs = intNonNeg(raw, 'weaponShakeMinMs')
  const weaponShakeMaxMs = intNonNeg(raw, 'weaponShakeMaxMs')
  const reEnhanceGuardMs = intNonNeg(raw, 'reEnhanceGuardMs')

  // 범위의 하한이 상한을 넘으면 떨림 시간 무작위 추출이 불가능하다 — 형태 오류로 즉시 실패시킨다.
  if (weaponShakeMinMs > weaponShakeMaxMs)
    fail(
      `weaponShakeMinMs must be <= weaponShakeMaxMs (got ${weaponShakeMinMs} > ${weaponShakeMaxMs})`,
    )

  return {
    hammerImpactMs,
    weaponShakeMinMs,
    weaponShakeMaxMs,
    reEnhanceGuardMs,
  }
}

// 게임 시작 시 호출되는 로드 진입점. 번들된 데이터 파일을 검증해 AnimationConfig 로 만든다.
export function loadAnimation(): AnimationConfig {
  return parseAnimationConfig(animationRaw)
}
