import { useEffect, useState } from 'react'

// 한 번 재생 후 스스로 만료되는 이벤트 셸(백스톱). 연출 컴포넌트(파괴·성공 등)가 공유한다.
// 타이밍의 1차 소유자는 Effect 시스템이다(running 에서 제거되면 event 가 null 이 되어 사라짐).
// 이 훅은 혹시 event 가 남더라도 lifetimeMs 뒤 만료 처리해 시각이 정리되게 하는 안전망이다.
// 만료는 타이머 콜백에서만 set → effect 동기 setState 규칙(set-state-in-effect)을 건드리지 않는다.
export function useOneShot<E extends { id: number }>(
  event: E | null,
  lifetimeMs: number,
): E | null {
  const [expiredId, setExpiredId] = useState<number | null>(null)

  useEffect(() => {
    if (!event) return
    const { id } = event
    const tid = setTimeout(() => setExpiredId(id), lifetimeMs)
    return () => clearTimeout(tid)
  }, [event, lifetimeMs])

  // 아직 만료되지 않은 이벤트만 노출. event 가 먼저 사라지면 호출 측 AnimatePresence 가 exit.
  return event && event.id !== expiredId ? event : null
}
