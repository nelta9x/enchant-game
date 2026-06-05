import { useEffect } from 'react'
import { GameScreen } from './components/GameScreen'
import { useI18nStore, useT } from './i18n'
import { useCommissionStore } from './store/commissionStore'

// 메인 강화 화면을 띄운다. 게임 상태는 gameStore, 데이터는 DataManager(시작 시 load) 경유.
function App() {
  const t = useT()
  const lang = useI18nStore((s) => s.lang)

  // 언어 변경 시 문서 lang 속성과 탭 제목을 동기화한다.
  useEffect(() => {
    document.documentElement.lang = lang
    document.title = t('app.title')
  }, [lang, t])

  // 의뢰 시스템의 주기 tick(생성/만료/재생성)을 앱 수명 동안 돌린다.
  useEffect(() => {
    useCommissionStore.getState().start()
    return () => useCommissionStore.getState().stop()
  }, [])

  return <GameScreen />
}

export default App
