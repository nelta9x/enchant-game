import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { dataManager } from './data/DataManager'

// 게임이 켜질 때 데이터를 적재한다(동기). 이후 모든 게임 데이터는 DataManager 경유.
dataManager.load()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
