import type { ShakeBurstEvent } from './ShakeBurstEffect'
import { ShakeBurstEffect } from './ShakeBurstEffect'

// 강화 성공 연출 = 공유 "떨림 후 분출"의 금색 변형(파괴와 동일 안무). 무기가 망치에 맞아 덜덜 떨리다가
// 황금빛 파티클이 사방으로 터지며 상위 검이 드러난다 — 실패와 같은 긴장(떨림) 뒤에 결과가 나온다.
// 잔상 스프라이트는 강화 전(from) 검이고, 파티클 수는 도달 검의 단계에 비례한다. 연출 길이는 매 강화의
// 떨림 시간에 따라 달라지므로 GameScreen 이 타임라인(burstLifetimeMs)으로 효과 durationMs 를 정한다.
export type SuccessEvent = ShakeBurstEvent

export function SuccessEffect({ event }: { event: SuccessEvent | null }) {
  return (
    <ShakeBurstEffect
      event={event}
      coreVar="var(--color-gold-glow)"
      edgeVar="var(--color-gold)"
    />
  )
}
