import { create } from 'zustand'
import {
  emptyEffectQueue,
  enqueue,
  finish,
  pump,
  type EffectQueueState,
  type EffectSpec,
} from './effectQueue'

// 연출(Effect) 시스템의 얇은 셸 — 순수 전이 코어(effectQueue)에 "시간"만 입힌다.
// 큐잉/배타성/lockCount 로직은 전부 코어에 있고, 여기서는 durationMs 가 지나면 finish 를 부르는
// setTimeout 만 건다. React 는 순수 구독자(running·lockCount 를 읽어 연출 재생/버튼 잠금).
// store 액션 안의 setTimeout 이라 effect 동기 setState 규칙(set-state-in-effect)을 건드리지 않는다.

type EffectActions = {
  // 연출을 큐에 넣고 즉시 스케줄을 돌린다(이벤트 핸들러에서 동기 호출 → 같은 커밋에 lockCount 반영).
  enqueueEffect: (spec: EffectSpec) => void
  // 내부: 시작 가능한 효과를 running 으로 옮기고 각자의 종료 타이머를 건다.
  _pump: () => void
  // 내부: 한 효과를 종료 처리하고 다시 스케줄을 돌린다(후속 next 시작 가능).
  _finish: (id: number) => void
}

export type EffectStore = EffectQueueState & EffectActions

// 코어 함수에 넘길 데이터 슬라이스만 추린다(액션 함수는 제외).
function slice(s: EffectStore): EffectQueueState {
  return {
    queue: s.queue,
    running: s.running,
    lockCount: s.lockCount,
    nextId: s.nextId,
  }
}

// 연출 store 팩토리. 기본 인스턴스(useEffectStore)는 앱 전역 공유, 테스트는 독립 인스턴스를 만든다.
export function createEffectStore() {
  return create<EffectStore>((set, get) => ({
    ...emptyEffectQueue(),

    enqueueEffect: (spec) => {
      set((s) => enqueue(slice(s), spec))
      get()._pump()
    },

    _pump: () => {
      const { state, started } = pump(slice(get()))
      if (started.length === 0) return
      set(state)
      for (const e of started) {
        setTimeout(() => get()._finish(e.id), e.durationMs)
      }
    },

    _finish: (id) => {
      set((s) => finish(slice(s), id))
      get()._pump()
    },
  }))
}

// 앱 전역 공유 연출 store 인스턴스.
export const useEffectStore = createEffectStore()
