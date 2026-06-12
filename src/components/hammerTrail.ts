import type { TargetAndTransition } from 'motion/react'
import type { HammerMotion } from './hammerTiming'

// 망치 머리 "스프라이트 모션 블러"(흰 잔상 스미어) 연출 설정·계산(프레젠테이션 전용·순수). 내려치는 스냅
// (HOLD→IMPACT) 동안, 망치 스프라이트의 흰 실루엣을 같은 궤적 위에 아주 조금씩 늦게 여러 겹 겹친다 —
// 머리쪽(가까운 겹)은 망치 형상이 또렷하고, 꼬리로 갈수록(먼 겹) 더 흐리게·더 옅게 번져 하나의 흐릿한
// 스미어로 녹는다. 즉 잔상의 "머리 부분"은 스프라이트와 같은 형상이고, 뒤로 갈수록 모션 블러가 된다.
//
// 윈드업(거의 정지) 구간엔 본체와 겹쳐 한 덩어리로 보이고, 빠른 스냅에서만 부채처럼 퍼져 잔상이 된다
// (느린 곳에선 자연히 안 보임). 본체(또렷한 컬러 망치) 뒤에 깔아, 겹칠 땐 본체가 덮고 스냅에서 빠져나온
// 부분만 흰 잔상으로 남는다.
//
// 컴포넌트(HammerStrike)는 라이프사이클(컨트롤·렌더)만 맡고, 키프레임 타깃 조립은 여기 strikeTarget 이
// 본체·잔상 공통으로 만든다(궤적 동일, 잔상만 늦게 시작·옅게·스냅에서만 켜짐). 흐림 정도(blurPx)는 겹마다
// 달라 컴포넌트가 인라인 filter 로 입힌다.

export type TrailGhost = {
  lagMs: number // 본체보다 이만큼 늦게 같은 궤적을 시작 → 그 시차만큼 머리 진행 반대쪽(뒤)에 남는다
  opacity: number // 잔상 최대 불투명도(본체 1.0 대비) — 머리에서 멀수록(lag↑) 옅게
  blurPx: number // 흰 실루엣 블러(px) — 머리쪽은 또렷(작게), 꼬리로 갈수록 흐릿(크게) → 스미어로 녹음
}

// 머리(가까움·또렷)→꼬리(멀음·흐릿) 10겹. lag 을 스냅(~60ms) 전체에 촘촘히 펼쳐 HOLD 까지 꽉 찬 긴 스미어를
// 만든다 — lag 이 스냅보다 크면 그 겹은 임팩트 순간 자기 스냅이 아직 시작 전이라 안 보이므로(게이팅) lag 은
// 스냅(60ms) 안에 둔다. 더 길게 하려면 겹을 더 늘려 채우고, 꼬리 opacity 를 너무 떨구지 않는다(안 그러면
// 끝이 일찍 사라져 짧아 보임). 겹 수를 바꾸면 이 배열과 HammerStrike 의 잔상 컨트롤 호출 수를 함께 맞춘다.
export const TRAIL: TrailGhost[] = [
  { lagMs: 5, opacity: 0.5, blurPx: 1 },
  { lagMs: 11, opacity: 0.45, blurPx: 1.5 },
  { lagMs: 17, opacity: 0.4, blurPx: 2 },
  { lagMs: 23, opacity: 0.35, blurPx: 2.5 },
  { lagMs: 29, opacity: 0.3, blurPx: 3 },
  { lagMs: 35, opacity: 0.26, blurPx: 3.5 },
  { lagMs: 41, opacity: 0.22, blurPx: 4 },
  { lagMs: 47, opacity: 0.18, blurPx: 4.5 },
  { lagMs: 52, opacity: 0.15, blurPx: 5 },
  { lagMs: 57, opacity: 0.12, blurPx: 5.5 },
]

// 잔상이 임팩트 직후 사라지기까지(초) — 머리가 검에 닿는 순간 스미어가 점으로 모여 잦아든다.
const GHOST_FADE_SEC = 0.05

// 잔상 opacity 게이팅이 peak 까지 차오르는 비율(스냅 길이 대비). 작을수록 스냅 초반에 빨리 또렷해져, lag 이 큰
// 꼬리 겹도 임팩트 순간 이미 보인다(꽉 찬 긴 스미어). 0 에 가까우면 스냅 시작 즉시 peak(윈드업 직후 갑툭튀 위험).
const GHOST_RAMP_FRAC = 0.35

type StrikeGeom = { x: number[]; y: number[]; rotate: number[]; scale: number[] }

// 본체·잔상이 공유하는 키프레임 타깃을 만든다. 궤적(geom)·타이밍(m)은 동일하고, 차이는 셋뿐:
//  - delaySec: 잔상은 이만큼 늦게 시작 → 시차만큼 뒤에 끌린다(본체 0).
//  - opacityPeak: 최대 불투명도(본체 1).
//  - ghost: 잔상은 페이드 곡선을 스냅 구간으로 좁혀, 윈드업엔 0·스냅에서 켜졌다 임팩트 직후 꺼진다
//    (본체와 겹치는 윈드업에서 흰 잔상이 새지 않게). 본체는 등장~정지 내내 또렷한 기존 곡선 그대로.
export function strikeTarget(
  geom: StrikeGeom,
  m: HammerMotion,
  { opacityPeak, delaySec, ghost }: { opacityPeak: number; delaySec: number; ghost: boolean },
): TargetAndTransition {
  const impactRatio = m.impactSec / m.motionSec
  // 잔상 게이팅이 peak 에 도달하는 시각 — 스냅 시작(holdUntil)에서 스냅 길이의 GHOST_RAMP_FRAC 만큼 지난 지점.
  // 여기서 peak 에 닿아 임팩트까지 유지하므로, lag 이 큰(꼬리) 겹도 임팩트 순간 이미 또렷해 스미어가 길게 찬다.
  const ghostPeakAt = m.holdUntil + GHOST_RAMP_FRAC * (m.impactSec - m.holdUntil)
  return {
    ...geom,
    opacity: ghost
      ? [0, 0, opacityPeak, opacityPeak, 0, 0]
      : [0, opacityPeak, opacityPeak, opacityPeak, 0],
    transition: {
      duration: m.motionSec,
      delay: delaySec,
      // 대기(0→holdUntil) → 스냅(→impact, easeIn 가속) → 제자리 페이드아웃. 본체·잔상 공통 궤적 곡선.
      times: [0, m.holdUntil / m.motionSec, impactRatio, 1],
      ease: ['easeInOut', 'easeIn', 'linear'],
      // opacity 는 궤적 곡선과 분리. 본체: 초반에 빠르게 켜 정지까지 유지 후 페이드(기존 곡선).
      // 잔상: 스냅 시작(holdUntil)까지 0 → 빠르게(ghostPeakAt) peak 까지 차올라 임팩트까지 유지 → 직후
      // (GHOST_FADE_SEC) 0. 윈드업 누수 방지하면서 꼬리까지 또렷하게(긴 스미어).
      opacity: {
        duration: m.motionSec,
        delay: delaySec,
        times: ghost
          ? [
              0,
              m.holdUntil / m.motionSec,
              ghostPeakAt / m.motionSec,
              impactRatio,
              Math.min(m.impactSec + GHOST_FADE_SEC, m.motionSec) / m.motionSec,
              1,
            ]
          : [
              0,
              // 페이드인 지점(0.12)은 임팩트보다 늦으면 times 가 비단조가 돼(motion 거부) — 임팩트 비율로 클램프.
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
