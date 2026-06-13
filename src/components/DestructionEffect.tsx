import type { DestructionEvent } from './destruction'
import { BurstEmitter } from './ShakeBurstEffect'

export type { DestructionEvent } from './destruction'

// 파괴 = 공유 "떨림 후 분출"의 적색 변형. 이 컴포넌트는 그중 **적색 파티클 분출**만 트리거한다(burstAt 에
// 풀로 emit) — 잔상(떨림→팝업·소멸 뒤로 새 시작 검(+1) 노출)은 색과 무관해 GameScreen 의 영속
// ShakeAfterimage 한 장이 성공·파괴 공통으로 그린다. 타이밍(durationMs)은 GameScreen 이 타임라인으로 정하고,
// 여기선 색만 바인딩한다(렌더 null — 파티클은 풀이 그린다).

export function DestructionEffect({
  event,
}: {
  event: DestructionEvent | null
}) {
  return (
    <BurstEmitter
      event={event}
      coreVar="var(--color-danger-glow)"
      edgeVar="var(--color-danger)"
    />
  )
}
