import { useT } from '../i18n'

// 판매 버튼 — 강화 카드 아래의 보조 액션. 현재 검을 판매가에 판다(판매가는 검 스테이지에 금색으로 표시).
// 판매 불가(검 없음 / 판매가 없음)면 비활성(canSell 로 게이팅). 구조는 보관 버튼과 동일한 단일 라벨 버튼.
type SellButtonProps = {
  disabled: boolean
  onSell: () => void
}

export function SellButton({ disabled, onSell }: SellButtonProps) {
  const t = useT()
  return (
    <button
      type="button"
      onClick={onSell}
      disabled={disabled}
      className={`flex w-full items-center justify-center rounded-lg border px-5 py-2 text-xl font-bold transition-opacity ${
        disabled
          ? 'cursor-not-allowed border-panel-edge bg-panel text-on-dark-soft opacity-40'
          : 'cursor-pointer border-frame/50 bg-panel text-on-dark hover:opacity-90'
      }`}
    >
      {t('action.sell')}
    </button>
  )
}
