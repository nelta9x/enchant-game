import { useT } from '../i18n'
import { Coin } from './Coin'

// 판매 버튼 — 강화(원형) 버튼 아래의 보조 액션. 현재 검을 판매가에 판다.
// 판매 불가(검 없음 / 판매가 없음)면 비활성.
type SellButtonProps = { disabled: boolean; onSell: () => void }

export function SellButton({ disabled, onSell }: SellButtonProps) {
  const t = useT()
  return (
    <button
      type="button"
      onClick={onSell}
      disabled={disabled}
      className={`flex items-center gap-1.5 rounded-lg border px-5 py-2 text-sm font-bold transition-opacity ${
        disabled
          ? 'cursor-not-allowed border-panel-edge bg-panel text-on-dark-soft opacity-40'
          : 'cursor-pointer border-frame/50 bg-panel text-on-dark hover:opacity-90'
      }`}
    >
      <Coin variant="silver" className="h-4 w-4 shrink-0" />
      {t('action.sell')}
    </button>
  )
}
