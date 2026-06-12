// 망치 스윙 궤적(키프레임 기하)의 순수 코어 — "가상 피벗(대장장이의 손) + 손목 스냅" 2단 모델.
// 사람의 타격은 축(어깨·손)을 중심으로 도는 호(arc)다: 망치 중심은 피벗에서 ARM_RADIUS_PX 떨어진
// 원호 위만 움직이고(팔), 망치 자체 기울기는 팔 각도 + 손목 오프셋(젖힘→풀림)으로 정한다(손목).
// 이전 구현(직선 보간 + 동시 회전)은 회전과 이동이 기하적으로 무관해 "스티커가 미끄러지며 도는"
// 느낌이었다 — 이 모델은 회전이 이동의 원인이라 휘두르는 인상이 구조적으로 보장된다.
//
// 호를 등각(等角)으로 촘촘히 샘플한 키프레임을 motion 에 넘기고(구간 ease 는 전부 linear), times 를
// 가속 곡선(SNAP_ACCEL_POW)으로 비균등 배치해 각속도가 임팩트로 갈수록 빨라지게 한다 — easeIn 의
// 호 버전. 손목은 시간 거듭제곱(WRIST_RELEASE_POW)으로 스냅 후반에 몰아서 풀린다(채찍 같은 손목 스냅).
//
// 임팩트 포즈(IMPACT·IMPACT_ROTATE)가 앵커다 — 무기 떨림·Hit 불꽃·'캉' 타격음과 동기화되는 지점이라
// 튜닝으로 움직이면 안 된다. 피벗을 앵커에서 역산(derivePivot)하므로 반지름·팔 각도를 어떻게 바꿔도
// 임팩트 순간 망치는 정확히 같은 자리·자세에 온다.
//
// 시간·DOM 을 모르는 결정적 모듈(고정 입력 → 고정 키프레임) — 타이밍(HammerMotion)은 hammerTiming 이,
// 재생은 HammerStrike 가 맡는다. 머리 잔상(스미어)은 본체의 렌더 포즈를 onUpdate 로 받아 그리므로
// (hammerTrail.ts) 이 궤적이 어떻게 바뀌어도 자동으로 따라온다.

import type { Easing } from 'motion/react'
import type { HammerMotion, SwingKeyframes } from './hammerTiming'

// ── 튜닝 상수(브라우저에서 눈으로 맞추는 값) ─────────────────────────────────────
// x·y(px): 검 박스 "중심"(0,0) 기준, x+ 오른쪽 · y− 위. 각도(deg): CSS rotate 와 같은 시계방향 +.
// 팔 각도 0 = 망치가 피벗 바로 위(호 꼭대기), + 는 피벗 기준 오른쪽 · − 는 왼쪽.
export const IMPACT = { x: 24, y: -3 } // 임팩트 앵커 — 망치 머리가 마법진(검 박스) 정중앙에 닿는 위치
export const IMPACT_ROTATE = -56 // 임팩트 자세(팔+손목 합) — 머리=위(0) 기준, − 는 왼쪽으로 따라넘긴 기울기
export const ARM_RADIUS_PX = 240 // 피벗(손)→망치 중심 거리 — 작을수록 호가 빡빡하게 휜다(곡률↑)
export const ARM_IMPACT_DEG = -64 // 임팩트 순간 팔 각도 — 더 음수일수록 피벗이 오른쪽·위로 가고 내려찍는 방향이 수직에 가깝다
export const ARM_START_DEG = -2 // 등장(치켜듦) 팔 각도 — 호 꼭대기 부근(높이 들어 올린 자세)
export const ARM_HOLD_DEG = 6 // 윈드업 팔 각도 — 등장에서 살짝 뒤(오른쪽)로 당겨 재는 앤티시페이션
export const WRIST_START_DEG = 46 // 등장 시 손목 젖힘(팔 각도에 더하는 오프셋) — 머리를 오른쪽으로 cocking
export const WRIST_HOLD_DEG = 54 // 윈드업 손목 젖힘 — 스냅 동안 임팩트 잔여(아래 wristFollow)까지 풀린다
export const SNAP_SAMPLES = 10 // 스냅 호의 키프레임 샘플 수 — 구간이 linear 라 촘촘해야 호로 보인다(10개면 호 대비 ≈0.5px 오차)
export const SNAP_ACCEL_POW = 2.2 // 각도 진행 = (시간 진행)^POW — 클수록 출발이 느리고 임팩트 직전이 빠르다(easeIn 가속)
export const WRIST_RELEASE_POW = 2.2 // 손목 풀림 = (시간 진행)^POW — 클수록 늦게, 채찍처럼 막판에 꺾인다
export const SCALE_START = 0.9 // 등장 크기 — 임팩트(1.08)로 갈수록 커져 깊이감(다가옴)을 흉내 낸다
export const SCALE_HOLD = 0.95
export const SCALE_IMPACT = 1.08
// 좁은(세로) 화면 보정 — 치켜든 자세의 +x 가 검 박스에서 오른쪽으로 멀면 좁은 폭에서 화면 밖으로
// 넘쳐 가로 스크롤/줌을 만든다. 임팩트 x 를 앵커로 호 전체의 x 만 안쪽으로 눌러(가로 압축 타원)
// 화면 안에서 시작하게 한다 — y 는 그대로라 들어 올린 높이는 유지되고, 임팩트 위치는 변하지 않는다.
export const NARROW_RAISE_X_SCALE = 0.6

