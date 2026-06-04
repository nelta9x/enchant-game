import { dataManager } from '../data/DataManager'
import { PROTECTION_TICKET_ID } from '../lib/items'
import { swordSpriteUrl } from '../lib/sprites'

// 아이템 한 칸의 아이콘 — 검은 전용 스프라이트, 그 외(방지권·잡템)는 토큰 아이콘(방패/보석).
// "검이냐 토큰이냐" 결정을 한 곳에 둔다(원칙 2: 검 조회는 DataManager). 크기는 className(h-*/w-*)으로 지정.
// alt 는 검 스프라이트의 대체 텍스트 — 인접 텍스트가 이름을 이미 읽어 주는 곳에선 빈 문자열로 둔다.
type ItemIconProps = { itemId: string; alt?: string; className?: string }

export function ItemIcon({
  itemId,
  alt = '',
  className = 'h-7 w-7',
}: ItemIconProps) {
  const sword = dataManager.getSwordById(itemId)
  if (sword) {
    return (
      <img
        src={swordSpriteUrl(sword.sprite)}
        alt={alt}
        className={`${className} shrink-0 object-contain`}
        style={{ imageRendering: 'pixelated' }}
        draggable={false}
      />
    )
  }
  // 스프라이트가 없는 아이템 — 방지권은 방패, 그 외 잡템은 보석 아이콘.
  const isTicket = itemId === PROTECTION_TICKET_ID
  return (
    <span
      className={`${className} grid shrink-0 place-items-center rounded bg-panel-soft text-on-dark-soft`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-[70%] w-[70%]"
        fill="currentColor"
        aria-hidden
      >
        {isTicket ? (
          <path d="M12 2 4 5v6c0 5 3.4 8.5 8 11 4.6-2.5 8-6 8-11V5l-8-3Z" />
        ) : (
          <path d="M6 3h12l3 6-9 12L3 9l3-6Z" />
        )}
      </svg>
    </span>
  )
}
