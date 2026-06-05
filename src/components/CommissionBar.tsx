import { useCallback, useRef } from 'react'
import { motion } from 'motion/react'
import { dataManager } from '../data/DataManager'
import { useT } from '../i18n'
import { itemDisplayName } from '../lib/items'
import { formatAmount } from '../lib/format'
import { useCommissionHotkey } from '../hooks/useCommissionHotkey'
import { useCommissionStore } from '../store/commissionStore'
import { useGameStore } from '../store/gameStore'
import type { Commission } from '../store/commissionQueue'
import { ItemIcon } from './ItemIcon'

// 상단 의뢰 바. 현재 떠 있는 의뢰(active)를 최대 MAX_COMMISSIONS 슬롯으로 보여 준다.
// 각 의뢰서: 아이템 아이콘 + 이름 + 보상가(판매가에 인센티브가 붙은 금액). 요구 검을 보유했을 때만
// 클릭(납품) 가능하다. 빈 슬롯은 재생성 대기('준비 중') placeholder 로 채워 바 높이를 안정시킨다.
//
// 완료(검 소모+보상)는 부모(GameScreen)가 onFulfill 콜백으로 처리한다 — 코인 연출의 출발점을 위해
// 클릭한 카드 엘리먼트를 함께 넘긴다. 생명주기(active 에서 제거)는 commissionStore.fulfill 이 소유.
type CommissionBarProps = {
  onFulfill: (commission: Commission, cardEl: HTMLElement) => void
  // 숫자 1·2·3 납품 단축키 활성 여부(상점 열림 등에서 끈다).
  hotkeysEnabled: boolean
}

export function CommissionBar({ onFulfill, hotkeysEnabled }: CommissionBarProps) {
  const t = useT()
  const active = useCommissionStore((s) => s.active)
  // items/currentSwordId 를 구독해 보유 상태가 바뀌면 카드 활성/비활성이 갱신되게 한다.
  const items = useGameStore((s) => s.items)
  const currentSwordId = useGameStore((s) => s.currentSwordId)
  const canFulfill = useGameStore((s) => s.canFulfill)
  // 의뢰 진행도(레벨/경험치) — gameStore PlayerState 소유. 헤더에 표시한다.
  const commissionLevel = useGameStore((s) => s.commissionLevel)
  const commissionXp = useGameStore((s) => s.commissionXp)
  void items
  void currentSwordId

  // 인덱스 기반 슬롯 — active 가 비는 자리는 placeholder. 카드 식별은 인덱스가 아니라 c.id(React key).
  // 슬롯 수(maxCommissions)·레벨 정의는 DataManager 설정에서 읽는다(ItemIcon 이 dataManager 를 직접 쓰는 것과 일관).
  const config = dataManager.getCommissionConfig()
  const maxCommissions = config.maxCommissions
  // 현재 레벨의 xpToNext(범위 밖이면 최고 레벨로 클램프 — 경험치 바 분모).
  const levelIdx = Math.min(Math.max(commissionLevel, 1), config.levels.length) - 1
  const xpToNext = config.levels[levelIdx].xpToNext
  const slots = Array.from(
    { length: maxCommissions },
    (_, i) => active[i] ?? null,
  )

  // 키보드(1·2·3) 납품의 코인 연출 출발점을 위해 카드 DOM 을 슬롯별로 잡아 둔다(클릭은 currentTarget 사용).
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([])
  const onSlot = useCallback(
    (slot: number) => {
      const c = active[slot]
      const el = cardRefs.current[slot]
      // 슬롯에 의뢰가 있고 납품 가능할 때만 — 빈 슬롯/미보유 키 입력은 무시.
      if (c && el && canFulfill(c.swordId)) onFulfill(c, el)
    },
    [active, canFulfill, onFulfill],
  )
  useCommissionHotkey({ enabled: hotkeysEnabled, onSlot })

  return (
    <div
      className="mt-3 flex flex-col gap-1.5"
      role="region"
      aria-label={t('commission.title')}
    >
      <CommissionLevelHeader
        label={t('commission.level')}
        level={commissionLevel}
        xp={commissionXp}
        xpToNext={xpToNext}
      />
      <div className="flex gap-2">
        {slots.map((c, i) =>
          c ? (
            <CommissionCard
              key={c.id}
              slotIndex={i}
              commission={c}
              fulfillable={canFulfill(c.swordId)}
              onFulfill={onFulfill}
              cardRef={(el) => {
                cardRefs.current[i] = el
              }}
            />
          ) : (
            <EmptySlot key={`empty-${i}`} slotIndex={i} label={t('commission.empty')} />
          ),
        )}
      </div>
    </div>
  )
}

