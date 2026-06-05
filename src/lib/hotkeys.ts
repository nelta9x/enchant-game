// 데스크탑 전용 키보드 단축키 판정 — 순수 함수라 node 테스트 환경에서도 DOM 전역 없이 검증된다.
// (스페이스 = 강화 단축키의 "가로채도 되는 입력인가" 정책을 한곳에 모은다. 리스너 lifecycle 은 useEnhanceHotkey.)

// 강화 단축키로 쓰는 KeyboardEvent.code — 키보드 레이아웃과 무관한 물리 키 식별자.
export const ENHANCE_HOTKEY_CODE = 'Space'

// 스페이스를 가로채지 않고 네이티브 동작에 맡길 편집 가능한 입력 요소들.
// 버튼·링크는 의도적으로 제외 — 포커스돼 있어도 스페이스는 강화로 가로챈다(중복 실행은 preventDefault 가 막는다).
const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

// 데스크탑(정밀 포인터 + 호버 가능 = 마우스/트랙패드) 환경인지 판정하는 미디어 쿼리.
// 터치 전용 기기(물리 스페이스 키가 없음)는 매칭되지 않아 단축키가 비활성화된다.
const DESKTOP_POINTER_QUERY = '(hover: hover) and (pointer: fine)'

// 이 keydown 을 "스페이스 강화 단축키"로 처리해야 하는가.
// 스페이스 키 · 수정자(ctrl/meta/alt/shift) 없음 · 키 반복(꾹 누름) 아님 ·
// 포커스가 편집 입력(INPUT/TEXTAREA/SELECT/contentEditable)이 아닐 때만 true.
export function isEnhanceHotkeyEvent(e: KeyboardEvent): boolean {
  if (e.code !== ENHANCE_HOTKEY_CODE) return false
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return false
  if (e.repeat) return false
  // EventTarget 을 덕타이핑으로 검사한다 — node 테스트에서 DOM 전역(HTMLElement)에 의존하지 않도록
  // instanceof 대신 속성 존재로 판정한다.
  const target = e.target as Partial<HTMLElement> | null
  if (target) {
    if (target.isContentEditable) return false
    if (
      typeof target.tagName === 'string' &&
      EDITABLE_TAGS.has(target.tagName)
    ) {
      return false
    }
  }
  return true
}

// 의뢰 납품 단축키: 숫자 1·2·3(상단 행 또는 숫자패드) → 의뢰 슬롯 0·1·2.
// 키보드 레이아웃 무관한 물리 키(code)로 슬롯에 매핑한다.
const COMMISSION_SLOT_BY_CODE: Record<string, number> = {
  Digit1: 0,
  Numpad1: 0,
  Digit2: 1,
  Numpad2: 1,
  Digit3: 2,
  Numpad3: 2,
}

// 이 keydown 이 "의뢰 납품 단축키"이면 대상 슬롯 인덱스(0~2), 아니면 null.
// 수정자 없음 · 반복(꾹 누름) 아님 · 포커스가 편집 입력이 아닐 때만 매핑한다(스페이스 강화와 동일 정책).
export function commissionHotkeySlot(e: KeyboardEvent): number | null {
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return null
  if (e.repeat) return null
  const target = e.target as Partial<HTMLElement> | null
  if (target) {
    if (target.isContentEditable) return null
    if (
      typeof target.tagName === 'string' &&
      EDITABLE_TAGS.has(target.tagName)
    ) {
      return null
    }
  }
  const slot = COMMISSION_SLOT_BY_CODE[e.code]
  return slot === undefined ? null : slot
}

// 데스크탑(마우스·트랙패드) 환경인지. 비브라우저(window 없음)에서는 false.
export function isDesktopPointer(): boolean {
  if (
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function'
  ) {
    return false
  }
  return window.matchMedia(DESKTOP_POINTER_QUERY).matches
}
