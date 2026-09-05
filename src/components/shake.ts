import type { FxSpec } from '../lib/fx'

// 검 떨림 키프레임(성공/파괴 잔상·방지·헛방 공용) — 좌우 흔들림(x, px) + 기울임(rotate, deg)이 감쇠하며 원점으로.
// 실제 검(SwordStage)과 잔상(ShakeAfterimage)이 같은 데이터를 써 박자가 어긋나지 않는다.
export const SHAKE_KEYFRAMES = {
  x: [0, -5, 5, -4, 4, -3, 3, 0],
  rotate: [0, -4, 4, -3, 3, -2, 2, 0],
}

// 키프레임 오프셋(등간격 7구간) — 떨림 길이가 달라도 비율은 유지된다.
const SHAKE_TIMES = [0, 0.14, 0.28, 0.42, 0.56, 0.7, 0.84, 1]

// 떨림 연출 명세 — 망치가 닿는 시각(delaySec)부터 검 데이터의 떨림 길이(durationSec)만큼. WAAPI(lib/fx)로 재생한다:
// 컴포지터 전용이라 떨리는 동안 메인 스레드 비용이 없다.
export function shakeFx(durationSec: number, delaySec = 0): FxSpec {
  return {
    channels: SHAKE_KEYFRAMES,
    durationSec,
    delaySec,
    times: SHAKE_TIMES,
    ease: 'easeOut',
  }
}
