import type { Transition } from 'motion/react'

// 무기 "덜덜 떨림" 애니메이션의 공유 정의(프레젠테이션 토큰).
// 두 곳이 같은 떨림을 써야 한다 — (1) 성공/파괴 잔상이 터지기 전 떨 때, (2) 파괴보호장치로 살아남아
// "떨림만" 보여 줄 때. 한 곳에 둬 두 연출의 떨림이 항상 동일하게 보이도록 한다.
//
// 떨림의 "모양"(좌우 진폭·times 곡선)은 코드 상수로 둔다. 떨림이 "언제 시작하고 얼마나 가는지"는 강화마다
// 다르므로(망치가 닿는 순간 시작 + 0.2~0.5s 무작위 길이) 길이·지연을 인자로 받는 makeShakeTransition 으로
// 만든다 — 시퀀스 타이밍은 데이터/타임라인(enhanceTimeline)이 정하고, 여기선 모양만 소유한다.

// 좌우로 덜덜 떠는 x/rotate 키프레임(끝에서 정지로 수렴). 8개 — SHAKE_TIMES 와 길이 일치.
export const SHAKE_KEYFRAMES = {
  x: [0, -5, 5, -4, 4, -3, 3, 0],
  rotate: [0, -4, 4, -3, 3, -2, 2, 0],
}

// 키프레임 사이의 정규화된 진행 시각(0~1). 길이는 임의 떨림 길이로 스케일된다(makeShakeTransition).
const SHAKE_TIMES = [0, 0.14, 0.28, 0.42, 0.56, 0.7, 0.84, 1]

// 떨림 트랜지션을 만든다 — durationSec 동안 떨고, delaySec 만큼 늦게 시작한다(망치 임팩트까지 대기).
// 길이가 달라도 키프레임 모양(SHAKE_TIMES)은 그대로라 떨림의 "느낌"은 일정하고 전체 길이만 늘고 준다.
export function makeShakeTransition(
  durationSec: number,
  delaySec = 0,
): Transition {
  return {
    duration: durationSec,
    delay: delaySec,
    times: SHAKE_TIMES,
    ease: 'easeOut',
  }
}
