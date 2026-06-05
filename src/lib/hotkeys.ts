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

// 이벤트 대상이 편집 입력(INPUT/TEXTAREA/SELECT/contentEditable)인가 — 그러면 단축키를 가로채지 않고
// 네이티브 입력에 맡긴다. EventTarget 을 덕타이핑으로 검사한다(node 테스트에서 DOM 전역에 의존하지 않도록
// instanceof 대신 속성 존재로 판정). 모든 단축키 판정이 공유하는 단일 정의.
export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as Partial<HTMLElement> | null
  if (!el) return false
  if (el.isContentEditable) return true
  return typeof el.tagName === 'string' && EDITABLE_TAGS.has(el.tagName)
}

// 이 keydown 이 "스페이스 강화 단축키" 컨텍스트인가 — 반복(꾹 누름) 여부는 보지 않는다.
// 스페이스 키 · 수정자(ctrl/meta/alt/shift) 없음 · 포커스가 편집 입력이 아님.
// 꾹 누름 동안의 OS 키반복(e.repeat)에도 스크롤·포커스버튼 활성을 막아야(preventDefault) 하므로,
// "반복도 막을 컨텍스트"와 "강화를 시작/연사할 시점(아래 isEnhanceHotkeyEvent)"을 분리한다.
export function isEnhanceHotkeyContext(e: KeyboardEvent): boolean {
  if (e.code !== ENHANCE_HOTKEY_CODE) return false
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return false
  return !isEditableTarget(e.target)
}

// 이 keydown 을 "스페이스 강화"의 (첫) 발동으로 처리해야 하는가 — 컨텍스트 + 반복 아님.
// 꾹 누름 연사는 OS 키반복이 아니라 자체 타이머가 구동하므로, 여기선 반복을 제외한다.
export function isEnhanceHotkeyEvent(e: KeyboardEvent): boolean {
  if (e.repeat) return false
  return isEnhanceHotkeyContext(e)
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
  if (isEditableTarget(e.target)) return null
  const slot = COMMISSION_SLOT_BY_CODE[e.code]
  return slot === undefined ? null : slot
}

// S = 상점 열기 단축키로 쓰는 KeyboardEvent.code — 키보드 레이아웃과 무관한 물리 키 식별자.
export const SHOP_HOTKEY_CODE = 'KeyS'

// 이 keydown 을 "S = 상점 열기" 단축키로 처리해야 하는가.
// S 키 · 수정자 없음 · 반복(꾹 누름) 아님 · 편집 입력 포커스 아님일 때만 true(스페이스 강화와 동일 정책).
// 상점 열기는 비파괴·가역(닫으면 됨)이라 단순 keydown 으로 처리한다(판매·보관의 keyup-탭과 대비).
export function isShopHotkeyEvent(e: KeyboardEvent): boolean {
  if (e.code !== SHOP_HOTKEY_CODE) return false
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return false
  if (e.repeat) return false
  return !isEditableTarget(e.target)
}

// 단독-수정자 '탭'(눌렀다 뗌) 액션: Ctrl = 판매, Alt = 보관(요청: "Ctrl 누르면 판매, Alt 누르면 보관").
// 판매·보관은 비가역(검 소모)이라 keydown 으로 발동하면 모든 조합키(Ctrl+R, Alt+Tab …)의 수정자
// keydown 에서 오발한다 — 그래서 "중간에 다른 키가 끼지 않은 단독 탭"을 keyup 에서 판정한다(useActionHotkeys).
// KeyboardEvent.key 는 좌/우 수정자 모두 'Control'·'Alt' 로 같아 레이아웃·좌우 무관하게 매핑된다.
export type ModifierAction = 'sell' | 'store'

const MODIFIER_ACTION_BY_KEY: Record<string, ModifierAction> = {
  Control: 'sell',
  Alt: 'store',
}

// 이 key 가 단독-수정자 액션 키(Control/Alt)이면 해당 액션, 아니면 null.
export function modifierActionForKey(key: string): ModifierAction | null {
  return MODIFIER_ACTION_BY_KEY[key] ?? null
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
