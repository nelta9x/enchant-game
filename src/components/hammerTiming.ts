// 망치 내려치기 모션의 타이밍 도출 + 본체 키프레임 타깃 조립(순수) — 컴포넌트(HammerStrike)와
// GameScreen(효과 durationMs·'캉' 사운드 지연)이 같은 함수를 써 단일 출처를 유지한다. react-refresh
// 규칙(컴포넌트 파일은 컴포넌트·상수만 export)을 지키려고 비-컴포넌트 함수는 이 별도 모듈에 둔다.
// 머리 잔상(스프라이트 모션 블러 스미어)은 키프레임이 아니라 본체 포즈 샘플링으로 그린다 — hammerTrail.ts 참고.
//
// 임팩트 시각(impactSec)과 모션의 "모양"(내려치는 스냅·정지·페이드아웃 길이)은 모두 데이터
// (animation.json: hammerImpactMs / hammerSnapMs / hammerHoldAfterMs / hammerFadeoutMs)에서 온다 —
// GameScreen 이 데이터를 HammerShape 로 조립해 흘려보낸다(임팩트는 ms, 모양은 초 단위). 데이터는
// import 시점에 로드돼 있지 않으므로(모듈 평가 < dataManager.load) 모듈 상수가 아니라 런타임 호출로 둔다.

import type { TargetAndTransition } from 'motion/react'

const TAIL_MS = 60 // 모션 종료 후 효과가 running 에서 빠질 때까지 여유(ShakeBurst 의 +60 관례)

// 망치 모션의 "모양"(임팩트 기준 상대 길이, 초). 호출부가 데이터에서 조립해 항상 넘긴다.
export type HammerShape = {
  snapSec: number // holdUntil→impact: 빠르게 내리꽂는 스냅(내려치기) 길이 — 윈드업 대기가 아니라 내려치는 동작 자체
  holdAfterSec: number // impact 직후 자세를 유지하는 정지 시간
  fadeoutSec: number // 정지 후 제자리에서 사라지는 페이드아웃 길이
}

export type HammerMotion = {
  impactSec: number
  holdUntil: number
  holdAfterEnd: number // impactSec + holdAfterSec — 정지 끝, 페이드아웃 시작 시각
  motionSec: number
}

// 망치 모션의 시각들을 임팩트(초) + 모양에서 도출한다. 임팩트가 데이터(hammerImpactMs)에서 오므로 어떤
// 값이든 유효한 times 배열([0,1] 단조)을 내도록 방어한다 — 운영자가 임팩트를 스냅(snapSec)보다 짧게
// 두면 holdUntil 이 음수가 돼 키프레임 times 가 비단조로 깨진다. 그 경우 윈드업 대기를 0 길이로 접어
// (holdUntil=0) 임팩트로 바로 내리꽂게 한다(연출은 단조롭지만 깨지지 않는다).
export function computeHammerMotion(
  impactSec: number,
  shape: HammerShape,
): HammerMotion {
  return {
    impactSec,
    holdUntil: Math.max(0, impactSec - shape.snapSec),
    holdAfterEnd: impactSec + shape.holdAfterSec,
    motionSec: impactSec + shape.holdAfterSec + shape.fadeoutSec,
  }
}

// 연출 전체 길이(ms) — Effect 'hammerStrike' 의 durationMs + useOneShot 수명. GameScreen 이 impactMs·모양으로 부른다.
export function hammerStrikeMs(impactMs: number, shape: HammerShape): number {
  return (
    Math.round(computeHammerMotion(impactMs / 1000, shape).motionSec * 1000) +
    TAIL_MS
  )
}

// 본체 망치의 키프레임 궤적(치켜듦→윈드업→스냅→임팩트 정지) — HammerStrike 가 모션 상수로 조립해 넘긴다.
export type StrikeGeom = {
  x: number[]
  y: number[]
  rotate: number[]
  scale: number[]
}

// 본체 망치의 키프레임 타깃 — 궤적(geom)에 타이밍(m)을 입힌다. 대기(0→holdUntil) → 스냅(→impact,
// easeIn 가속) → 제자리 정지·페이드아웃. opacity 는 궤적 곡선과 분리: 초반에 빠르게 켜 정지까지
// 유지하다 페이드아웃 구간에서 꺼진다.
export function strikeTarget(
  geom: StrikeGeom,
  m: HammerMotion,
): TargetAndTransition {
  const impactRatio = m.impactSec / m.motionSec
  return {
    ...geom,
    opacity: [0, 1, 1, 1, 0],
    transition: {
      duration: m.motionSec,
      times: [0, m.holdUntil / m.motionSec, impactRatio, 1],
      ease: ['easeInOut', 'easeIn', 'linear'],
      opacity: {
        duration: m.motionSec,
        times: [
          0,
          // 페이드인 지점(0.12)이 임팩트보다 늦으면 times 가 비단조가 돼(motion 거부) — 임팩트 비율로 클램프.
          Math.min(0.12, impactRatio),
          impactRatio,
          m.holdAfterEnd / m.motionSec,
          1,
        ],
        ease: 'easeOut' as const,
      },
    },
  }
}