const DEG = Math.PI / 180

export type SwingPivot = { x: number; y: number }

// 피벗(대장장이의 손) 위치 — 임팩트 앵커에서 팔 방향(ARM_IMPACT_DEG)으로 반지름만큼 역산한다.
// 손잡이가 피벗을 향하는 기하라, 피벗은 검 박스의 오른쪽 아래(화면 밖 어림)에 떨어진다.
export function derivePivot(): SwingPivot {
  return {
    x: IMPACT.x - ARM_RADIUS_PX * Math.sin(ARM_IMPACT_DEG * DEG),
    y: IMPACT.y + ARM_RADIUS_PX * Math.cos(ARM_IMPACT_DEG * DEG),
  }
}

// 팔 각도 → 망치 중심 위치(원호 위의 점). 각도 0 이 피벗 바로 위라 cos 항이 위(−y)로 간다.
function armPos(pivot: SwingPivot, armDeg: number): { x: number; y: number } {
  return {
    x: pivot.x + ARM_RADIUS_PX * Math.sin(armDeg * DEG),
    y: pivot.y - ARM_RADIUS_PX * Math.cos(armDeg * DEG),
  }
}

// 스윙 전체 키프레임 조립: 등장(치켜듦) → 윈드업(당겨 젖힘) → 스냅(호 등각 샘플, 시간 왜곡 가속)
// → 임팩트 자세 정지(페이드아웃은 strikeTarget 의 opacity 채널이 담당).
export function swingKeyframes(
  m: HammerMotion,
  narrow: boolean,
): SwingKeyframes {
  const pivot = derivePivot()
  // 임팩트 순간 남는 손목 오프셋 — 앵커 자세(IMPACT_ROTATE)에서 역산. 스냅 동안 WRIST_HOLD_DEG 가
  // 여기까지 풀린다(0 이 아니어도 된다 — 총 자세가 앵커와 일치하는 게 불변식).
  const wristFollow = IMPACT_ROTATE - ARM_IMPACT_DEG

  const x: number[] = []
  const y: number[] = []
  const rotate: number[] = []
  const scale: number[] = []
  const times: number[] = []
  const ease: Easing[] = []
  const put = (armDeg: number, rot: number, sc: number, t: number) => {
    const p = armPos(pivot, armDeg)
    x.push(p.x)
    y.push(p.y)
    rotate.push(rot)
    scale.push(sc)
    times.push(t)
  }

  const holdT = m.holdUntil / m.motionSec
  const impactT = m.impactSec / m.motionSec

  // 등장 → 윈드업: 피벗 기준으로 살짝 뒤로 당겨 재는 동작(평행이동이 아니라 호 위의 cocking).
  put(ARM_START_DEG, ARM_START_DEG + WRIST_START_DEG, SCALE_START, 0)
  put(ARM_HOLD_DEG, ARM_HOLD_DEG + WRIST_HOLD_DEG, SCALE_HOLD, holdT)
  ease.push('easeInOut')

  // 스냅: 등각 샘플 a 에 시간 u = a^(1/POW) 를 배치(= 각도 진행이 u^POW 로 가속). 손목은 u 기준
  // 거듭제곱으로 늦게 풀려 막판에 확 꺾인다. scale 은 공간 진행(a)에 묶어 궤적과 함께 커진다.
  for (let i = 1; i <= SNAP_SAMPLES; i++) {
    const a = i / SNAP_SAMPLES
    const u = Math.pow(a, 1 / SNAP_ACCEL_POW)
    const arm = ARM_HOLD_DEG + (ARM_IMPACT_DEG - ARM_HOLD_DEG) * a
    const wrist =
      WRIST_HOLD_DEG +
      (wristFollow - WRIST_HOLD_DEG) * Math.pow(u, WRIST_RELEASE_POW)
    put(
      arm,
      arm + wrist,
      SCALE_HOLD + (SCALE_IMPACT - SCALE_HOLD) * a,
      holdT + (impactT - holdT) * u,
    )
    ease.push('linear')
  }

  // 임팩트 자세로 모션 끝까지 정지 — 마지막 스냅 샘플(a=1)과 같은 포즈(앵커)다.
  put(ARM_IMPACT_DEG, IMPACT_ROTATE, SCALE_IMPACT, 1)
  ease.push('linear')

  // 좁은(세로) 화면: 임팩트 x 를 앵커로 가로만 압축(위 상수 주석 참고) — 임팩트 키프레임은 불변.
  if (narrow) {
    for (let i = 0; i < x.length; i++) {
      x[i] = IMPACT.x + (x[i] - IMPACT.x) * NARROW_RAISE_X_SCALE
    }
  }

  return { x, y, rotate, scale, times, ease }
}
