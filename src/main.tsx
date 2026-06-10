import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { dataManager } from './data/DataManager'
import { useGameStore } from './store/gameStore'

// 게임이 켜질 때 데이터를 적재한다(동기). 이후 모든 게임 데이터는 DataManager 경유.
dataManager.load()

// 전역 store 는 적재 전(모듈 평가 시점) 생성돼 최고 도달치(maxLevelReached)가 0 으로 출발한다.
// 적재 후 시작 검 레벨(+1)로 보정한다 — RecordGauge 의 "현재 ≤ 최고" 불변식을 첫 프레임부터 지킨다.
useGameStore.getState().syncRecordToCurrent()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
