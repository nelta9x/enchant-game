import { describe, it, expect } from 'vitest'
import {
  commissionHotkeySlot,
  isEnhanceHotkeyContext,
  isEnhanceHotkeyEvent,
  modifierActionForKey,
} from './hotkeys'

// KeyboardEvent 의 최소 형태만 만들어 순수 판정 함수를 검증한다(테스트 환경은 node — DOM 전역 없음).
// 기본값은 "빈 영역(BODY) 포커스 + 수정자 없는 단발 스페이스" = 단축키로 처리돼야 하는 상태.
function makeEvent(
  overrides: Partial<Omit<KeyboardEvent, 'target'>> & { target?: unknown } = {},
): KeyboardEvent {
  return {
    code: 'Space',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    target: { tagName: 'BODY', isContentEditable: false },
    ...overrides,
  } as unknown as KeyboardEvent
}

describe('isEnhanceHotkeyEvent — 스페이스 강화 단축키 판정', () => {
  it('수정자 없는 단발 스페이스(빈 영역 포커스)는 단축키로 처리한다', () => {
    expect(isEnhanceHotkeyEvent(makeEvent())).toBe(true)
  })

  it('스페이스가 아닌 키는 무시한다', () => {
    expect(isEnhanceHotkeyEvent(makeEvent({ code: 'Enter' }))).toBe(false)
    expect(isEnhanceHotkeyEvent(makeEvent({ code: 'KeyA' }))).toBe(false)
  })

  it('수정자(ctrl/meta/alt/shift)가 눌리면 무시한다', () => {
    expect(isEnhanceHotkeyEvent(makeEvent({ ctrlKey: true }))).toBe(false)
    expect(isEnhanceHotkeyEvent(makeEvent({ metaKey: true }))).toBe(false)
    expect(isEnhanceHotkeyEvent(makeEvent({ altKey: true }))).toBe(false)
    expect(isEnhanceHotkeyEvent(makeEvent({ shiftKey: true }))).toBe(false)
  })

  it('키 반복(꾹 누름)은 무시해 연타를 막는다', () => {
    expect(isEnhanceHotkeyEvent(makeEvent({ repeat: true }))).toBe(false)
  })

  it('편집 입력(INPUT/TEXTAREA/SELECT·contentEditable)에 포커스면 가로채지 않는다', () => {
    expect(
      isEnhanceHotkeyEvent(makeEvent({ target: { tagName: 'INPUT' } })),
    ).toBe(false)
    expect(
      isEnhanceHotkeyEvent(makeEvent({ target: { tagName: 'TEXTAREA' } })),
    ).toBe(false)
    expect(
      isEnhanceHotkeyEvent(makeEvent({ target: { tagName: 'SELECT' } })),
    ).toBe(false)
    expect(
      isEnhanceHotkeyEvent(
        makeEvent({ target: { tagName: 'DIV', isContentEditable: true } }),
      ),
    ).toBe(false)
  })

  it('버튼·링크에 포커스여도 가로챈다(스페이스=항상 강화 — 중복은 preventDefault 가 막는다)', () => {
    expect(
      isEnhanceHotkeyEvent(makeEvent({ target: { tagName: 'BUTTON' } })),
    ).toBe(true)
    expect(isEnhanceHotkeyEvent(makeEvent({ target: { tagName: 'A' } }))).toBe(
      true,
    )
  })

  it('target 이 null 이어도 안전하게 처리한다', () => {
    expect(isEnhanceHotkeyEvent(makeEvent({ target: null }))).toBe(true)
  })

  it('target 의 tagName 이 없거나 문자열이 아니어도 편집 입력으로 보지 않는다(덕타이핑 가드)', () => {
    // typeof tagName === 'string' 가드 때문에 명시적 편집 태그가 아니면 가로챈다(true).
    expect(isEnhanceHotkeyEvent(makeEvent({ target: {} }))).toBe(true)
    expect(
      isEnhanceHotkeyEvent(makeEvent({ target: { tagName: undefined } })),
    ).toBe(true)
    expect(isEnhanceHotkeyEvent(makeEvent({ target: { tagName: 123 } }))).toBe(
      true,
    )
    expect(isEnhanceHotkeyEvent(makeEvent({ target: { tagName: null } }))).toBe(
      true,
    )
  })
})

