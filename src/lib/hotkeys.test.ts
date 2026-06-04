import { describe, it, expect } from 'vitest'
import { isEnhanceHotkeyEvent } from './hotkeys'

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
