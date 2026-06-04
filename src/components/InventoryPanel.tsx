import { dataManager } from '../data/DataManager'
import { useT, type TranslationKey } from '../i18n'
import type { SwordData } from '../data/types'
import type { ItemStack } from '../game/types'
import { itemDisplayName, PROTECTION_TICKET_ID } from '../lib/items'
import { swordSpriteUrl } from '../lib/sprites'

// 보유 인벤토리 패널 = 무기 관리 표면: 맨 위 장착 중인 검(금색 하이라이트 행) + 그 아래 보유 아이템 행들.
// 행 내용은 itemId 유형으로 분기한다 — 검 재료(sword_<level>)는 스프라이트+레벨이며 클릭하면 장착,
// 그 외(방지권·잡템)는 아이콘+수량의 정적 행이다. (로직은 store에 있고 여기선 렌더+위임만 — 원칙 3)
// 장착 중인 검은 금색 하이라이트로만 표시한다(별도 배지 없음). 보관 동작은 우측 액션 열(보관 버튼)에 둔다.
type InventoryPanelProps = {
  sword: SwordData | undefined
  level: number | null
  items: ItemStack[]
  // 가방의 검(itemId) 행을 클릭하면 장착한다.
  onEquip: (itemId: string) => void
}

export function InventoryPanel({
  sword,
  level,
  items,
  onEquip,
}: InventoryPanelProps) {
  const t = useT()
  const equipped = sword !== undefined && level !== null
  const count = (equipped ? 1 : 0) + items.length

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-panel-edge bg-panel">
      <div className="flex items-center justify-between border-b border-panel-edge px-3 py-2">
        <span className="text-sm font-bold text-on-dark">
          {t('inventory.title')}
        </span>
        <span className="text-xs font-semibold tabular-nums text-on-dark-soft">
          {count}
        </span>
      </div>

      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        {equipped && <EquippedRow sword={sword} level={level} />}
        {items.map((it) => (
          <ItemRow key={it.itemId} item={it} t={t} onEquip={onEquip} />
        ))}
      </ul>
    </div>
  )
}

// 장착 중인 검 — 금색 하이라이트가 곧 "장착 중" 표시다(별도 배지·버튼·성공률 없음).
function EquippedRow({ sword, level }: { sword: SwordData; level: number }) {
  const t = useT()
  return (
    <li className="flex items-center gap-2.5 rounded-md border border-gold/50 bg-gold/10 px-2.5 py-1.5">
      <SpriteThumb src={swordSpriteUrl(sword.sprite)} alt={t(sword.nameKey)} />
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="truncate text-sm font-semibold text-on-dark">
          {t(sword.nameKey)}
        </span>
        <span className="shrink-0 text-xs font-bold tabular-nums text-gold">
          +{level}
        </span>
      </div>
    </li>
  )
}

function ItemRow({
  item,
  t,
  onEquip,
}: {
  item: ItemStack
  t: (key: TranslationKey) => string
  onEquip: (itemId: string) => void
}) {
  const sword = dataManager.getSwordById(item.itemId)
  const lvl = sword?.level ?? null
  const name = itemDisplayName(item.itemId, t)

  const thumb = sword ? (
    <SpriteThumb src={swordSpriteUrl(sword.sprite)} alt={name} />
  ) : (
    <TokenThumb itemId={item.itemId} />
  )
  const label = (
    <div className="min-w-0 flex-1 text-left">
      <span className="truncate text-sm font-medium text-on-dark">{name}</span>
      {lvl !== null && (
        <span className="ml-1.5 text-xs font-bold tabular-nums text-on-dark-soft">
          +{lvl}
        </span>
      )}
    </div>
  )
  const count = (
    <span className="shrink-0 text-xs font-semibold tabular-nums text-on-dark-soft">
      ×{item.count}
    </span>
  )

  // 검 행은 클릭하면 곧바로 장착(현재 검은 가방으로 보관) — 실제 버튼으로 만들어 키보드/스크린리더
  // 접근성을 유지하고, 호버 하이라이트가 클릭 가능 표시다(별도 장착 칩 없음).
  // 가방에 렌더되는 검 행은 항상 보유(count>0)하는 실제 검이라 장착이 늘 유효 → per-row 비활성 게이트 불필요.
  if (sword) {
    return (
      <li>
        <button
          type="button"
          onClick={() => onEquip(item.itemId)}
          aria-label={`${t('action.equip')}: ${name}`}
          className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 hover:bg-panel-soft/60"
        >
          {thumb}
          {label}
          {count}
        </button>
      </li>
    )
  }

  // 검이 아닌 아이템(방지권·잡템)은 정적 표시(클릭 동작 없음).
  return (
    <li className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5">
      {thumb}
      {label}
      {count}
    </li>
  )
}

function SpriteThumb({ src, alt }: { src: string; alt: string }) {
  return (
    <img
      src={src}
      alt={alt}
      className="h-7 w-7 shrink-0 object-contain"
      style={{ imageRendering: 'pixelated' }}
      draggable={false}
    />
  )
}

// 스프라이트가 없는 아이템(방지권·잡템)용 대체 아이콘 — 방지권은 방패, 잡템은 보석.
function TokenThumb({ itemId }: { itemId: string }) {
  const isTicket = itemId === PROTECTION_TICKET_ID
  return (
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded bg-panel-soft text-on-dark-soft">
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
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
