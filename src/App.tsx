import { useEffect } from 'react'
import { TopBar } from './components/TopBar'
import { EnhanceStage } from './components/EnhanceStage'
import { PanelTabs } from './components/PanelTabs'
import { useI18nStore, useT } from './i18n'

// 스프린트 1 베이스 레이아웃: HUD(TopBar) · 강화 무대(EnhanceStage) · 하단 패널(PanelTabs) 골격.
// 실제 게임 로직(강화 엔진 / 게임 진행 상태)은 스프린트 2부터 채운다.
function App() {
  const t = useT()
  const lang = useI18nStore((s) => s.lang)

  // 언어 변경 시 문서 lang 속성과 탭 제목을 동기화한다.
  useEffect(() => {
    document.documentElement.lang = lang
    document.title = t('app.title')
  }, [lang, t])

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-4 px-4 py-5">
      <TopBar />
      <main className="flex flex-1 items-center justify-center">
        <EnhanceStage />
      </main>
      <PanelTabs />
      <footer className="pb-2 text-center text-xs text-muted">
        {t('app.footer')}
      </footer>
    </div>
  )
}

export default App
