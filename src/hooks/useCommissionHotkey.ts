import { useEffect } from 'react'
import { commissionHotkeySlot, isDesktopPointer } from '../lib/hotkeys'

// 데스크탑에서 숫자 1·2·3 키로 의뢰 슬롯을 납품하는 전역 단축키 훅(useEnhanceHotkey 패턴 미러).
// - 데스크탑(정밀 포인터+호버) 환경에서만 부착 — 터치 전용 기기 제외.
// - enabled=false(예: 상점 열림)면 부착하지 않아 모달 내부 입력을 보존한다.
// - 인식된 슬롯 키면 preventDefault 후 onSlot(index) 호출. 해당 슬롯의 납품 가능 여부 판단은 호출 측이 한다.
type UseCommissionHotkeyOptions = {
  enabled: boolean
  onSlot: (slot: number) => void
}

export function useCommissionHotkey({
  enabled,
  onSlot,
}: UseCommissionHotkeyOptions) {
  useEffect(() => {
    if (!enabled || !isDesktopPointer()) return
    const onKeyDown = (e: KeyboardEvent) => {
      const slot = commissionHotkeySlot(e)
      if (slot === null) return
      e.preventDefault()
      onSlot(slot)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled, onSlot])
}
