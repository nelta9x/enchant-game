import { memo, type Ref } from 'react'
import { dataManager } from '../data/DataManager'
import { useGameStore } from '../store/gameStore'
import { useResultStore } from '../store/resultStore'
import { useT, type TranslationKey } from '../i18n'
import type { SwordData } from '../data/types'
import type { ItemStack } from '../game/types'
import { itemDisplayName } from '../lib/items'
import { swordSpriteUrl } from '../lib/sprites'
import { GoldDisplay } from './GoldDisplay'
import { ItemIcon } from './ItemIcon'
import { SpriteCanvas } from './SpriteCanvas'

// 보유 인벤토리 패널 = 무기 관리 표면: 헤더(제목 + 우측 보유 골드 배지) + 그 아래 장착 중인 검
// (금색 하이라이트 행) + 보유 아이템 행들. 행 내용은 itemId 유형으로 분기한다 — 검 재료(sword_<level>)는
// 스프라이트+레벨이며 클릭하면 장착, 그 외(파괴보호장치·잡템)는 아이콘+수량의 정적 행이다.
// (로직은 store에 있고 여기선 렌더+위임만 — 원칙 3)
// 장착 중인 검은 금색 하이라이트로 표시하며, 그 행을 클릭하면 보관한다(별도 보관 버튼 없음 — 가방의
// 검을 클릭해 장착 → 장착 행을 다시 클릭해 가방으로). 시작 검(+1) 등 보관 불가면 정적 행이다.
// 보유 골드는 헤더 우측에 둔다(스크롤 영역 밖 고정이라 목록을 스크롤해도 비침/겹침 없음). 판매·의뢰
// 코인이 빨려드는 도착점이라 그 골드 div 를 goldRef 로 측정한다.
type InventoryPanelProps = {
  // 가방의 검(itemId) 행을 클릭하면 장착한다.
  onEquip: (itemId: string) => void
  // 장착 중인 검 행을 클릭하면 보관한다(보관 가능 여부는 장착 슬롯이 store 에서 직접 판정).
  onStoreEquipped: () => void
  goldPulseKey: number
  goldCoinCount: number
  // 판매·의뢰 코인이 빨려드는 "도착점" 측정용 ref(헤더 우측 골드 배지를 가리킨다).
  goldRef: Ref<HTMLDivElement>
}

export const InventoryPanel = memo(function InventoryPanel({
  onEquip,
  onStoreEquipped,
  goldPulseKey,
  goldCoinCount,
  goldRef,
}: InventoryPanelProps) {
  const t = useT()
  // 가방 내용은 여기서 직접 구독한다(GameScreen 을 거치지 않음) — 아이템 소모가 없는 강화는 참조가 유지돼(gameStore)
  // 이 패널이 리렌더되지 않는다.
  const items = useGameStore((s) => s.items)

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-panel-edge bg-panel">
      {/* 헤더 — 좌: 제목 / 우: 보유 골드(어두운 알약 배지). 골드를 스크롤 영역 밖 고정 헤더에 두어
          목록을 스크롤해도 비치거나 겹치지 않는다. 판매·의뢰 코인이 빨려드는 도착점이라 그 div 를
          goldRef 로 측정한다(검 박스 → 헤더 골드로 코인이 날아온다). */}
      <div className="flex items-center justify-between gap-2 border-b border-panel-edge px-3 py-2">
        <span className="text-sm font-bold text-on-dark">
          {t('inventory.title')}
        </span>
        <div ref={goldRef} className="flex items-center">
          <GoldDisplay pulseKey={goldPulseKey} coinCount={goldCoinCount} />
        </div>
      </div>

      {/* 목록은 고정 높이 UI — 아이템 수와 무관하게 크기가 변하지 않아(추가해도 주변 UI가 안 밀린다),
          화면 크기에 따라 기본 노출 갯수만 달라진다: 세로형(<lg) 2.5행 / 데스크탑(lg 이상) 4.5행.
          마지막 행을 절반만 노출해 "뒤에 더 있다"를 시각적으로 알린다(아이템이 적으면 하단에 빈 공간).
          높이는 box-border 기준 행높이(h-14=56)·갭(gap-1=4)·상단패딩(pt-2=8)에서 유도:
          2.5행 = 8 + 2×56 + 2×4 + 28(반행) = 156px = 9.75rem / 4.5행 = 276px = 17.25rem.
          (rem 단위라 데스크탑 루트 font-size 스케일과 함께 커진다 — px 고정이면 다른 rem 과 어긋남.) */}
      <ul className="flex h-[9.75rem] flex-col gap-1 overflow-y-auto px-2 pb-2 pt-2 lg:h-[17.25rem]">
        <EquippedSlot onStore={onStoreEquipped} />
        {items.map((it) => (
          <ItemRow key={it.itemId} item={it} t={t} onEquip={onEquip} />
        ))}
      </ul>
    </div>
  )
})

