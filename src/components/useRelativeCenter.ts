import { useLayoutEffect, useState, type RefObject } from 'react'
import { relativeCenter, type Point } from './coins'

// 연출 오버레이 좌표 측정의 공유 훅 — 대상 엘리먼트의 중심을 "오버레이 자신의 rect" 기준 좌표로
// 1회 측정한다(카드의 padding/border 만큼 어긋나지 않도록 — relativeCenter 좌표계 규약).
// 코인/아이템 비행·드롭·골드 텍스트가 똑같이 반복하던 useLayoutEffect 측정 블록을 한 곳에 둔다.
//
// 측정은 paint 전(useLayoutEffect)에 1회. 좌표가 확정되기 전엔 null 을 반환하므로 호출 측이
// 가드해 그리지 않으면 원점에서 깜빡 나타나는 플래시가 없다. 마운트 시점(= key 교체로 새 인스턴스)에
// 한 번 잡은 좌표는 이후 새 이벤트가 와도 고정된다(교체 중 튀지 않음).
// (set-state-in-effect 의 정석적 "측정" 예외 — 기존 각 연출의 측정 블록과 동일.)
export function useRelativeCenter(
  rootRef: RefObject<HTMLElement | null>,
  targetRef: RefObject<HTMLElement | null>,
): Point | null {
  const [point, setPoint] = useState<Point | null>(null)

  useLayoutEffect(() => {
    const root = rootRef.current
    const target = targetRef.current
    if (!root || !target) return
    setPoint(
      relativeCenter(
        target.getBoundingClientRect(),
        root.getBoundingClientRect(),
      ),
    )
  }, [rootRef, targetRef])

  return point
}
