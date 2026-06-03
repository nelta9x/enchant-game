import { TopBar } from './components/TopBar'
import { EnhanceStage } from './components/EnhanceStage'
import { PanelTabs } from './components/PanelTabs'

// 스프린트 1 베이스 레이아웃: HUD(TopBar) · 강화 무대(EnhanceStage) · 하단 패널(PanelTabs) 골격.
// 실제 게임 로직(강화 엔진 / 데이터 모델)은 스프린트 2부터 채운다.
function App() {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-4 px-4 py-5">
      <TopBar />
      <main className="flex flex-1 items-center justify-center">
        <EnhanceStage />
      </main>
      <PanelTabs />
      <footer className="pb-2 text-center text-xs text-muted">
        스프린트 1 · 베이스 레이아웃 골격 — 게임 로직은 스프린트 2부터
        구현됩니다.
      </footer>
    </div>
  )
}

export default App
