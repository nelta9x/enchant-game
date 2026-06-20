import { create } from 'zustand'
import type { FloatingTextEvent } from '../components/FloatingTextEffect'

// 강화 "결과 공개(reveal)" 상태 — GameScreen 로컬 useState 에서 분리한 단일 출처. 검 스테이지(CenterStage)·
// 인벤토리 장착행이 결과를 망치 연출 뒤에 드러내도록, 강화 직후 store 는 검을 즉시 교체해도 이름·스탯·가격
// 강조·게임 클리어는 burstAt(= revealAt)까지 미룬다. 이 상태를 GameScreen 트리에서 떼어내면 reveal 전이가
// gold·lockCount 등 무관한 GameScreen 커밋과 분리돼, 무거운 레이아웃 트리를 재조정하지 않는다.
//
// 시간(setTimeout)은 effectStore 와 동일하게 store 셸에서 주입한다(뷰/로직 분리 — 순수 코어는 시간 비의존).

type ScheduleRevealInput = {
  // 강화 전(현재) 검 — 떨림 동안 이름·스탯에 유지할 검. null 이면 즉시 결과 검을 따른다.
  prevSwordId: string | null
  // 강화 성공으로 판매가가 올랐는가 — reveal 시점에 가격 강조(pricePopKey)를 한 번 튀긴다.
  pricePop: boolean
  // 최종 검 도달(게임 클리어) — reveal 시점에 클리어 모달을 연다.
  terminal: boolean
  // reveal 까지의 지연(ms) — 이번 강화 타임라인의 revealAtMs(떨림 끝 + 약간).
  revealAtMs: number
}

type ResultStore = {
  // heldSwordId 가 있으면 강화 전 검을, null 이면 결과(현재) 검을 이름·스탯에 보여 준다.
  heldSwordId: string | null
  // 가격 강조 트리거(단조 증가) — SwordStage 가 값 변화마다 판매가를 한 번 통 튀게 한다.
  pricePopKey: number
  // 강화 결과 플로팅 텍스트("아이구!..." 등) — 데이터 기반, burstAt 에 검 중상단에 뜬다.
  floatingText: FloatingTextEvent | null
  // 최종 검 도달 — 클리어 모달.
  cleared: boolean
  // reveal 예약 — heldSwordId 를 강화 전 검으로 잡고, revealAtMs 뒤에 풀며 pricePop·terminal 을 처리한다.
  scheduleReveal: (input: ScheduleRevealInput) => void
  showFloatingText: (event: FloatingTextEvent) => void
  dismissCleared: () => void
}

// reveal 타이머(모듈 단일) — 연사로 새 reveal 이 들어오면 직전 타이머를 덮어쓴다(가장 최근 강화 기준).
let revealTimer: number | null = null

export const useResultStore = create<ResultStore>((set) => ({
  heldSwordId: null,
  pricePopKey: 0,
  floatingText: null,
  cleared: false,
  scheduleReveal: ({ prevSwordId, pricePop, terminal, revealAtMs }) => {
    set({ heldSwordId: prevSwordId })
    if (revealTimer !== null) clearTimeout(revealTimer)
    revealTimer = window.setTimeout(() => {
      revealTimer = null
      set((s) => ({
        heldSwordId: null,
        pricePopKey: pricePop ? s.pricePopKey + 1 : s.pricePopKey,
        cleared: terminal ? true : s.cleared,
      }))
    }, revealAtMs)
  },
  showFloatingText: (event) => set({ floatingText: event }),
  dismissCleared: () => set({ cleared: false }),
}))
