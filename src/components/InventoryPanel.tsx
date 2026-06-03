import { dataManager } from '../data/DataManager'
import { useT, type TranslationKey } from '../i18n'
import type { SwordData } from '../data/types'
import type { ItemStack } from '../game/types'
import { itemDisplayName, swordItemLevel } from '../lib/items'
import { swordSpriteUrl } from '../lib/sprites'

// 보유 인벤토리 패널: 맨 위 장착 중인 검(선택 행) + 그 아래 보유 아이템 행들.
// 행 내용은 itemId 유형으로 분기한다 — 검 재료(sword_<level>)는 스프라이트+레벨,
// 그 외(방지권·잡템)는 아이콘+수량.
type InventoryPanelProps = {
  sword: SwordData | undefined
  level: number | null
  items: ItemStack[]
}

export function InventoryPanel({ sword, level, items }: InventoryPanelProps) {
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
        {equipped && (
          <EquippedRow
            sword={sword}
            level={level}
            equippedLabel={t('inventory.equipped')}
          />
        )}
        {items.map((it) => (
          <ItemRow key={it.itemId} item={it} t={t} />
        ))}
      </ul>
    </div>
  )
}

function EquippedRow({
  sword,
  level,
  equippedLabel,
}: {
  sword: SwordData
  level: number
  equippedLabel: string
}) {
  const t = useT()
  const rate = sword.successRate !== null ? `${Math.round(sword.successRate * 100)}%` : '—'
  return (
    <li className="flex items-center gap-2.5 rounded-md border border-gold/50 bg-gold/10 px-2.5 py-1.5">
      <SpriteThumb src={swordSpriteUrl(sword.sprite)} alt={t(sword.nameKey)} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-on-dark">
            {t(sword.nameKey)}
          </span>
          <span className="shrink-0 text-xs font-bold tabular-nums text-gold">
            +{level}
          </span>
        </div>
        <div className="text-[11px] text-on-dark-soft">
          {t('stat.successRate')} {rate}
        </div>
      </div>
      <span className="shrink-0 rounded bg-gold/20 px-1.5 py-0.5 text-[10px] font-semibold text-gold">
        {equippedLabel}
      </span>
    </li>
  )
}

function ItemRow({
  item,
  t,
}: {
  item: ItemStack
  t: (key: TranslationKey) => string
}) {
  const lvl = swordItemLevel(item.itemId)
  const sword = lvl !== null ? dataManager.getSwordByLevel(lvl) : undefined
  const name = itemDisplayName(item.itemId, t)

  return (
    <li className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 hover:bg-panel-soft/60">
      {sword ? (
        <SpriteThumb src={swordSpriteUrl(sword.sprite)} alt={name} />
      ) : (
        <TokenThumb itemId={item.itemId} />
      )}
      <div className="min-w-0 flex-1">
        <span className="truncate text-sm font-medium text-on-dark">
          {name}
        </span>
        {lvl !== null && (
          <span className="ml-1.5 text-xs font-bold tabular-nums text-on-dark-soft">
            +{lvl}
          </span>
        )}
      </div>
      <span className="shrink-0 text-xs font-semibold tabular-nums text-on-dark-soft">
        ×{item.count}
      </span>
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
  const isTicket = itemId === 'protection_ticket'
  return (
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded bg-panel-soft text-on-dark-soft">
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
        {isTicket ? (
          <path d="M12 2 4 5v6c0 5 3.4 8.5 8 11 4.6-2.5 8-6 8-11V5l-8-3Z" />
        ) : (
          <path d="M6 3h12l3 6-9 12L3 9l3-6Z" />
        )}
      </svg>
    </span>
  )
}
