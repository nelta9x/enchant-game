import { create } from 'zustand'

// 난이도: 디자인 문서 기준 Easy / Hard 두 가지.
export type Difficulty = 'easy' | 'hard'

// 하단 패널 탭.
export type PanelTab = 'shop' | 'forge' | 'inventory'

// UI 전용 상태 스토어.
// 게임 진행 상태(골드 / 검 / 인벤토리)는 스프린트 2에서 별도 gameStore로 분리해 추가한다.
type UiState = {
  difficulty: Difficulty
  activeTab: PanelTab
  setDifficulty: (difficulty: Difficulty) => void
  setActiveTab: (tab: PanelTab) => void
}

export const useUiStore = create<UiState>((set) => ({
  difficulty: 'hard',
  activeTab: 'shop',
  setDifficulty: (difficulty) => set({ difficulty }),
  setActiveTab: (activeTab) => set({ activeTab }),
}))
