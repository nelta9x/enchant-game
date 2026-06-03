import { useCallback, useEffect, useRef, useState } from 'react'
import { dataManager } from '../data/DataManager'
import { PROTECTION_TICKET_ID } from '../game/enhancer'
import { countOf } from '../lib/items'
import { useGameStore } from '../store/gameStore'
import { useUiStore } from '../store/uiStore'
import { CostCard } from './CostCard'
import { EnhanceButton } from './EnhanceButton'
import { GoldDisplay } from './GoldDisplay'
import { InventoryPanel } from './InventoryPanel'
import { ResultToast, type EnhanceFeedback } from './ResultToast'
import { SellButton } from './SellButton'
import { ShopModal } from './ShopModal'
import { SwordStage } from './SwordStage'
import { TopControls } from './TopControls'

// 메인 강화 화면. 레퍼런스 레이아웃을 따른 가로 스테이지:
//   상단(언어·난이도 / 상점·닫기) · 좌(비용카드·인벤토리) · 중앙(검 스테이지) · 우(강화·골드).
// 게임 상태는 gameStore, 강화 1회 결과는 토스트로 잠깐 보여 준다.
export function GameScreen() {
  const gold = useGameStore((s) => s.gold)
  const currentSwordLevel = useGameStore((s) => s.currentSwordLevel)
  const items = useGameStore((s) => s.items)
  const enhance = useGameStore((s) => s.enhance)
  const canEnhanceFn = useGameStore((s) => s.canEnhance)
  const sell = useGameStore((s) => s.sell)
  const canSellFn = useGameStore((s) => s.canSell)

  const protectionArmed = useUiStore((s) => s.protectionArmed)
  const toggleProtection = useUiStore((s) => s.toggleProtection)

  const sword =
    currentSwordLevel !== null
      ? dataManager.getSwordByLevel(currentSwordLevel)
      : undefined

  // 방지권 사용(armed) 가능 조건: 단계가 방지권을 허용(number>0)하고, 요구 수량 이상 보유.
  const ownedTickets = countOf(items, PROTECTION_TICKET_ID)
  const canArm =
    sword !== undefined &&
    typeof sword.protectionTickets === 'number' &&
    sword.protectionTickets > 0 &&
    ownedTickets >= sword.protectionTickets
  const effectiveProtection = protectionArmed && canArm
  const canEnhance = canEnhanceFn(effectiveProtection)
  const canSell = canSellFn()

  // 상점 팝업 열림 상태.
  const [shopOpen, setShopOpen] = useState(false)
  const openShop = useCallback(() => setShopOpen(true), [])
  const closeShop = useCallback(() => setShopOpen(false), [])

  // 강화 결과 피드백(자동 소멸).
  const [feedback, setFeedback] = useState<EnhanceFeedback | null>(null)
  const nextId = useRef(0)
  useEffect(() => {
    if (!feedback) return
    const tid = setTimeout(() => setFeedback(null), 1400)
    return () => clearTimeout(tid)
  }, [feedback])

  const handleEnhance = () => {
    const result = enhance(effectiveProtection)
    if (result) {
      nextId.current += 1
      setFeedback({ result, id: nextId.current })
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center overflow-auto bg-bezel p-3 sm:p-6">
      <div className="relative w-full max-w-5xl rounded-2xl border border-stage-edge bg-stage p-4 shadow-2xl sm:p-5">
        <TopControls onOpenShop={openShop} />

        {/* 모바일(<sm)은 단일 컬럼으로 스택 — 좁은 화면에서 고정폭 검 스테이지가
            좁은 트랙에 눌려 좌우 패널과 겹치는 것을 방지(반응형 폴리시는 스프린트 6). */}
        <div className="mt-3 grid grid-cols-1 gap-4 sm:min-h-[34rem] sm:grid-cols-[minmax(9.5rem,13rem)_minmax(0,1fr)_minmax(7rem,10rem)]">
          {/* 좌: 비용 카드 + 인벤토리 */}
          <div className="flex min-h-0 flex-col gap-3">
            <CostCard
              enhanceCost={sword?.enhanceCost ?? null}
              sellPrice={sword?.sellPrice ?? null}
            />
            <div className="min-h-0 flex-1">
              <InventoryPanel
                sword={sword}
                level={currentSwordLevel}
                items={items}
              />
            </div>
          </div>

          {/* 중앙: 검 스테이지 + 결과 토스트 */}
          <div className="relative flex items-center justify-center">
            <SwordStage
              sword={sword}
              level={currentSwordLevel}
              ownedTickets={ownedTickets}
              armed={effectiveProtection}
              canArm={canArm}
              onToggleProtection={toggleProtection}
            />
            {/* 상시 마운트되는 라이브 리전 — 강화 결과를 스크린리더에 알린다
                (토스트 노드 자체는 AnimatePresence로 마운트/언마운트되므로 래퍼에 둔다). */}
            <div
              role="status"
              aria-live="polite"
              aria-atomic="true"
              className="pointer-events-none absolute inset-x-0 top-1 flex justify-center"
            >
              <ResultToast feedback={feedback} />
            </div>
          </div>

          {/* 우: 강화 버튼 + 그 아래 판매 버튼(세로 중앙) + 골드(하단) */}
          <div className="flex flex-col items-center justify-between gap-4">
            <div className="grid flex-1 place-items-center">
              <div className="flex flex-col items-center gap-3">
                <EnhanceButton
                  disabled={!canEnhance}
                  onEnhance={handleEnhance}
                />
                <SellButton disabled={!canSell} onSell={sell} />
              </div>
            </div>
            <GoldDisplay gold={gold} />
          </div>
        </div>
      </div>

      {/* 상점 팝업 (전체 화면 오버레이 — 열렸을 때만 렌더) */}
      <ShopModal open={shopOpen} onClose={closeShop} />
    </div>
  )
}
