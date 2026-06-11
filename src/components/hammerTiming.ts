// 망치 내려치기 모션의 타이밍 도출(순수) — 컴포넌트(HammerStrike: 키프레임 times)와 GameScreen(효과
// durationMs·'캉' 사운드 지연)이 같은 함수를 써 단일 출처를 유지한다. react-refresh 규칙(컴포넌트 파일은
// 컴포넌트·상수만 export)을 지키려고 비-컴포넌트 함수는 이 별도 모듈에 둔다.
//
// 임팩트 시각(impactSec)은 데이터(animation.json hammerImpactMs)에서 오고, 윈드업·반동·정착·들어올림은
// 그 임팩트 기준 상대 오프셋(아래 상수)으로 둔다 — 임팩트 앵커만 데이터로, 모션 모양은 코드로. 데이터는
// import 시점에 로드돼 있지 않으므로(모듈 평가 < dataManager.load) 모듈 상수가 아니라 런타임 호출로 둔다.

const WINDUP_SEC = 0.14 // holdUntil→impact: 빠르게 내리꽂는 스냅 길이
const RECOIL_OFFSET = 0.09 // impact 후 반동 정점까지
const SETTLE_OFFSET = 0.16 // impact 후 정착까지
const LIFT_OFFSET = 0.4 // impact 후 들어올림까지(전체 모션 종료)
const TAIL_MS = 60 // 모션 종료 후 효과가 running 에서 빠질 때까지 여유(ShakeBurst 의 +60 관례)

export type HammerMotion = {
  impactSec: number
  holdUntil: number
  recoilAt: number
  settleAt: number
  motionSec: number
}

// 망치 모션의 시각들을 임팩트(초)에서 도출한다. 임팩트가 데이터(hammerImpactMs)에서 오므로 어떤 값이든
// 유효한 times 배열([0,1] 단조)을 내도록 방어한다 — 운영자가 임팩트를 윈드업(WINDUP_SEC)보다 짧게 두면
// holdUntil 이 음수가 돼 키프레임 times 가 비단조로 깨진다. 그 경우 윈드업(대기→스냅)을 0 길이로 접어
// (holdUntil=0) 임팩트로 바로 내리꽂게 한다(연출은 단조롭지만 깨지지 않는다). 기본값(360ms)에선 0.22.
export function computeHammerMotion(impactSec: number): HammerMotion {
  return {
    impactSec,
    holdUntil: Math.max(0, impactSec - WINDUP_SEC),
    recoilAt: impactSec + RECOIL_OFFSET,
    settleAt: impactSec + SETTLE_OFFSET,
    motionSec: impactSec + LIFT_OFFSET,
  }
}

// 연출 전체 길이(ms) — Effect 'hammerStrike' 의 durationMs + useOneShot 수명. GameScreen 이 impactMs 로 부른다.
export function hammerStrikeMs(impactMs: number): number {
  return (
    Math.round(computeHammerMotion(impactMs / 1000).motionSec * 1000) + TAIL_MS
  )
}
