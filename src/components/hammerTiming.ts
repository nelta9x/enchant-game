// 망치 내려치기 모션의 타이밍 도출(순수) — 컴포넌트(HammerStrike: 키프레임 times)와 GameScreen(효과
// durationMs·'캉' 사운드 지연)이 같은 함수를 써 단일 출처를 유지한다. react-refresh 규칙(컴포넌트 파일은
// 컴포넌트·상수만 export)을 지키려고 비-컴포넌트 함수는 이 별도 모듈에 둔다.
//
// 임팩트 시각(impactSec)과 모션의 "모양"(윈드업 스냅·정지·페이드아웃 길이)은 모두 데이터
// (animation.json: hammerImpactMs / hammerWindupMs / hammerHoldAfterMs / hammerFadeoutMs)에서 온다 —
// GameScreen 이 데이터를 HammerShape 로 조립해 흘려보낸다(DEV 튜닝 패널은 그 위에 라이브로 덮어쓴다).
// DEFAULT_HAMMER_SHAPE 는 shape 를 넘기지 않는 호출(테스트 등)을 위한 폴백 기본값일 뿐이다. 데이터는
// import 시점에 로드돼 있지 않으므로(모듈 평가 < dataManager.load) 모듈 상수가 아니라 런타임 호출로 둔다.

const TAIL_MS = 60 // 모션 종료 후 효과가 running 에서 빠질 때까지 여유(ShakeBurst 의 +60 관례)

// 망치 모션의 "모양"(임팩트 기준 상대 길이, 초). 기본값은 눈으로 맞춘 코드 상수 — DEV 튜닝 패널이 덮어쓴다.
export type HammerShape = {
  windupSec: number // holdUntil→impact: 빠르게 내리꽂는 스냅 길이
  holdAfterSec: number // impact 직후 자세를 유지하는 정지 시간
  fadeoutSec: number // 정지 후 제자리에서 사라지는 페이드아웃 길이
}

export const DEFAULT_HAMMER_SHAPE: HammerShape = {
  windupSec: 0.14,
  holdAfterSec: 0.1,
  fadeoutSec: 0.12,
}

export type HammerMotion = {
  impactSec: number
  holdUntil: number
  holdAfterEnd: number // impactSec + holdAfterSec — 정지 끝, 페이드아웃 시작 시각
  motionSec: number
}

// 망치 모션의 시각들을 임팩트(초) + 모양에서 도출한다. 임팩트가 데이터(hammerImpactMs)에서 오므로 어떤
// 값이든 유효한 times 배열([0,1] 단조)을 내도록 방어한다 — 운영자가 임팩트를 윈드업(windupSec)보다 짧게
// 두면 holdUntil 이 음수가 돼 키프레임 times 가 비단조로 깨진다. 그 경우 윈드업(대기→스냅)을 0 길이로 접어
// (holdUntil=0) 임팩트로 바로 내리꽂게 한다(연출은 단조롭지만 깨지지 않는다).
export function computeHammerMotion(
  impactSec: number,
  shape: HammerShape = DEFAULT_HAMMER_SHAPE,
): HammerMotion {
  return {
    impactSec,
    holdUntil: Math.max(0, impactSec - shape.windupSec),
    holdAfterEnd: impactSec + shape.holdAfterSec,
    motionSec: impactSec + shape.holdAfterSec + shape.fadeoutSec,
  }
}

// 연출 전체 길이(ms) — Effect 'hammerStrike' 의 durationMs + useOneShot 수명. GameScreen 이 impactMs·모양으로 부른다.
export function hammerStrikeMs(
  impactMs: number,
  shape: HammerShape = DEFAULT_HAMMER_SHAPE,
): number {
  return (
    Math.round(computeHammerMotion(impactMs / 1000, shape).motionSec * 1000) +
    TAIL_MS
  )
}