// 의뢰 레벨 + 경험치 바 헤더. 경험치는 완료/만료 시 이산적으로 변하므로 motion 으로 바 길이를
// 부드럽게 전환한다(scaleX = xp/xpToNext). 레벨 변화 시 분모(xpToNext)도 바뀌어 바가 재계산된다.
function CommissionLevelHeader({
  label,
  level,
  xp,
  xpToNext,
}: {
  label: string
  level: number
  xp: number
  xpToNext: number
}) {
  const ratio = Math.max(0, Math.min(1, xp / xpToNext))
  return (
    <div className="flex items-center gap-2 px-0.5">
      <span className="shrink-0 text-xs font-bold text-enhance-glow">
        {label} {level}
      </span>
      <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-black/25">
        <motion.span
          className="block h-full origin-left rounded-full bg-enhance"
          initial={false}
          animate={{ scaleX: ratio }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          style={{ transformOrigin: 'left' }}
        />
      </span>
      <span className="shrink-0 text-[0.7rem] tabular-nums text-on-dark-soft">
        {xp} / {xpToNext}
      </span>
    </div>
  )
}

function CommissionCard({
  slotIndex,
  commission,
  fulfillable,
  onFulfill,
  cardRef,
}: {
  slotIndex: number
  commission: Commission
  fulfillable: boolean
  onFulfill: (commission: Commission, cardEl: HTMLElement) => void
  cardRef: (el: HTMLButtonElement | null) => void
}) {
  const t = useT()
  const name = itemDisplayName(commission.swordId, t)
  const key = slotIndex + 1 // 납품 단축키(1·2·3)

  return (
    <motion.button
      ref={cardRef}
      type="button"
      initial={{ opacity: 0, scale: 0.85, y: -8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      disabled={!fulfillable}
      onClick={(e) => onFulfill(commission, e.currentTarget)}
      // 보상 동작(납품) + 검 이름을 스크린리더에 합성해 알린다. 단축키도 안내한다.
      aria-label={`${t('commission.fulfill')}: ${name}`}
      aria-keyshortcuts={`${key}`}
      // 납품 가능하면 초록색으로 강조(테두리 + 글로우), 불가하면 흐리게.
      className={`relative flex flex-1 items-center gap-2 overflow-hidden rounded-lg border px-2.5 py-2 text-left transition-opacity ${
        fulfillable
          ? 'cursor-pointer border-success bg-panel ring-1 ring-success/60 shadow-[0_0_12px_-2px_var(--color-success)] hover:opacity-90'
          : 'cursor-not-allowed border-frame/40 bg-panel-soft opacity-60'
      }`}
    >
      <KeyHint slot={key} active={fulfillable} />
      <ItemIcon itemId={commission.swordId} className="h-8 w-8" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-xs font-semibold text-on-dark">
          {name}
        </span>
        <span className="flex items-center gap-1 text-xs font-bold text-gold">
          <CoinIcon />
          {formatAmount(commission.reward)}
        </span>
      </span>
      <TimerBar createdAt={commission.createdAt} expiresAt={commission.expiresAt} />
    </motion.button>
  )
}

// 슬롯 단축키(1·2·3) 힌트 — 카드 우상단 작은 배지. 납품 가능하면 초록으로 또렷하게.
function KeyHint({ slot, active }: { slot: number; active: boolean }) {
  return (
    <span
      aria-hidden
      className={`absolute right-1 top-1 grid h-4 w-4 place-items-center rounded text-[0.65rem] font-bold ${
        active
          ? 'bg-success/25 text-success'
          : 'bg-black/20 text-on-dark-soft'
      }`}
    >
      {slot}
    </span>
  )
}

// 남은 시간 막대 — 카드 하단을 따라 줄어든다. 카드는 c.id 로 마운트되고(완료/만료 시 언마운트),
// 생성(createdAt) 직후 한 tick(≤250ms) 안에 마운트되므로, 전체 길이(expiresAt-createdAt)를 기준으로
// scaleX 1→0 을 선형 애니메이션한다(매 프레임 재렌더·rAF·Date.now 없이 컴포지터가 처리 —
// CoinFlight/GoldDisplay 와 동일 철학). 시간이 줄수록 황금→적색으로 물들어 임박을 알린다.
function TimerBar({
  createdAt,
  expiresAt,
}: {
  createdAt: number
  expiresAt: number
}) {
  const totalSec = Math.max(0, expiresAt - createdAt) / 1000

  return (
    <span className="absolute inset-x-0 bottom-0 h-1 bg-black/25" aria-hidden>
      <motion.span
        className="block h-full origin-left rounded-full"
        initial={{ scaleX: 1, backgroundColor: 'var(--color-gold)' }}
        animate={{
          scaleX: 0,
          // 줄어드는 내내 황금색을 유지하다 끝부분(60%~)에서 적색으로 — 임박 경고.
          backgroundColor: ['#f1c14b', '#f1c14b', '#e8584f'],
        }}
        transition={{
          duration: totalSec,
          ease: 'linear',
          backgroundColor: { duration: totalSec, times: [0, 0.6, 1] },
        }}
      />
    </span>
  )
}

function EmptySlot({ slotIndex, label }: { slotIndex: number; label: string }) {
  return (
    <div
      className="relative flex flex-1 items-center justify-center rounded-lg border border-dashed border-frame/30 bg-panel-soft/40 px-2.5 py-2 text-xs text-on-dark-soft"
      aria-hidden
    >
      {/* 의뢰 카드의 아이콘(h-8 = 콘텐츠 높이)과 동일한 높이를 강제하는 보이지 않는 스페이서 —
          슬롯이 비어도 바 높이가 카드와 같아 화면이 흔들리지 않는다. */}
      <span className="h-8 w-0 shrink-0" aria-hidden />
      <KeyHint slot={slotIndex + 1} active={false} />
      {label}
    </div>
  )
}

function CoinIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5 shrink-0"
      fill="currentColor"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
    </svg>
  )
}
