import { useEffect, useState } from 'react'

// 미디어 쿼리 매칭 여부를 반응형으로 구독한다(방향 전환·리사이즈 시 자동 갱신). 코드베이스의 isDesktopPointer
// (lib/hotkeys)와 같은 matchMedia 기반이되, 값 변화에 뷰가 반응해야 할 때(예: 세로/좁은 화면에서 망치 연출이
// 화면 밖으로 나가지 않도록 조정) 쓰는 React 훅. SSR/비지원 환경에선 false 로 시작한다(클라이언트 전용 앱).
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia(query).matches,
  )

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange() // 구독 시점에 한 번 동기화(쿼리가 바뀌었거나 초기값과 어긋났을 때 대비).
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}
