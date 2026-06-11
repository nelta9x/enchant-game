import { AnimatePresence, motion } from 'motion/react'
import { dataManager } from '../data/DataManager'
import type { Material, ShopItem } from '../data/types'
import { useI18nStore, useT, type Lang, type TranslationKey } from '../i18n'
import { formatAmount, formatGold } from '../lib/format'
import { countOf, itemDisplayName } from '../lib/items'
import { useGameStore } from '../store/gameStore'
import { Coin } from './Coin'
import { ItemIcon } from './ItemIcon'
import { useModalDialog } from './useModalDialog'

// 상점 팝업(모달). 상점 버튼으로 열고, ESC·백드롭·닫기 버튼으로 닫는다.
// 포커스 관리·ESC·포커스 트랩은 공통 크롬(useModalDialog)이 담당한다(GameClearModal 과 공유).
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
  const { panelRef, closeRef, trapTab } = useModalDialog({ open, onClose })

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
                {/* 보유 골드 — 금화 아이콘이 통화를 대신하므로 단위 없이 금액만(aria-label 엔 formatGold). */}
                <span
                  className="flex items-center gap-1.5 text-sm font-bold tabular-nums text-gold"
                  aria-label={formatGold(gold, lang)}
                >
                  <Coin className="h-4 w-4" />
                  {formatAmount(gold)}
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
        <Coin className="h-3.5 w-3.5" />
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

// 상점 아이템 썸네일 — ItemIcon 에 위임해 검/아이템 스프라이트·토큰 폴백 규약을 공유한다(상점 칸 크기 h-10 w-10).
function ShopThumb({ itemId, alt }: { itemId: string; alt: string }) {
  return <ItemIcon itemId={itemId} alt={alt} className="h-10 w-10" />
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
