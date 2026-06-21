import { useEffect, useRef } from 'react'
import {
  isDesktopPointer,
  isEditableTarget,
  modifierActionForKey,
} from '../lib/hotkeys'

// 데스크탑 액션 단축키 묶음(useEnhanceHotkey 패턴 확장):
//   · Ctrl '탭' = 판매, Alt '탭' = 보관 — 단독으로 눌렀다 뗀(중간에 다른 키 없음) 경우에만 발동한다.
//     조합키(Ctrl+R, Ctrl+S, Alt+Tab …)에서 수정자 keydown 으로 오발하지 않도록 keyup-탭으로 판정한다:
//     수정자가 눌린 뒤 다른 키가 끼면 그 홀드를 무효화하고, 깨끗한 단독 탭의 keyup 에서만 액션을 낸다.
// 데스크탑(정밀 포인터+호버) 환경에서만 부착한다 — 터치 전용 기기 제외.
// enabled=false 면 부착하지 않는다(모달 등에서 입력 보존).
// 가능 여부(판매/보관 게이트)는 호출 측 핸들러가 소유한다 — sell()·store() 는 무효 상태면 no-op(버튼과 동일).
type UseActionHotkeysOptions = {
  enabled: boolean
  onSell: () => void
  onStore: () => void
}

export function useActionHotkeys({
  enabled,
  onSell,
  onStore,
}: UseActionHotkeysOptions) {
  // 콜백을 ref 로 고정해 콜백 변경 시 리스너(와 탭 상태 머신)를 재부착하지 않는다.
  // 리스너는 이벤트 발생 시점에 cbRef.current 를 읽으므로 렌더 후 effect 에서 갱신해도 안전하다.
  const cbRef = useRef({ onSell, onStore })
  useEffect(() => {
    cbRef.current = { onSell, onStore }
  })

  useEffect(() => {
    if (!enabled || !isDesktopPointer()) return

    // 지금 "깨끗하게" 눌려 있는 단독 수정자 키(Control/Alt). 중간에 다른 키가 끼면 null 로 무효화한다.
    let armed: string | null = null

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return // 꾹 누름 반복은 탭 판정에 영향 없음(무시).
      if (modifierActionForKey(e.key) !== null) {
        // 단독 수정자 keydown: 아직 다른 키가 안 끼었을 때만(armed===null) 탭 후보로 무장.
        // 이미 무장돼 있으면 두 번째 수정자가 겹친 것 → 조합으로 보고 무효화.
        armed = armed === null ? e.key : null
        return
      }
      // 그 외 키의 keydown → 진행 중인 수정자 홀드를 "더러움"으로 만들어 탭을 취소(조합키 오발 방지).
      armed = null
    }

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== armed) return
      armed = null
      if (isEditableTarget(e.target)) return // 편집 입력 포커스면 가로채지 않는다.
      const action = modifierActionForKey(e.key)
      e.preventDefault() // Alt keyup 의 메뉴바 포커스(일부 브라우저) 등 기본 동작 차단.
      if (action === 'sell') cbRef.current.onSell()
      else if (action === 'store') cbRef.current.onStore()
    }

    // 포커스 이탈(Alt+Tab, Ctrl+T 등 조합으로 수정자 keyup 이 안 올 수 있음) 시 상태를 리셋해 멈추지 않게 한다.
    const onBlur = () => {
      armed = null
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [enabled])
}
