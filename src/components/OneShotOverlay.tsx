import { type ReactNode } from 'react'
import { useOneShot } from './useOneShot'

// 1회성 연출의 공용 오버레이 셸 — 이벤트가 오면 lifetimeMs 동안 children(active) 를 마운트하고 수명이 끝나면 내린다.
// 절대 위치 풀사이즈·클릭 통과·aria-hidden. 수명은 각 연출이 자기 애니메이션 길이 + 여유로 정하므로(예: COIN_FLIGHT_MS)
// 언마운트 시점엔 애니메이션이 이미 끝나 있다 — 별도 exit 애니메이션(AnimatePresence)은 두지 않는다(motion 프레임루프를
// 강화 경로에서 완전히 빼기 위해). onExpire 는 수명 종료 1회 콜백(useOneShot 참고).
export function OneShotOverlay<E extends { id: number }>({
  event,
  lifetimeMs,
  className,
  onExpire,
  children,
}: {
  event: E | null
  lifetimeMs: number
  className?: string
  onExpire?: () => void
  children: (active: E) => ReactNode
}) {
  const active = useOneShot(event, lifetimeMs, onExpire)

  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-visible${
        className ? ` ${className}` : ''
      }`}
      aria-hidden
    >
      {active && children(active)}
    </div>
  )
}
