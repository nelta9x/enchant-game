import { create } from 'zustand'

// UI 전용 상태 store. 게임 진행 상태(골드 / 검 / 인벤토리)는 gameStore가 보유한다.
type UiState = {
  // 방지권 사용(armed) 토글 — 강화 실패 시 파괴 방지에 방지권을 쓸지에 대한 의도.
  // 실제 사용 가능 여부(보유 수량·단계)는 뷰에서 게이팅한다.
  protectionArmed: boolean
  toggleProtection: () => void
}

export const useUiStore = create<UiState>((set) => ({
  protectionArmed: false,
  toggleProtection: () => set((s) => ({ protectionArmed: !s.protectionArmed })),
}))
