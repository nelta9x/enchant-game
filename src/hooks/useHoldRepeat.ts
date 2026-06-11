import { useCallback, useEffect, useRef } from 'react'
import { useRepeatEngine } from './useRepeatEngine'

// 누르고 있는 동안 액션을 "연사"하는 마우스 press-and-hold 훅(요청: "마우스로 꾹 누르면 계속 강화").
// 강화 버튼에 붙여 강화 → 쿨다운 → 강화 … 가 누르고만 있어도 이어지게 한다. 발사 게이트·폴링·min-gap
// 박자는 공유 연사 엔진(useRepeatEngine)이 소유한다 — 스페이스 단축키(useEnhanceHotkey)와 같은 박자로
// 흐르며, 이 훅은 포인터/클릭 이벤트를 엔진에 배선만 한다.
//
//  - 마우스: pointerdown 즉시 1회 + 폴링 반복(누르는 동안). 떼면(window pointerup/cancel/blur) 멈춘다.
//  - 터치/펜: 'click'(완료된 탭)에서 1회 — 접촉(pointerdown)이 아니라 떼는 순간 확정이라, 누른 채 미끄러뜨려
//    취소하거나 스크롤로 이어지는 제스처에 오발하지 않는다(연사 없음 — 요청은 "마우스로 꾹").
//  - 키보드(Enter)·보조기술: click(입력원이 마우스가 아닌 것)에서 1회. (스페이스는 전역 단축키가 전담.)
type UseHoldRepeatOptions = {
  disabled: boolean
  onFire: () => void
}

export function useHoldRepeat<T extends HTMLElement = HTMLElement>({
  disabled,
  onFire,
}: UseHoldRepeatOptions) {
  // 발사 정책(disabled 게이트·min-gap·폴링)은 공유 엔진이 소유. 언마운트 시 타이머도 엔진이 정리한다.
  const engine = useRepeatEngine({ disabled, onFire })

  // 홀드 해제(연사 정지 + 안전 리스너 해제). 같은 함수 참조로 add/remove 해야 정확히 떼이므로
  // ref 에 한 번 만들어 둔다 — 버튼 밖에서 떼거나 포커스를 잃어도 확실히 멈춘다.
  const releaseRef = useRef<() => void>(() => {})
  useEffect(() => {
    const release = () => {
      engine.stopHold()
      window.removeEventListener('pointerup', release)
      window.removeEventListener('pointercancel', release)
      window.removeEventListener('blur', release)
    }
    releaseRef.current = release
    return release // 언마운트 시 리스너 정리(누른 채 화면이 사라져도 폭주하지 않게).
  }, [engine])

  const onPointerDown = useCallback(
    (e: React.PointerEvent<T>) => {
      if (e.button !== 0 || !e.isPrimary) return // 주 포인터(왼쪽 버튼/주 접촉)만
      // 마우스만 '누름(pointerdown)'에서 발사 + 연사한다. 터치/펜은 여기서 안 쏘고 아래 onClick(완료된 탭)에서
      // 1회 쏜다 — 접촉 즉시 발사하면 취소·스크롤 제스처에 오발하기 때문(탭은 떼는 순간 확정).
      if (e.pointerType !== 'mouse') return
      engine.fireOnce() // 누르는 즉시 1회
      if (engine.startHold()) {
        // 버튼 밖에서 떼거나 포커스를 잃어도 확실히 멈추도록 window 에서 해제를 듣는다(홀드 시작 시 1회 부착).
        window.addEventListener('pointerup', releaseRef.current)
        window.addEventListener('pointercancel', releaseRef.current)
        window.addEventListener('blur', releaseRef.current)
      }
    },
    [engine],
  )

  const onClick = useCallback(
    (e: React.MouseEvent<T>) => {
      // 마우스 click 은 위 pointerdown 이 이미 처리했으므로 무시. 터치/펜 탭과 키보드(Enter)·보조기술의 click
      // 만 1회 발사한다. 'click' 의 pointerType 로 입력원을 가른다(마우스='mouse', 터치='touch', 펜='pen',
      // 키보드·프로그램 호출=''). pointerType 이 없는 구형 브라우저에선 마우스 click 이 한 번 더 들어와도
      // min-gap 이 막아 이중 발사가 안 된다(graceful degradation).
      if ((e.nativeEvent as PointerEvent).pointerType === 'mouse') return
      engine.fireOnce()
    },
    [engine],
  )

  return { onPointerDown, onClick }
}
