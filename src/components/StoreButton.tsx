import { useT } from '../i18n'

// 보관 버튼 — 판매 버튼 아래의 보조 액션. 현재 검을 인벤토리에 보관하고 시작 검(낡은 단검)으로 되돌린다.
// 보관 불가(시작 검 / 검 없음)면 비활성(판매 버튼과 동일한 게이팅 패턴).
type StoreButtonProps = { disabled: boolean; onStore: () => void }

export function StoreButton({ disabled, onStore }: StoreButtonProps) {
  const t = useT()
  return (
    <button
      type="button"
      onClick={onStore}
      disabled={disabled}
      className={`flex w-full items-center justify-center rounded-lg border px-5 py-2 text-xl font-bold transition-opacity ${
        disabled
          ? 'cursor-not-allowed border-panel-edge bg-panel text-on-dark-soft opacity-40'
          : 'cursor-pointer border-frame/50 bg-panel text-on-dark hover:opacity-90'
      }`}
    >
      {t('action.store')}
    </button>
  )
}
