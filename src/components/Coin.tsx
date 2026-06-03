// 금화 / 은화 아이콘(별이 박힌 동전). 색은 토큰(text-gold / text-silver)으로,
// 크기는 부모가 className(h-*/w-*)으로 지정한다.
type CoinProps = { variant?: 'gold' | 'silver'; className?: string }

export function Coin({ variant = 'gold', className = '' }: CoinProps) {
  const color = variant === 'gold' ? 'text-gold' : 'text-silver'
  return (
    <svg viewBox="0 0 24 24" className={`${color} ${className}`} aria-hidden>
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <circle
        cx="12"
        cy="12"
        r="10"
        fill="none"
        strokeWidth="1.4"
        className="stroke-black/15"
      />
      {/* 4각 반짝임(별) — 어둡게 음각 처리 */}
      <path
        d="M12 6.4 13.2 10.8 17.6 12 13.2 13.2 12 17.6 10.8 13.2 6.4 12 10.8 10.8Z"
        className="fill-black/20"
      />
    </svg>
  )
}
