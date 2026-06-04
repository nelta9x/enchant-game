import { itemSpriteUrl } from '../lib/sprites'

// 골드 코인 아이콘 — 판매 코인 연출(CoinFlight)과 "동일한" gold_coin.png 스프라이트를 쓴다.
// 픽셀아트가 또렷하게 보이도록 imageRendering: pixelated + object-contain 으로 연출 코인과 시각 일치.
// 크기는 부모가 className(h-*/w-*)으로 지정. 통화 맥락(aria-label)은 인접 컨테이너가 들고 있어
// 여기선 장식용(alt="")으로 둔다.
type CoinProps = { className?: string }

export function Coin({ className = '' }: CoinProps) {
  return (
    <img
      src={itemSpriteUrl('gold_coin.png')}
      alt=""
      draggable={false}
      className={`${className} shrink-0 object-contain`}
      style={{ imageRendering: 'pixelated' }}
    />
  )
}
