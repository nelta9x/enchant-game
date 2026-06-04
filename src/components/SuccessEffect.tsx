import type { ShakeBurstEvent } from './ShakeBurstEffect'
import { ShakeBurstEffect, SHAKE_BURST_DURATION_MS } from './ShakeBurstEffect'

// 강화 성공 연출 = 공유 "떨림 후 분출"의 금색 변형(파괴와 동일 안무). 무기가 덜덜 떨리다가 황금빛
// 파티클이 사방으로 터지며 상위 검이 드러난다 — 실패와 같은 긴장(떨림) 뒤에 결과가 나온다.
// 잔상 스프라이트는 강화 전(from) 검이고, 파티클 수는 도달 검의 단계에 비례한다.
export type SuccessEvent = ShakeBurstEvent

// 성공 연출 길이(ms) — Effect 시스템이 'successBurst' 효과의 durationMs 로 쓴다.
export const SUCCESS_DURATION_MS = SHAKE_BURST_DURATION_MS

export function SuccessEffect({ event }: { event: SuccessEvent | null }) {
  return (
    <ShakeBurstEffect
      event={event}
      coreVar="var(--color-gold-glow)"
      edgeVar="var(--color-gold)"
    />
  )
}
