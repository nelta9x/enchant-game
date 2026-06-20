import animationRaw from '../../public/data/animation.json'
import type { AnimationConfig } from './types'
import { isRecord, makeFail } from './validate'

// 데이터 파일(animation.json)을 검증해 AnimationConfig 로 만드는 로더(loadConfig 패턴 미러링).
//
// 원칙:
//  - 강화 연출의 "시퀀스 타이밍"(망치 임팩트 시점·재강화 가드)은 코드 상수가 아니라 별도 데이터
//    파일(JSON)에 둔다 — 요구사항: "연출 타이밍 관련 상수들은 별도의 데이터 파일로 관리". 떨림 길이는
//    결과별로 검 데이터(swords.json 의 SwordData.shake)에 두므로 여기(animation.json) 소관이 아니다.
//  - JSON 은 컴파일 타임 타입 보장이 없으므로 로드 시점에 런타임 검증으로 형태를 강제한다(잘못 편집된
//    JSON 이 조용히 이상 동작하지 않고 시작 단계에서 즉시 실패하게 한다).
//
// 데이터 vs 코드 경계: 이 파일이 담는 것은 강화 1회의 "언제"(시퀀스 마일스톤)와 "어디에 닿는가"
// (hammerFaceOffset — 폭발이 붙는 망치 스프라이트 지점)뿐이다. 개별 파티클의 분출 반경·비행 시간
// (particles.ts), 떨림 키프레임 모양(shake.ts), 플로팅 텍스트 체공 길이(floatingText.ts) 같은
// "모양/연출 디테일" 상수는 프레젠테이션 코드에 남긴다 — 운영자가 흔히 만지는 게임 호흡(타이밍)과
// 접점은 데이터로, 디자이너가 손대는 모션 디테일은 코드로 나눈다.
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

// 불리언 필드 1개를 검증해 반환한다(연출 on/off 플래그 — 누락도 실패: 플래그가 데이터에 항상 명시되게).
function boolField(raw: Record<string, unknown>, key: string): boolean {
  const v = raw[key]
  if (typeof v !== 'boolean')
    fail(`${key} must be a boolean (got ${String(v)})`)
  return v
}

// 임팩트 접점(hammerFaceOffset) 검증 — 스프라이트 공간 px 오프셋이라 부호 제약 없는 유한 수 {x, y}.
function parseFaceOffset(raw: unknown): { x: number; y: number } {
  if (!isRecord(raw)) fail('hammerFaceOffset must be an object { x, y }')
  const fnum = (key: 'x' | 'y'): number => {
    const v = raw[key]
    if (typeof v !== 'number' || !Number.isFinite(v))
      fail(`hammerFaceOffset.${key} must be a finite number (got ${String(v)})`)
    return v
  }
  return { x: fnum('x'), y: fnum('y') }
}

// 파티클 풀 사전 확보 수 검증 — 세 풀(도트·불티·불혀) 모두 정수 >= 0(0 = 사전 확보 없이 lazily 성장).
function parsePoolReserve(raw: unknown): {
  dots: number
  hitSparks: number
  hitLicks: number
} {
  if (!isRecord(raw))
    fail('particlePoolReserve must be an object { dots, hitSparks, hitLicks }')
  const fint = (key: 'dots' | 'hitSparks' | 'hitLicks'): number => {
    const v = raw[key]
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0)
      fail(
        `particlePoolReserve.${key} must be an integer >= 0 (got ${String(v)})`,
      )
    return v
  }
  return {
    dots: fint('dots'),
    hitSparks: fint('hitSparks'),
    hitLicks: fint('hitLicks'),
  }
}

// 순수 검증기: 임의 입력(unknown)을 검증된 AnimationConfig 로 변환한다.
export function parseAnimationConfig(raw: unknown): AnimationConfig {
  if (!isRecord(raw)) fail('animation root must be an object')

  const hammerImpactMs = intNonNeg(raw, 'hammerImpactMs')
  const hammerSnapMs = intNonNeg(raw, 'hammerSnapMs')
  const hammerHoldAfterMs = intNonNeg(raw, 'hammerHoldAfterMs')
  const hammerFadeoutMs = intNonNeg(raw, 'hammerFadeoutMs')
  const hammerFaceOffset = parseFaceOffset(raw.hammerFaceOffset)
  const reEnhanceGuardMs = intNonNeg(raw, 'reEnhanceGuardMs')
  // 연출 on/off 플래그(types.ts 의 AnimationConfig 주석 참고 — 순수 프레젠테이션 게이트).
  const enhanceParticlesEnabled = boolField(raw, 'enhanceParticlesEnabled')
  const hammerSwingEnabled = boolField(raw, 'hammerSwingEnabled')
  const hammerSmearEnabled = boolField(raw, 'hammerSmearEnabled')

  // 파티클 풀 사전 확보 수(도트·불티·불혀) — 시작 시 풀을 미리 채워 첫 버스트 객체 할당을 없앤다.
  const particlePoolReserve = parsePoolReserve(raw.particlePoolReserve)

  return {
    hammerImpactMs,
    hammerSnapMs,
    hammerHoldAfterMs,
    hammerFadeoutMs,
    hammerFaceOffset,
    reEnhanceGuardMs,
    enhanceParticlesEnabled,
    hammerSwingEnabled,
    hammerSmearEnabled,
    particlePoolReserve,
  }
}

// 게임 시작 시 호출되는 로드 진입점. 번들된 데이터 파일을 검증해 AnimationConfig 로 만든다.
export function loadAnimation(): AnimationConfig {
  return parseAnimationConfig(animationRaw)
}
