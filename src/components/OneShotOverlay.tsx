import { type ReactNode } from 'react'
import { AnimatePresence } from 'motion/react'
import { useOneShot } from './useOneShot'

// "이벤트 1회 재생" 연출 오버레이의 공유 셸 — 코인/아이템 비행·드롭·골드 텍스트·플로팅 텍스트·
// 떨림 버스트가 똑같이 반복하던 보일러플레이트(useOneShot 백스톱 + 클릭 통과 오버레이 +
// AnimatePresence)를 한 곳에 둔다. 셸이 공통이어야 "이벤트 → 1회 재생 → 만료/교체 시 exit" 규약이
// 연출마다 미세하게 어긋나지 않는다.
//
//  - event: 재생할 이벤트(id 단조 증가). null 이면 아무것도 그리지 않는다.
//  - lifetimeMs: useOneShot 백스톱 수명 — 타이밍의 1차 소유자는 Effect 시스템/호출 측이고,
//    이벤트가 남아도 이 시간 뒤 시각이 정리된다(useOneShot 주석 참고).
//  - children: 활성 이벤트를 받아 1회 재생 인스턴스를 그리는 렌더 함수. 인스턴스 루트에
//    key={active.id} 를 줘야 새 이벤트가 처음부터 다시 재생되고 AnimatePresence exit 이 동작한다.
//  - className: 오버레이 기본 클래스(클릭 통과 + 박스 덮기 + 넘침 표시)에 덧붙일 클래스
//    (예: 플로팅 텍스트의 z-50·중앙 정렬).
export function OneShotOverlay<E extends { id: number }>({
  event,
  lifetimeMs,
  className,
  children,
}: {
  event: E | null
  lifetimeMs: number
  className?: string
  children: (active: E) => ReactNode
}) {
  const active = useOneShot(event, lifetimeMs)

  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-visible${
        className ? ` ${className}` : ''
      }`}
      aria-hidden
    >
      <AnimatePresence>{active && children(active)}</AnimatePresence>
    </div>
  )
}
