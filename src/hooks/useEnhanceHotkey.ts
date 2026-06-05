import { useEffect, useRef } from 'react'
import {
  ENHANCE_HOTKEY_CODE,
  isDesktopPointer,
  isEnhanceHotkeyContext,
  isEnhanceHotkeyEvent,
} from '../lib/hotkeys'
import { SHAKE_SEC } from '../components/shake'

// 데스크탑에서 스페이스바로 강화를 실행하는 전역 단축키 훅(요청: "데스크탑 환경에서 스페이스 = 강화").
// - 데스크탑(정밀 포인터+호버) 환경에서만 리스너를 부착 — 터치 전용 기기는 제외.
// - enabled=false(예: 상점 열림)면 부착하지 않아 모달 내부의 네이티브 스페이스 동작을 보존한다.
// - preventDefault 로 스페이스 기본 동작(페이지 스크롤 + 포커스된 버튼 활성)을 막는다 — 포커스 위치와
//   무관하게 정확히 강화만 실행된다(Enter 는 그대로 포커스된 컨트롤을 활성 → 접근성 보존).
// - 꾹 누름 = 연사: 누른 동안 자체 타이머로 강화를 반복 시도한다(OS 키반복에 의존하지 않아 지연·환경차 없음).
//   각 시도는 버튼과 동일 게이트(disabled = 강화 불가/연출 잠금)를 따르고, 직전 발사 후 최소 SHAKE_SEC 만큼
//   간격을 둬(min-gap) 잠금이 짧거나 없는 결과(예: 방지)에서도 강화 잠금과 같은 박자로 흐른다.
type UseEnhanceHotkeyOptions = {
  enabled: boolean
  disabled: boolean
  onEnhance: () => void
}

// 꾹 누름 동안 강화 가능 여부를 살피는 폴링 주기(ms) — 잠금이 풀리는 즉시 다음 발사를 잡아낼 만큼 촘촘하게.
// (실제 연사 박자는 아래 min-gap = SHAKE_SEC 가 정한다. 이 값은 반응 해상도일 뿐.)
const REPEAT_POLL_MS = 50

// 연속 발사 사이 최소 간격(ms) — 강화 잠금(SHAKE_SEC)과 같은 박자. 폴링이 촘촘해도 이보다 빨리 쏘지 않아
// 잠금이 없는 결과(방지)에서도 일정 속도를 유지하고, disabled 가 React 커밋보다 늦게 갱신돼도 이중 발사를 막는다.
const REPEAT_MIN_GAP_MS = SHAKE_SEC * 1000

export function useEnhanceHotkey({
  enabled,
  disabled,
  onEnhance,
}: UseEnhanceHotkeyOptions) {
  // 최신 disabled/onEnhance 를 ref 로 고정 — 0.4s 잠금 토글마다 리스너·연사 타이머를 재부착하지 않는다.
  // 리스너는 발생 시점에 ref.current 를 읽으므로 렌더 후 effect 로 갱신해도 안전하다(useActionHotkeys 와 동일).
  const stateRef = useRef({ disabled, onEnhance })
  useEffect(() => {
    stateRef.current = { disabled, onEnhance }
  })

  useEffect(() => {
    if (!enabled || !isDesktopPointer()) return
    let timer: ReturnType<typeof setInterval> | null = null
    let lastFireAt = -Infinity // 직전 발사 시각(performance.now). min-gap 판정용.

    // 잠금/불가가 아니고 직전 발사 후 최소 간격이 지났으면 강화 1회(버튼과 동일 게이트). 아니면 다음 폴에 재시도.
    const tryEnhance = () => {
      if (stateRef.current.disabled) return
      const now = performance.now()
      if (now - lastFireAt < REPEAT_MIN_GAP_MS) return
      lastFireAt = now
      stateRef.current.onEnhance()
    }
    const stopRepeat = () => {
      if (timer !== null) {
        clearInterval(timer)
        timer = null
      }
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (!isEnhanceHotkeyContext(e)) return
      e.preventDefault() // 스크롤·포커스된 버튼의 스페이스 활성 차단(꾹 누름 반복 포함).
      if (!isEnhanceHotkeyEvent(e)) return // OS 키반복은 무시 — 연사는 아래 타이머가 구동.
      if (timer !== null) return // 이미 홀드 중(중복 keydown 방어).
      tryEnhance() // 첫 눌림 즉시 1회.
      timer = setInterval(tryEnhance, REPEAT_POLL_MS) // 이후 잠금 풀릴 때마다 연사.
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === ENHANCE_HOTKEY_CODE) stopRepeat()
    }
    // 포커스 이탈(Alt+Tab 등으로 keyup 누락 가능) 시 연사를 멈춰 폭주를 막는다.
    const onBlur = () => stopRepeat()

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      stopRepeat()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [enabled])
}
