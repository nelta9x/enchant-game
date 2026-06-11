import {
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'

// 모달 다이얼로그의 공통 동작 크롬(포커스 관리 · ESC 닫기 · Tab 포커스 트랩) — ShopModal 과
// GameClearModal 이 그대로 복제하던 로직을 한 곳에 둔다. 오버레이·패널의 모양/모션(JSX)은 각
// 모달이 소유하고, 여기는 접근성 동작 규약만 담는다:
//  - 열릴 때 닫기 버튼(closeRef)에 포커스를 두고, 닫힐 때 직전 포커스 요소로 복원한다.
//  - 열려 있는 동안 ESC 로 닫는다(onClose 는 ref 로 고정해 리스너가 open 토글 시에만 재등록).
//  - trapTab: 모달이 열린 동안 Tab 포커스를 패널(panelRef) 안에 가둔다(aria-modal 보강,
//    배경의 언어 토글 등으로 포커스가 새는 것을 막는다) — 패널의 onKeyDown 에 단다.
export function useModalDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  // onClose 를 ref로 고정해 ESC 리스너가 onClose 정체성에 의존(매 렌더 재등록)하지 않게 한다.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  // 열릴 때 닫기 버튼에 포커스를 두고, 닫힐 때 직전 포커스 요소로 복원한다.
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    return () => prev?.focus?.()
  }, [open])

  // 열려 있는 동안 ESC로 닫는다(리스너는 open 토글 시에만 재등록).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  // 포커스 트랩 — 모달이 열린 동안 Tab 포커스를 패널 안에 가둔다. 닫힐 때 복원은 위 효과가 담당.
  const trapTab = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !panelRef.current) return
    const focusables = panelRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    if (focusables.length === 0) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return { panelRef, closeRef, trapTab }
}
