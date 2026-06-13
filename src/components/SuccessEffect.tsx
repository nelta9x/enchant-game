import type { ShakeBurstEvent } from './ShakeBurstEffect'
import { BurstEmitter } from './ShakeBurstEffect'

// 강화 성공 = 공유 "떨림 후 분출"의 금색 변형(파괴와 동일 안무). 이 컴포넌트는 그중 **금색 파티클 분출**만
// 트리거한다(burstAt 에 풀로 emit) — 잔상(떨림→팝업)은 색과 무관해 GameScreen 의 영속 ShakeAfterimage 한
// 장이 성공·파괴 공통으로 그린다. 잔상 스프라이트는 강화 전(from) 검이고, 파티클 수는 도달 검의 단계에
// 비례한다. 연출 길이는 매 강화의 떨림 시간에 따라 달라지므로 GameScreen 이 타임라인으로 효과 durationMs 를
// 정하고, 여기선 색만 바인딩한다(렌더 null — 파티클은 풀이 그린다).
export type SuccessEvent = ShakeBurstEvent

export function SuccessEffect({ event }: { event: SuccessEvent | null }) {
  return (
    <BurstEmitter
      event={event}
      coreVar="var(--color-gold-glow)"
      edgeVar="var(--color-gold)"
    />
  )
}
