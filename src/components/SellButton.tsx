import { useI18nStore, useT } from '../i18n'
import { formatAmount, formatGold } from '../lib/format'
import { Coin } from './Coin'

// 판매 버튼 — 강화 카드 아래의 보조 액션. 현재 검을 판매가에 판다.
// "판매" 라벨 아래에 판매가를 은화 아이콘 + 금액으로 통합 표시한다(별도 CostCard 없이 여기 모은다).
// 판매가는 최대 수십억 자리까지 가므로 라벨 아래로 스택하고 tabular-nums + truncate 로 컬럼 폭을 넘지 않게 한다.
// 판매 불가(검 없음 / 판매가 없음)면 비활성 — 이때도 가격 줄은 invisible 로 자리를 유지해 버튼 크기가 변하지 않게 한다.
type SellButtonProps = {
  disabled: boolean
  onSell: () => void
  sellPrice: number | null
}

export function SellButton({ disabled, onSell, sellPrice }: SellButtonProps) {
  const t = useT()
  const lang = useI18nStore((s) => s.lang)
  const hasPrice = sellPrice !== null && sellPrice > 0

  return (
    <button
      type="button"
      onClick={onSell}
      disabled={disabled}
      className={`flex w-full flex-col items-center gap-0.5 rounded-lg border px-3 py-2 transition-opacity ${
        disabled
          ? 'cursor-not-allowed border-panel-edge bg-panel text-on-dark-soft opacity-40'
          : 'cursor-pointer border-frame/50 bg-panel text-on-dark hover:opacity-90'
      }`}
    >
      <span className="text-sm font-bold">{t('action.sell')}</span>
      {/* 가격 줄은 판매 불가일 때도 invisible 로 항상 자리를 차지해 버튼 높이가 변하지 않게 한다. */}
      <span
        className={`flex items-center justify-center gap-1 text-xs font-bold tabular-nums text-on-dark-soft ${
          hasPrice ? '' : 'invisible'
        }`}
        aria-label={
          hasPrice
            ? `${t('cost.sell')}: ${formatGold(sellPrice, lang)}`
            : undefined
        }
        aria-hidden={hasPrice ? undefined : true}
      >
        <Coin variant="silver" className="h-4 w-4 shrink-0" />
        {/* 금액 슬롯 고정(min-w) — 자릿수가 늘어도(수십억) 버튼 폭이 변하지 않게 자리를 미리 잡는다. */}
        <span className="min-w-[6.5rem] whitespace-nowrap text-center">
          {/* 은화 아이콘이 통화를 대신 — 단위 없이 금액만(aria-label 엔 formatGold 로 단위 포함). */}
          {hasPrice ? formatAmount(sellPrice) : ' '}
        </span>
      </span>
    </button>
  )
}
