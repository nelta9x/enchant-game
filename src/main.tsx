import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { dataManager } from './data/DataManager'
import { INITIAL_SWORD_ID, useGameStore } from './store/gameStore'
import { spriteStore } from './lib/spriteStore'
import { swordSpriteUrl, itemSpriteUrl } from './lib/sprites'
import { itemSpriteName, PROTECTION_TICKET_ID } from './lib/items'

// 게임 부팅 — 데이터 적재(동기) → 폴백·시작검 스프라이트 GPU 풀링(await) → 첫 렌더 → 나머지 검 백그라운드 로드.
// 검 스프라이트를 시작 시 ImageBitmap 으로 미리 업로드해 두면 강화 교체 프레임이 GPU 블릿만 하면 된다
// (모바일 교체 끊김 제거 — spriteStore 참고). 첫 화면에 필요한 건 default.png(폴백)와 시작검뿐이라 그 둘만
// 기다리고, 나머지는 백그라운드로 채운다(로드가 소비보다 훨씬 빨라 어떤 검이든 교체 시점엔 준비돼 있다).
async function boot() {
  // 데이터 적재(동기). 이후 모든 게임 데이터는 DataManager 경유.
  dataManager.load()

  // 전역 store 는 적재 전(모듈 평가 시점) 생성돼 최고 도달치(maxLevelReached)가 0 으로 출발한다.
  // 적재 후 시작 검 레벨(+1)로 보정한다 — RecordGauge 의 "현재 ≤ 최고" 불변식을 첫 프레임부터 지킨다.
  useGameStore.getState().syncRecordToCurrent()

  // 폴백(default.png)과 시작검만 첫 렌더 전에 보장한다 — 오프닝에 폴백이 비치지 않게(둘 다 빠름).
  await spriteStore.loadDefault()
  const startSword = dataManager.getSwordById(INITIAL_SWORD_ID)
  if (startSword) await spriteStore.load(swordSpriteUrl(startSword.sprite))

  // 나머지 검 + 아이템 스프라이트를 첫 페인트를 막지 않게 백그라운드로 채운다(await 안 함). 아이템 아이콘
  // (SpriteCanvas)도 같은 풀을 쓰므로 함께 풀링한다 — 미적재분은 표시 시 on-demand 로 채워진다(self-heal).
  const ticketSprite = itemSpriteName(PROTECTION_TICKET_ID)
  void spriteStore.loadAll([
    ...dataManager.getSwords().map((s) => swordSpriteUrl(s.sprite)),
    ...dataManager
      .getItems()
      .flatMap((i) => (i.sprite ? [itemSpriteUrl(i.sprite)] : [])),
    ...(ticketSprite ? [itemSpriteUrl(ticketSprite)] : []),
  ])

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

// 스프라이트 로드는 자체적으로 폴백을 흡수하므로 boot 은 거의 reject 하지 않지만, 예기치 못한 실패가
// 첫 렌더를 통째로 삼키지 않게 마지막 안전망을 둔다(개발 중에만 콘솔로 드러낸다).
void boot().catch((err) => {
  if (import.meta.env.DEV) console.error('[boot] game failed to start', err)
})
