import type { DestructionEvent } from './destruction'
import { ShakeBurstEffect, SHAKE_BURST_DURATION_MS } from './ShakeBurstEffect'

export type { DestructionEvent } from './destruction'

// 파괴 연출 = 공유 "떨림 후 분출"의 적색 변형. 무기가 덜덜 떨리다가 붉은 파티클이 사방으로 터지며
// 검이 소멸한다(잔상 팝업·소멸 뒤로 새 시작 검(+1)이 드러난다). 안무·타이밍은 ShakeBurstEffect 가 소유한다.

// 파괴 연출의 전체 길이(ms) — Effect 시스템이 'destruction' 효과의 durationMs 로 쓴다.
export const DESTRUCTION_DURATION_MS = SHAKE_BURST_DURATION_MS

export function DestructionEffect({
  event,
}: {
  event: DestructionEvent | null
}) {
  return (
    <ShakeBurstEffect
      event={event}
      coreVar="var(--color-danger-glow)"
      edgeVar="var(--color-danger)"
    />
  )
}
