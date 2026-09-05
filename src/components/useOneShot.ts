import { useEffect, useState } from 'react'

// 1회성 연출 이벤트의 "활성" 창을 관리한다 — 이벤트가 오면 lifetimeMs 동안 그 이벤트를 돌려주고, 수명이 지나면
// null(언마운트). 같은 id 가 유지되는 리렌더에는 재시작하지 않고, 새 id(다음 강화·판매)가 오면 수명을 다시 센다.
// onExpire 는 수명이 끝나 null 로 전이하는 순간 1회 호출된다(예: 드롭 연출 종료 시 미수집분 flush) — 효과 store 의
// "종료" 전이를 React 가 구독하지 않게 하려고 컴포넌트가 자기 수명을 스스로 끝낸다.
export function useOneShot<E extends { id: number }>(
  event: E | null,
  lifetimeMs: number,
  onExpire?: () => void,
): E | null {
  const [expiredId, setExpiredId] = useState<number | null>(null)

  useEffect(() => {
    if (!event) return
    const { id } = event
    const tid = setTimeout(() => {
      setExpiredId(id)
      onExpire?.()
    }, lifetimeMs)
    return () => clearTimeout(tid)
    // onExpire 는 최신 클로저를 타이머 발화 시점에 쓰면 충분하다 — deps 에 넣으면 부모 리렌더마다 타이머가 재설정된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, lifetimeMs])

  return event && event.id !== expiredId ? event : null
}
