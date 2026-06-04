import type { Transition } from 'motion/react'

// 무기 "덜덜 떨림" 애니메이션의 공유 정의(프레젠테이션 토큰).
// 두 곳이 같은 떨림을 써야 한다 — (1) 파괴 잔상이 터지기 전 떨 때, (2) 파괴보호장치로 살아남아
// "떨림만" 보여 줄 때. 한 곳에 둬 두 연출의 떨림이 항상 동일하게 보이도록 한다.
// (모션 타깃/트랜지션은 순수 데이터라 컴포넌트와 무관한 이 모듈에 둬도 무방.)

// 떨림 길이(초). 파괴 연출에선 이 시점에 폭발이 시작되고(=떨림 끝), 방지 떨림의 전체 길이이기도 하다.
export const SHAKE_SEC = 0.4

// 좌우로 덜덜 떠는 x/rotate 키프레임(끝에서 정지로 수렴). 8개 — SHAKE_TRANSITION.times 와 길이 일치.
export const SHAKE_KEYFRAMES = {
  x: [0, -5, 5, -4, 4, -3, 3, 0],
  rotate: [0, -4, 4, -3, 3, -2, 2, 0],
}

export const SHAKE_TRANSITION: Transition = {
  duration: SHAKE_SEC,
  times: [0, 0.14, 0.28, 0.42, 0.56, 0.7, 0.84, 1],
  ease: 'easeOut',
}
