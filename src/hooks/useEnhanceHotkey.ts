import { useEffect } from 'react'
import { isDesktopPointer, isEnhanceHotkeyEvent } from '../lib/hotkeys'

// 데스크탑에서 스페이스바로 강화를 실행하는 전역 단축키 훅(요청: "데스크탑 환경에서 스페이스 = 강화").
// - 데스크탑(정밀 포인터+호버) 환경에서만 리스너를 부착 — 터치 전용 기기는 제외.
// - enabled=false(예: 상점 열림)면 부착하지 않아 모달 내부의 네이티브 스페이스 동작을 보존한다.
// - preventDefault 로 스페이스 기본 동작(페이지 스크롤 + 포커스된 버튼의 활성)을 막는다 → 포커스 위치와
//   무관하게 "스페이스 = 강화"가 정확히 1회만 실행된다(Enter 는 그대로 포커스된 컨트롤을 활성 → 접근성 보존).
// - disabled(강화 불가/연출 잠금)면 키 기본 동작만 막고 강화는 실행하지 않는다(강화 버튼과 동일 게이트).
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
  useEffect(() => {
    if (!enabled || !isDesktopPointer()) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isEnhanceHotkeyEvent(e)) return
      e.preventDefault()
      if (disabled) return
      onEnhance()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled, disabled, onEnhance])
}
