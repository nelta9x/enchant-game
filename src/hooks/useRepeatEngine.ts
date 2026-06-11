import { useEffect, useRef, useState } from 'react'

// 누르고 있는 동안 액션을 "연사"하는 공유 엔진 — 스페이스 단축키(useEnhanceHotkey)와 마우스
// press-and-hold(useHoldRepeat)가 같은 폴링 주기·min-gap·발사 게이트를 쓰도록 한 곳에 둔다.
// 두 입력원의 박자가 따로 놀면(상수·게이트가 한쪽만 바뀌면) 같은 "꾹 누름"이 입력 장치에 따라
// 다르게 흐르므로, 입력원별 훅은 이벤트 배선만 하고 발사 정책은 전부 여기가 소유한다.
//
//  - 발사 게이트: disabled(강화 불가/쿨다운)면 쏘지 않고, 직전 발사 후 최소 REPEAT_MIN_GAP_MS 가
//    지나야 다음 발사. min-gap 은 '이중 발사 방지턱'이다 — 쿨다운(lockCount) 상태의 React 커밋이
//    폴링보다 늦게 반영돼도 그 사이에 두 번 쏘지 않는다. 실제 박자는 강화 잠금(연출 타임라인의
//    lockMs = 버스트 + 재강화 가드, 매회 떨림 길이에 따라 다름)이 정한다 — min-gap < 잠금이라 잠금이 binding.
//  - disabled 로 게이트를 통과하지 못하면 lastFireAt 을 건드리지 않아(쿨다운 중 헛발사로 박자가
//    밀리지 않게) 잠금이 그대로 cadence 가 된다.
//  - disabled/onFire 는 매 렌더 최신값을 ref 로 읽어, 잠금 토글마다 엔진을 재생성하지 않는다.
//  - 언마운트 시 연사 타이머를 정리한다(누른 채 화면이 사라져도 폭주하지 않게).

// 누름 반복 폴링 주기(ms) — 잠금이 풀리는 즉시 다음 발사를 잡아낼 만큼 촘촘하게(실제 박자는 강화 잠금이 정함).
const REPEAT_POLL_MS = 50
// 연속 발사 사이 최소 간격(ms) — 이중 발사 가드 전용 고정 바닥. 실제 페이싱은 강화 잠금(lockMs,
// 최소 떨림에서도 ~수백 ms)이 담당하므로 이 값은 그 잠금보다 충분히 짧게 둔다(잠금이 늘 우선).
const REPEAT_MIN_GAP_MS = 350

type UseRepeatEngineOptions = {
  disabled: boolean
  onFire: () => void
}

export type RepeatEngine = {
  // 발사 1회 시도 — 불가/쿨다운이 아니고 min-gap 이 지났을 때만 onFire.
  fireOnce: () => void
  // 홀드 연사 시작(폴링 타이머). 새로 시작했으면 true, 이미 홀드 중이면 false(중복 방어).
  startHold: () => boolean
  // 홀드 연사 정지(타이머 해제). 홀드 중이 아니면 무변화.
  stopHold: () => void
}

export function useRepeatEngine({
  disabled,
  onFire,
}: UseRepeatEngineOptions): RepeatEngine {
  // 발사 시점에 최신 disabled/onFire 를 읽는다(렌더 후 effect 로 갱신 — 엔진 재생성 불필요).
  const stateRef = useRef({ disabled, onFire })
  useEffect(() => {
    stateRef.current = { disabled, onFire }
  })

  // 엔진은 첫 렌더에 1회 생성(클로저에 타이머·박자 상태) — lazy useState 라 정체성이 안정적이어서
  // 호출 측 이벤트 리스너 effect 의 deps 로 넣어도 재부착을 일으키지 않는다(생성에 부수효과 없음).
  const [engine] = useState<RepeatEngine>(() => {
    let timer: ReturnType<typeof setInterval> | null = null
    let lastFireAt = -Infinity // 직전 발사 시각(performance.now). min-gap 판정용.

    const fireOnce = () => {
      if (stateRef.current.disabled) return
      const now = performance.now()
      if (now - lastFireAt < REPEAT_MIN_GAP_MS) return
      lastFireAt = now
      stateRef.current.onFire()
    }
    const startHold = () => {
      if (timer !== null) return false
      timer = setInterval(fireOnce, REPEAT_POLL_MS)
      return true
    }
    const stopHold = () => {
      if (timer !== null) {
        clearInterval(timer)
        timer = null
      }
    }
    return { fireOnce, startHold, stopHold }
  })

  // 언마운트 시 연사 정지(타이머 정리).
  useEffect(() => () => engine.stopHold(), [engine])

  return engine
}
