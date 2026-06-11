import { type ReactNode } from 'react'

// 우측 액션 열의 보조 액션 버튼(판매·보관 공용) — 단일 라벨 + 동일한 활성/비활성 스타일.
// 판매와 보관이 같은 모양의 버튼을 각자 들고 있던 것을 하나로 합쳤다(라벨·핸들러만 다름).
// 가능 여부 게이팅(disabled)은 호출 측(canSell/canStore)이 소유한다.
type ActionButtonProps = {
  disabled: boolean
  onClick: () => void
  children: ReactNode
}

export function ActionButton({
  disabled,
  onClick,
  children,
}: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center justify-center rounded-lg border px-5 py-2 text-xl font-bold transition-opacity ${
        disabled
          ? 'cursor-not-allowed border-panel-edge bg-panel text-on-dark-soft opacity-40'
          : 'cursor-pointer border-frame/50 bg-panel text-on-dark hover:opacity-90'
      }`}
    >
      {children}
    </button>
  )
}
