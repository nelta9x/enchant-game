import { type ReactNode } from 'react'

// 우측 액션 열의 보조 액션 버튼(현재 판매) — 단일 라벨 + 활성/비활성 스타일.
// 라벨·핸들러만 갈아끼우면 다른 보조 액션에도 재사용 가능한 일반 버튼이다.
// 가능 여부 게이팅(disabled)은 호출 측(canSell)이 소유한다.
type ActionButtonProps = {
  disabled: boolean
  onClick: () => void
  children: ReactNode
  // 호출 측에서 크기 등 보조 스타일을 덧붙인다(예: 세로형 판매 버튼 높이 키우기). min-h 류라 base 와 속성 충돌 없음.
  className?: string
}

export function ActionButton({
  disabled,
  onClick,
  children,
  className = '',
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
      } ${className}`}
    >
      {children}
    </button>
  )
}
