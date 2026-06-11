import { useEffect } from 'react'
import {
  ENHANCE_HOTKEY_CODE,
  isDesktopPointer,
  isEnhanceHotkeyContext,
  isEnhanceHotkeyEvent,
} from '../lib/hotkeys'
import { useRepeatEngine } from './useRepeatEngine'

// 데스크탑에서 스페이스바로 강화를 실행하는 전역 단축키 훅(요청: "데스크탑 환경에서 스페이스 = 강화").
// - 데스크탑(정밀 포인터+호버) 환경에서만 리스너를 부착 — 터치 전용 기기는 제외.
// - enabled=false(예: 상점 열림)면 부착하지 않아 모달 내부의 네이티브 스페이스 동작을 보존한다.
// - preventDefault 로 스페이스 기본 동작(페이지 스크롤 + 포커스된 버튼 활성)을 막는다 — 포커스 위치와
//   무관하게 정확히 강화만 실행된다(Enter 는 그대로 포커스된 컨트롤을 활성 → 접근성 보존).
// - 꾹 누름 = 연사: 누른 동안 강화를 반복 시도한다(OS 키반복에 의존하지 않아 지연·환경차 없음).
//   발사 게이트·폴링·min-gap 박자는 공유 연사 엔진(useRepeatEngine)이 소유한다 — 마우스
//   press-and-hold(useHoldRepeat)와 같은 박자로 흐른다. 이 훅은 키 이벤트를 엔진에 배선만 한다.
type UseEnhanceHotkeyOptions = {
  enabled: boolean
  disabled: boolean
  onEnhance: () => void
}

export function useEnhanceHotkey({
  enabled,
  disabled,
  onEnhance,
}: UseEnhanceHotkeyOptions) {
  // 발사 정책(disabled 게이트·min-gap)은 공유 엔진이 소유. 엔진 핸들은 정체성이 안정적이라
  // 아래 effect deps 에 넣어도 잠금 토글마다 리스너가 재부착되지 않는다.
  const engine = useRepeatEngine({ disabled, onFire: onEnhance })

  useEffect(() => {
    if (!enabled || !isDesktopPointer()) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (!isEnhanceHotkeyContext(e)) return
      e.preventDefault() // 스크롤·포커스된 버튼의 스페이스 활성 차단(꾹 누름 반복 포함).
      if (!isEnhanceHotkeyEvent(e)) return // OS 키반복은 무시 — 연사는 엔진 타이머가 구동.
      if (!engine.startHold()) return // 이미 홀드 중(중복 keydown 방어).
      engine.fireOnce() // 첫 눌림 즉시 1회(이후는 폴링이 잠금 풀릴 때마다 연사).
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === ENHANCE_HOTKEY_CODE) engine.stopHold()
    }
    // 포커스 이탈(Alt+Tab 등으로 keyup 누락 가능) 시 연사를 멈춰 폭주를 막는다.
    const onBlur = () => engine.stopHold()

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      engine.stopHold()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [enabled, engine])
}