describe('isEnhanceHotkeyContext — 스페이스 강화 "컨텍스트" 판정(반복 무관)', () => {
  it('반복(꾹 누름)이어도 컨텍스트로 본다 — preventDefault(스크롤·버튼 활성 차단)는 반복에도 적용', () => {
    // isEnhanceHotkeyEvent 와 달리 repeat 를 보지 않는다: 연사 발동 시점이 아니라 "기본 동작을 막을 상황"인가.
    expect(isEnhanceHotkeyContext(makeEvent({ repeat: true }))).toBe(true)
    expect(isEnhanceHotkeyContext(makeEvent({ repeat: false }))).toBe(true)
  })

  it('스페이스가 아니거나 수정자가 눌리면 컨텍스트가 아니다', () => {
    expect(isEnhanceHotkeyContext(makeEvent({ code: 'Enter' }))).toBe(false)
    expect(isEnhanceHotkeyContext(makeEvent({ ctrlKey: true }))).toBe(false)
    expect(isEnhanceHotkeyContext(makeEvent({ altKey: true }))).toBe(false)
  })

  it('편집 입력 포커스면 컨텍스트가 아니다(네이티브 입력 보존)', () => {
    expect(
      isEnhanceHotkeyContext(makeEvent({ target: { tagName: 'INPUT' } })),
    ).toBe(false)
  })
})

describe('commissionHotkeySlot — 1·2·3 납품 단축키 → 슬롯', () => {
  it('Digit1/2/3 → 슬롯 0/1/2', () => {
    expect(commissionHotkeySlot(makeEvent({ code: 'Digit1' }))).toBe(0)
    expect(commissionHotkeySlot(makeEvent({ code: 'Digit2' }))).toBe(1)
    expect(commissionHotkeySlot(makeEvent({ code: 'Digit3' }))).toBe(2)
  })

  it('숫자패드 Numpad1/2/3 도 같은 슬롯에 매핑', () => {
    expect(commissionHotkeySlot(makeEvent({ code: 'Numpad1' }))).toBe(0)
    expect(commissionHotkeySlot(makeEvent({ code: 'Numpad3' }))).toBe(2)
  })

  it('범위 밖 숫자/다른 키는 null', () => {
    expect(commissionHotkeySlot(makeEvent({ code: 'Digit4' }))).toBeNull()
    expect(commissionHotkeySlot(makeEvent({ code: 'Digit0' }))).toBeNull()
    expect(commissionHotkeySlot(makeEvent({ code: 'KeyA' }))).toBeNull()
    expect(commissionHotkeySlot(makeEvent({ code: 'Space' }))).toBeNull()
  })

  it('수정자/반복은 무시한다', () => {
    expect(
      commissionHotkeySlot(makeEvent({ code: 'Digit1', ctrlKey: true })),
    ).toBeNull()
    expect(
      commissionHotkeySlot(makeEvent({ code: 'Digit1', metaKey: true })),
    ).toBeNull()
    expect(
      commissionHotkeySlot(makeEvent({ code: 'Digit1', repeat: true })),
    ).toBeNull()
  })

  it('편집 입력에 포커스면 가로채지 않는다(숫자 입력 보존)', () => {
    expect(
      commissionHotkeySlot(makeEvent({ code: 'Digit1', target: { tagName: 'INPUT' } })),
    ).toBeNull()
    expect(
      commissionHotkeySlot(
        makeEvent({ code: 'Digit2', target: { tagName: 'DIV', isContentEditable: true } }),
      ),
    ).toBeNull()
  })

  it('버튼·빈 영역 포커스면 슬롯으로 처리한다', () => {
    expect(
      commissionHotkeySlot(makeEvent({ code: 'Digit1', target: { tagName: 'BUTTON' } })),
    ).toBe(0)
    expect(commissionHotkeySlot(makeEvent({ code: 'Digit2', target: null }))).toBe(1)
  })
})

describe('modifierActionForKey — Ctrl=판매 / Alt=보관 단독-수정자 매핑', () => {
  it('Control → sell, Alt → store', () => {
    expect(modifierActionForKey('Control')).toBe('sell')
    expect(modifierActionForKey('Alt')).toBe('store')
  })

  it('다른 키(Shift/Meta/일반 키)는 null', () => {
    expect(modifierActionForKey('Shift')).toBeNull()
    expect(modifierActionForKey('Meta')).toBeNull()
    expect(modifierActionForKey('s')).toBeNull()
    expect(modifierActionForKey(' ')).toBeNull()
  })
})
