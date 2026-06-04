import { motion } from 'motion/react'
import type { Material } from '../data/types'
import { useI18nStore, useT } from '../i18n'
import { formatAmount, formatGold } from '../lib/format'
import { itemDisplayName } from '../lib/items'
import { Coin } from './Coin'
import { ItemIcon } from './ItemIcon'

// 강화 버튼 — 둥근 카드형(청색 글로우). 카드 안에 "강화" 라벨 + 강화 조건(비용/재료)을 아이콘+수량으로 보여 준다.
//  - 골드 비용: 금화 아이콘 + 금액 / 아이템(재료검·잡템) 비용: 아이템 아이콘 + ×수량 / 무료·최종 단계: 칩 없이 라벨만.
//  - 비용 칩은 시각적으로 아이콘+수량만 보여 주되, aria-label 로 스크린리더에 비용을 설명한다(접근성 보존).
// 비활성(disabled) 시 글로우·펄스를 끄고 흐리게 표시. aria-keyshortcuts="Space"로 데스크탑 단축키를 알린다
// (ARIA 키 토큰이라 로케일 무관 — i18n 대상 아님. 실제 처리는 useEnhanceHotkey).
type EnhanceButtonProps = {
  disabled: boolean
  onEnhance: () => void
  enhanceCost: Material | null
}

export function EnhanceButton({
  disabled,
  onEnhance,
  enhanceCost,
}: EnhanceButtonProps) {
  const t = useT()
  const lang = useI18nStore((s) => s.lang)

  // 강화 조건 칩 — 골드/아이템만 표시(무료·최종 단계는 null). 아이콘+수량만 시각화하고 aria-label 로 설명.
  const renderCost = () => {
    if (enhanceCost === null || enhanceCost.kind === 'free') return null
    const { icon, qty, label } =
      enhanceCost.kind === 'gold'
        ? {
            icon: <Coin className="h-5 w-5" />,
            // 금화 아이콘이 통화를 대신하므로 단위 없이 금액만 표시. aria-label 엔 단위 포함(formatGold).
            qty: formatAmount(enhanceCost.amount),
            label: formatGold(enhanceCost.amount, lang),
          }
        : {
            icon: <ItemIcon itemId={enhanceCost.itemId} className="h-5 w-5" />,
            qty: `×${enhanceCost.count}`,
            label: `${itemDisplayName(enhanceCost.itemId, t)} ×${enhanceCost.count}`,
          }
    return (
      <>
        <span className="relative h-px w-14 bg-on-dark-soft/30" aria-hidden />
        <span
          className="relative flex items-center justify-center gap-1.5 text-sm font-bold tabular-nums text-on-dark"
          aria-label={`${t('cost.enhance')}: ${label}`}
        >
          {icon}
          {/* 금액/수량 슬롯 고정(min-w) — 비용이 바뀌어도 칩 폭이 변하지 않게 자리를 미리 잡는다. */}
          <span className="min-w-[4.5rem] whitespace-nowrap text-center">
            {qty}
          </span>
        </span>
      </>
    )
  }

  return (
    <motion.button
      type="button"
      onClick={onEnhance}
      disabled={disabled}
      aria-keyshortcuts="Space"
      whileTap={disabled ? undefined : { scale: 0.95 }}
      className={`relative flex w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border bg-gradient-to-b from-panel-soft to-panel px-3 py-5 transition-opacity ${
        disabled
          ? 'cursor-not-allowed border-panel-edge opacity-40 saturate-50'
          : 'cursor-pointer border-enhance/60 shadow-[0_0_28px_-4px_var(--color-enhance-glow)]'
      }`}
    >
      {/* 활성 시 천천히 번지는 펄스 링(카드 외곽) */}
      {!disabled && (
        <motion.span
          className="pointer-events-none absolute inset-0 rounded-2xl border border-enhance-glow"
          animate={{ scale: [1, 1.04], opacity: [0.5, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
        />
      )}
      <span
        className={`relative text-2xl font-extrabold tracking-wide ${
          disabled ? 'text-on-dark-soft' : 'text-enhance-glow'
        }`}
      >
        {t('action.enhance')}
      </span>
      {renderCost()}
    </motion.button>
  )
}
