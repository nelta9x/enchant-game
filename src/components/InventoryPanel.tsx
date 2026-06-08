import type { Ref } from 'react'
import { dataManager } from '../data/DataManager'
import { useT, type TranslationKey } from '../i18n'
import type { SwordData } from '../data/types'
import type { ItemStack } from '../game/types'
import { itemDisplayName } from '../lib/items'
import { swordSpriteUrl } from '../lib/sprites'
import { GoldDisplay } from './GoldDisplay'
import { ItemIcon } from './ItemIcon'

// 보유 인벤토리 패널 = 무기 관리 표면: 맨 위 장착 중인 검(금색 하이라이트 행) + 그 아래 보유 아이템 행들.
// 행 내용은 itemId 유형으로 분기한다 — 검 재료(sword_<level>)는 스프라이트+레벨이며 클릭하면 장착,
// 그 외(파괴보호장치·잡템)는 아이콘+수량의 정적 행이다. (로직은 store에 있고 여기선 렌더+위임만 — 원칙 3)
// 장착 중인 검은 금색 하이라이트로만 표시한다(별도 배지 없음). 보관 동작은 우측 액션 열(보관 버튼)에 둔다.
// 보유 골드는 제목 바로 아래 별도 섹션으로 둔다(아이템과 구별 — 다른 게임의 인벤토리 화폐 분리와 동일).
type InventoryPanelProps = {
  sword: SwordData | undefined
  level: number | null
  items: ItemStack[]
  // 가방의 검(itemId) 행을 클릭하면 장착한다.
  onEquip: (itemId: string) => void
  // 보유 골드 + 판매·의뢰 코인 연출 동기화(pulseKey/coinCount). GoldDisplay 로 그대로 넘긴다.
  gold: number
  goldPulseKey: number
  goldCoinCount: number
  // 판매·의뢰 코인이 빨려드는 "도착점" 측정용 ref(골드 섹션을 가리킨다).
  goldRef: Ref<HTMLDivElement>
}

export function InventoryPanel({
  sword,
  level,
  items,
  onEquip,
  gold,
  goldPulseKey,
  goldCoinCount,
  goldRef,
}: InventoryPanelProps) {
  const t = useT()
  const equipped = sword !== undefined && level !== null
  const count = (equipped ? 1 : 0) + items.length

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-panel-edge bg-panel">
      <div className="flex items-center justify-between border-b border-panel-edge px-3 py-2">
        <span className="text-sm font-bold text-on-dark">
          {t('inventory.title')}
        </span>
        <span className="text-xs font-semibold tabular-nums text-on-dark-soft">
          {count}
        </span>
      </div>

      {/* 보유 골드 — 아이템 목록과 구별되는 별도 섹션. 살짝 밝은 띠(bg-panel-soft) + 구분선으로
          아래 목록과 분리해 화폐임을 또렷이 드러낸다. 판매·의뢰 코인이 빨려드는 도착점이라
          goldRef 로 위치를 측정한다(검 박스 → 이 섹션으로 코인이 날아온다). */}
      <div
        ref={goldRef}
        className="border-b border-panel-edge bg-panel-soft/70 p-2"
      >
        <GoldDisplay
          gold={gold}
          pulseKey={goldPulseKey}
          coinCount={goldCoinCount}
        />
      </div>

      {/* 목록은 고정 높이 UI — 아이템 수와 무관하게 크기가 변하지 않아(추가해도 주변 UI가 안 밀린다),
          화면 크기에 따라 기본 노출 갯수만 달라진다: 세로형(<lg) 2.5행 / 데스크탑(lg 이상) 4.5행.
          마지막 행을 절반만 노출해 "뒤에 더 있다"를 시각적으로 알린다(아이템이 적으면 하단에 빈 공간).
          높이는 box-border 기준 행높이(h-14=56)·갭(gap-1=4)·상단패딩(pt-2=8)에서 유도:
          2.5행 = 8 + 2×56 + 2×4 + 28(반행) = 156px = 9.75rem / 4.5행 = 276px = 17.25rem.
          (rem 단위라 데스크탑 루트 font-size 스케일과 함께 커진다 — px 고정이면 다른 rem 과 어긋남.) */}
      <ul className="flex h-[9.75rem] flex-col gap-1 overflow-y-auto px-2 pb-2 pt-2 lg:h-[17.25rem]">
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
    <li className="flex h-14 shrink-0 items-center justify-center gap-2.5 rounded-md border border-gold/50 bg-gold/10 px-2.5">
      <SpriteThumb src={swordSpriteUrl(sword.sprite)} alt={t(sword.nameKey)} />
      <div className="flex min-w-0 items-center gap-1.5">
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

  // 검·아이템 스프라이트·토큰 폴백 규약은 ItemIcon 한 곳에 둔다(잡템도 전용 스프라이트가 있으면 표시).
  const thumb = <ItemIcon itemId={item.itemId} alt={name} className="h-10 w-10" />
  const label = (
    <div className="min-w-0 text-left">
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
      <li className="shrink-0">
        <button
          type="button"
          onClick={() => onEquip(item.itemId)}
          aria-label={`${t('action.equip')}: ${name}`}
          className="flex h-14 w-full cursor-pointer items-center justify-center gap-2.5 rounded-md px-2.5 hover:bg-panel-soft/60"
        >
          {thumb}
          {label}
          {count}
        </button>
      </li>
    )
  }

  // 검이 아닌 아이템(파괴보호장치·잡템)은 정적 표시(클릭 동작 없음).
  return (
    <li className="flex h-14 shrink-0 items-center justify-center gap-2.5 rounded-md px-2.5">
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
      className="h-10 w-10 shrink-0 object-contain"
      style={{ imageRendering: 'pixelated' }}
      draggable={false}
    />
  )
}
