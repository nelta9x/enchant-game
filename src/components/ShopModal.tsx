import {
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { dataManager } from '../data/DataManager'
import type { Material, ShopItem } from '../data/types'
import { useI18nStore, useT, type Lang, type TranslationKey } from '../i18n'
import { formatGold } from '../lib/format'
import { countOf, itemDisplayName, PROTECTION_TICKET_ID } from '../lib/items'
import { swordSpriteUrl } from '../lib/sprites'
import { useGameStore } from '../store/gameStore'
import { Coin } from './Coin'

// 상점 팝업(모달). 상점 버튼으로 열고, ESC·백드롭·닫기 버튼으로 닫는다.
// 판매 목록은 DataManager.getShopItems()를 그대로 순회해 렌더한다 — 새 아이템은
// shop.json 항목 + (검이 아니면) lib/items 표시명 매핑 + i18n 키를 추가하면 된다
// (무결성은 DataManager 시드 테스트가 강제, 고유 아이콘이 필요하면 ShopThumb도 손본다).
type ShopModalProps = { open: boolean; onClose: () => void }

export function ShopModal({ open, onClose }: ShopModalProps) {
  const t = useT()
  const lang = useI18nStore((s) => s.lang)
  const gold = useGameStore((s) => s.gold)
  const items = useGameStore((s) => s.items)
  const buy = useGameStore((s) => s.buy)
  const canBuyFn = useGameStore((s) => s.canBuy)

  const shopItems = dataManager.getShopItems()
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  // onClose 를 ref로 고정해 ESC 리스너가 onClose 정체성에 의존(매 렌더 재등록)하지 않게 한다.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  // 열릴 때 닫기 버튼에 포커스를 두고, 닫힐 때 직전 포커스 요소로 복원한다.
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    return () => prev?.focus?.()
  }, [open])

  // 열려 있는 동안 ESC로 닫는다(리스너는 open 토글 시에만 재등록).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  // 포커스 트랩 — 모달이 열린 동안 Tab 포커스를 패널 안에 가둔다(aria-modal 보강,
  // 배경의 언어 토글 등으로 포커스가 새는 것을 막는다). 닫힐 때 복원은 위 효과가 담당.
  const trapTab = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !panelRef.current) return
    const focusables = panelRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    if (focusables.length === 0) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onClose}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="shop-title"
            className="w-full max-w-md overflow-hidden rounded-2xl border border-panel-edge bg-panel shadow-2xl"
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={trapTab}
          >
            <div className="flex items-center justify-between gap-3 border-b border-panel-edge px-4 py-3">
              <h2 id="shop-title" className="text-base font-bold text-on-dark">
                {t('shop.title')}
              </h2>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-sm font-bold tabular-nums text-gold">
                  <Coin variant="gold" className="h-4 w-4 shrink-0" />
                  {formatGold(gold, lang)}
                </span>
                <button
                  ref={closeRef}
                  type="button"
                  onClick={onClose}
                  aria-label={t('shop.close')}
                  className="grid h-7 w-7 place-items-center rounded-md text-on-dark-soft transition-colors hover:bg-panel-soft hover:text-on-dark"
                >
                  <CloseIcon />
                </button>
              </div>
            </div>

            <ul className="max-h-[60vh] space-y-2 overflow-y-auto p-3">
              {shopItems.map((shopItem) => (
                <ShopRow
                  key={shopItem.id}
                  shopItem={shopItem}
                  owned={countOf(items, shopItem.itemId)}
                  affordable={canBuyFn(shopItem.id)}
                  onBuy={() => buy(shopItem.id)}
                  t={t}
                  lang={lang}
                />
              ))}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function ShopRow({
  shopItem,
  owned,
  affordable,
  onBuy,
  t,
  lang,
}: {
  shopItem: ShopItem
  owned: number
  affordable: boolean
  onBuy: () => void
  t: (key: TranslationKey) => string
  lang: Lang
}) {
  const name = itemDisplayName(shopItem.itemId, t)
  return (
    <li className="flex items-center gap-3 rounded-lg border border-panel-edge bg-panel-soft/40 px-3 py-2.5">
      <ShopThumb itemId={shopItem.itemId} alt={name} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-on-dark">
          {name}
        </div>
        <div className="mt-0.5 flex items-center gap-1 text-xs font-medium text-on-dark-soft">
          <PriceTag price={shopItem.price} t={t} lang={lang} />
          <span className="mx-1 text-panel-edge">·</span>
          <span className="tabular-nums">
            {t('shop.owned')} {owned}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <button
          type="button"
          onClick={onBuy}
          disabled={!affordable}
          className={`rounded-lg px-4 py-2 text-sm font-bold transition-opacity ${
            affordable
              ? 'cursor-pointer bg-enhance text-on-dark hover:opacity-90'
              : 'cursor-not-allowed bg-panel text-on-dark-soft opacity-50'
          }`}
        >
          {t('shop.buy')}
        </button>
        {/* 비활성 사유를 가시 텍스트로 — hover 툴팁은 키보드/비활성 버튼에 닿지 않는다. */}
        {!affordable && (
          <span className="text-[10px] font-semibold text-danger">
            {t('shop.insufficient')}
          </span>
        )}
      </div>
    </li>
  )
}

// 가격 표시 — 골드는 코인+금액, 아이템은 이름 ×수량, 무료는 '무료'.
function PriceTag({
  price,
  t,
  lang,
}: {
  price: Material
  t: (key: TranslationKey) => string
  lang: Lang
}) {
  if (price.kind === 'gold') {
    return (
      <>
        <Coin variant="gold" className="h-3.5 w-3.5 shrink-0" />
        <span className="tabular-nums">{formatGold(price.amount, lang)}</span>
      </>
    )
  }
  if (price.kind === 'item') {
    return (
      <span className="tabular-nums">
        {itemDisplayName(price.itemId, t)} ×{price.count}
      </span>
    )
  }
  return <span>{t('cost.free')}</span>
}

// 상점 아이템 썸네일(자체 포함). 검 재료는 스프라이트, 방지권은 방패, 그 외(잡템 등)는
// 보석 아이콘이 기본. 고유 아이콘이 필요한 새 아이템은 이 분기를 늘린다.
// (인벤토리 패널과 시각 규약은 같으나 컴포넌트는 의도적으로 분리해 둔다.)
function ShopThumb({ itemId, alt }: { itemId: string; alt: string }) {
  const sword = dataManager.getSwordById(itemId)
  if (sword) {
    return (
      <img
        src={swordSpriteUrl(sword.sprite)}
        alt={alt}
        className="h-10 w-10 shrink-0 object-contain"
        style={{ imageRendering: 'pixelated' }}
        draggable={false}
      />
    )
  }
  const isTicket = itemId === PROTECTION_TICKET_ID
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-panel text-on-dark-soft">
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="currentColor"
        aria-hidden
      >
        {isTicket ? (
          <path d="M12 2 4 5v6c0 5 3.4 8.5 8 11 4.6-2.5 8-6 8-11V5l-8-3Z" />
        ) : (
          <path d="M6 3h12l3 6-9 12L3 9l3-6Z" />
        )}
      </svg>
    </span>
  )
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  )
}
