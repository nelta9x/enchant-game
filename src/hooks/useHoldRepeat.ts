import { useCallback, useEffect, useRef } from 'react'
import { useRepeatEngine } from './useRepeatEngine'

// 누르고 있는 동안 액션을 "연사"하는 press-and-hold 훅(요청: "꾹 누르면 계속 강화").
// 강화 버튼에 붙여 강화 → 쿨다운 → 강화 … 가 누르고만 있어도 이어지게 한다. 발사 게이트·폴링·min-gap
// 박자는 공유 연사 엔진(useRepeatEngine)이 소유한다 — 스페이스 단축키(useEnhanceHotkey)와 같은 박자로
// 흐르며, 이 훅은 포인터/클릭 이벤트를 엔진에 배선만 한다.
//
//  - 마우스·터치·펜: pointerdown 즉시 1회 + 폴링 반복(누르는 동안). 떼면(window pointerup/cancel/blur)
//    멈춘다. 터치가 스크롤·줌 제스처로 소비되면 pointercancel 이 와서 같은 경로로 멈춘다 — 단, 그러면
//    홀드가 끊기므로 대상 버튼에는 touch-action: none(Tailwind touch-none)을 줘 제스처로 새지 않게 한다.
//    (모바일에서 click(완료된 탭)만 기다리면 꾹 누름이 long-press 로 빠져 아무것도 발사되지 않는다 —
//    PC 와 같은 "꾹 누르면 연속 강화"가 터치에서도 성립해야 한다.)
//  - 키보드(Enter)·보조기술: click(포인터를 거치지 않은 합성 클릭)에서 1회. (스페이스는 전역 단축키가 전담.)
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
      // 마우스·터치·펜 모두 '누름(pointerdown)'에서 발사 + 연사한다 — 터치도 PC 와 같은 "꾹 누르면
      // 연속 강화"가 성립해야 한다(탭 완료를 기다리면 모바일 홀드는 long-press 로 빠져 무반응).
      // 제스처 오발은 대상 버튼의 touch-action: none 이 막고, 그래도 새면 pointercancel 이 멈춘다.
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
      // 포인터(마우스/터치/펜)의 click 은 위 pointerdown 이 이미 처리했으므로 무시하고, 포인터를 거치지
      // 않은 합성 클릭 — 키보드(Enter)·보조기술·프로그램 호출(pointerType='') — 만 1회 발사한다.
      // pointerType 이 아예 없는 구형 브라우저에선 포인터 click 이 한 번 더 들어와도 min-gap 이 막아
      // 이중 발사가 안 된다(graceful degradation).
      if ((e.nativeEvent as PointerEvent).pointerType) return
      engine.fireOnce()
    },
    [engine],
  )

  return { onPointerDown, onClick }
}
