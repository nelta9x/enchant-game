import { useCallback, useEffect, useRef } from 'react'

// 누르고 있는 동안 액션을 "연사"하는 마우스 press-and-hold 엔진(요청: "마우스로 꾹 누르면 계속 강화").
// 강화 버튼에 붙여 강화 → 쿨다운 → 강화 … 가 누르고만 있어도 이어지게 한다. 스페이스 단축키
// (useEnhanceHotkey)의 hold-repeat 와 같은 박자를 의도한다 — 두 입력이 따로 놀지 않도록.
//
//  - 발사 게이트: disabled(강화 불가/쿨다운)면 쏘지 않고, 직전 발사 후 최소 REPEAT_MIN_GAP_MS 가 지나야 다음
//    발사. min-gap 은 '이중 발사 방지턱'이다 — 쿨다운(lockCount) 상태의 React 커밋이 폴링보다 늦게 반영돼도
//    그 사이에 두 번 쏘지 않아, 한 쿨다운에 강화가 두 번 박히는 사고를 막는다. 실제 박자는 강화 잠금
//    (연출 타임라인의 lockMs = 버스트 + 재강화 가드, 매회 떨림 길이에 따라 다름)이 정한다 — min-gap < 잠금이라 잠금이 binding.
//  - 마우스: pointerdown 즉시 1회 + 폴링 반복(누르는 동안). 떼면(window pointerup/cancel/blur) 멈춘다.
//  - 터치/펜: 'click'(완료된 탭)에서 1회 — 접촉(pointerdown)이 아니라 떼는 순간 확정이라, 누른 채 미끄러뜨려
//    취소하거나 스크롤로 이어지는 제스처에 오발하지 않는다(연사 없음 — 요청은 "마우스로 꾹").
//  - 키보드(Enter)·보조기술: click(입력원이 마우스가 아닌 것)에서 1회. (스페이스는 전역 단축키가 전담.)
//
// disabled/onFire 는 매 렌더 최신값을 ref 로 읽어, 잠금 토글마다 핸들러를 재생성하지 않는다(hotkey 훅과 동일).
type UseHoldRepeatOptions = {
  disabled: boolean
  onFire: () => void
}

// 누름 반복 폴링 주기(ms) — 잠금이 풀리는 즉시 다음 발사를 잡아낼 만큼 촘촘하게(실제 박자는 강화 잠금이 정함).
// (useEnhanceHotkey 와 의도적으로 같은 값 — 한쪽을 바꾸면 다른 쪽도 맞출 것.)
const REPEAT_POLL_MS = 50
// 연속 발사 사이 최소 간격(ms) — 이중 발사 가드 전용 고정 바닥(useEnhanceHotkey 와 같은 값·의도).
// 실제 페이싱은 강화 잠금(lockMs)이 담당하므로 이 값은 그보다 충분히 짧게 둔다.
const REPEAT_MIN_GAP_MS = 350

export function useHoldRepeat<T extends HTMLElement = HTMLElement>({
  disabled,
  onFire,
}: UseHoldRepeatOptions) {
  // 발사 시점에 최신 disabled/onFire 를 읽는다(렌더 후 effect 로 갱신해도 엔진 재생성 불필요).
  const stateRef = useRef({ disabled, onFire })
  useEffect(() => {
    stateRef.current = { disabled, onFire }
  })

  // 엔진(타이머·리스너)은 마운트 시 한 번 만든 지역 함수로 두고(self-reference·정리가 단순), 바깥 이벤트
  // 핸들러에는 ref 로만 노출한다 — 핸들러는 fireOnce()/startMouseHold() 를 호출만 한다.
  const apiRef = useRef<{
    fireOnce: () => void
    startMouseHold: () => void
  } | null>(null)

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null
    let lastFireAt = -Infinity

    // 발사 1회 시도 — 불가/쿨다운이 아니고 min-gap 이 지났을 때만. disabled 를 먼저 보고 통과 못 하면
    // lastFireAt 을 건드리지 않아(쿨다운 중 헛발사로 박자가 밀리지 않게) 잠금이 그대로 cadence 가 된다.
    const fireOnce = () => {
      if (stateRef.current.disabled) return
      const now = performance.now()
      if (now - lastFireAt < REPEAT_MIN_GAP_MS) return
      lastFireAt = now
      stateRef.current.onFire()
    }
    // 연사 정지 + 안전 리스너 해제. 같은 함수 참조(stop)로 add/remove 해야 정확히 떼인다.
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer)
        timer = null
      }
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
      window.removeEventListener('blur', stop)
    }
    const startMouseHold = () => {
      if (timer !== null) return // 이미 홀드 중(중복 방어)
      timer = setInterval(fireOnce, REPEAT_POLL_MS)
      // 버튼 밖에서 떼거나 포커스를 잃어도 확실히 멈추도록 window 에서 해제를 듣는다.
      window.addEventListener('pointerup', stop)
      window.addEventListener('pointercancel', stop)
      window.addEventListener('blur', stop)
    }

    apiRef.current = { fireOnce, startMouseHold }
    return stop // 언마운트 시 타이머·리스너 정리(누른 채 화면이 사라져도 폭주하지 않게).
  }, [])

  const onPointerDown = useCallback((e: React.PointerEvent<T>) => {
    if (e.button !== 0 || !e.isPrimary) return // 주 포인터(왼쪽 버튼/주 접촉)만
    // 마우스만 '누름(pointerdown)'에서 발사 + 연사한다. 터치/펜은 여기서 안 쏘고 아래 onClick(완료된 탭)에서
    // 1회 쏜다 — 접촉 즉시 발사하면 취소·스크롤 제스처에 오발하기 때문(탭은 떼는 순간 확정).
    if (e.pointerType !== 'mouse') return
    apiRef.current?.fireOnce() // 누르는 즉시 1회
    apiRef.current?.startMouseHold()
  }, [])

  const onClick = useCallback((e: React.MouseEvent<T>) => {
    // 마우스 click 은 위 pointerdown 이 이미 처리했으므로 무시. 터치/펜 탭과 키보드(Enter)·보조기술의 click
    // 만 1회 발사한다. 'click' 의 pointerType 로 입력원을 가른다(마우스='mouse', 터치='touch', 펜='pen',
    // 키보드·프로그램 호출=''). pointerType 이 없는 구형 브라우저에선 마우스 click 이 한 번 더 들어와도
    // min-gap 이 막아 이중 발사가 안 된다(graceful degradation).
    if ((e.nativeEvent as PointerEvent).pointerType === 'mouse') return
    apiRef.current?.fireOnce()
  }, [])

  return { onPointerDown, onClick }
}
