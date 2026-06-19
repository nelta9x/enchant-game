import { useCallback, useLayoutEffect, useRef } from 'react'

// 항상 "최신" 콜백을 호출하는 안정된(불변) 식별자를 돌려준다(useEvent 폴리필).
// 핸들러를 자식에 내려도 매 렌더 새 함수가 아니므로 자식의 React.memo 가 깨지지 않는다 —
// 매 렌더 새 클로저를 만들어 prop 으로 넘기면 memo 가 silent no-op 이 되는 함정을 차단한다.
//
// 최신 fn 은 layout effect 에서 ref 에 보관한다(렌더 중 ref 쓰기 회피 — 프로젝트 규약). 반환 함수는
// 이벤트(클릭·포인터·키)에서만 불리므로 항상 commit 이후라 stale 없이 최신 fn 을 본다(useCallback 의
// 빈 deps 와 달리 클로저가 캡처한 값이 오래되지 않는다).
export function useStableCallback<A extends unknown[], R>(
  fn: (...args: A) => R,
): (...args: A) => R {
  const ref = useRef(fn)
  useLayoutEffect(() => {
    ref.current = fn
  })
  return useCallback((...args: A) => ref.current(...args), [])
}