// 장착 중인 검 — 금색 하이라이트가 곧 "장착 중" 표시다(별도 배지·성공률 없음).
// 보관 가능(storable)하면 행 전체가 버튼이 되어 클릭 시 보관한다(ItemRow 검 행의 장착 버튼과 동일
// 패턴 — 키보드/스크린리더 접근성 유지, 호버가 클릭 가능 표시). 시작 검(+1) 등 보관 불가면 정적 행이다.
// 장착 행의 데이터 구독 — 무대 이름과 같은 박자로 공개된(reveal) 검을 보인다(강화 결과가 망치 전에 새지 않도록).
// heldSwordId 가 있으면(강화 직후 떨림 동안) 강화 전 검을, null 이면 현재 검을. 이 구독을 여기 리프에 두어 reveal
// 커밋이 인벤토리 패널 전체·GameScreen 을 재조정하지 않게 한다. 보관 가능 여부도 store 에서 직접 판정한다.
function EquippedSlot({ onStore }: { onStore: () => void }) {
  const heldSwordId = useResultStore((s) => s.heldSwordId)
  const currentSwordId = useGameStore((s) => s.currentSwordId)
  const storable = useGameStore((s) => s.canStore())
  const id = heldSwordId ?? currentSwordId
  const sword = id !== null ? dataManager.getSwordById(id) : undefined
  if (!sword) return null
  return <EquippedRow sword={sword} level={sword.level} storable={storable} onStore={onStore} />
}

function EquippedRow({
  sword,
  level,
  storable,
  onStore,
}: {
  sword: SwordData
  level: number
  storable: boolean
  onStore: () => void
}) {
  const t = useT()
  const body = (
    <>
      <SpriteThumb src={swordSpriteUrl(sword.sprite)} alt={t(sword.nameKey)} />
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="truncate text-sm font-semibold text-on-dark">
          {t(sword.nameKey)}
        </span>
        <span className="shrink-0 text-xs font-bold tabular-nums text-gold">
          +{level}
        </span>
      </div>
    </>
  )

  // 보관 가능 여부와 무관하게 항상 같은 트리 모양(<li><button>)으로 렌더한다 — 강화로 시작 검(+1)에서 벗어나
  // storable 이 뒤집힐 때 <li> ↔ <li><button> 으로 모양이 바뀌면 React 가 서브트리를 리마운트해 스프라이트 캔버스를
  // 다시 만들고(새 backing store + 강제 레이아웃) 탭 태스크에 끼어들었다. 불가 상태는 disabled 로만 표현한다.
  return (
    <li className="shrink-0">
      <button
        type="button"
        onClick={onStore}
        disabled={!storable}
        aria-label={`${t('action.store')}: ${t(sword.nameKey)}`}
        className={`flex h-14 w-full items-center justify-center gap-2.5 rounded-md border border-gold/50 bg-gold/10 px-2.5 ${
          storable ? 'cursor-pointer hover:bg-gold/20' : 'cursor-default'
        }`}
      >
        {body}
      </button>
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
  // 장착 검 썸네일 — canvas(SpriteCanvas)로 풀의 ImageBitmap 을 재사용한다(강화로 장착검이 바뀔 때 <img>
  // 교체 디코드 회피). src 는 이미 해석된 URL(swordSpriteUrl).
  return <SpriteCanvas url={src} alt={alt} className="h-10 w-10 shrink-0" />
}
