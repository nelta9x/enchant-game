import { motion } from 'motion/react'
import { dataManager } from '../data/DataManager'
import { useT } from '../i18n'
import { itemDisplayName } from '../lib/items'
import { formatAmount } from '../lib/format'
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
}

export function CommissionBar({ onFulfill }: CommissionBarProps) {
  const t = useT()
  const active = useCommissionStore((s) => s.active)
  // items/currentSwordId 를 구독해 보유 상태가 바뀌면 카드 활성/비활성이 갱신되게 한다.
  const items = useGameStore((s) => s.items)
  const currentSwordId = useGameStore((s) => s.currentSwordId)
  const canFulfill = useGameStore((s) => s.canFulfill)
  void items
  void currentSwordId

  // 인덱스 기반 슬롯 — active 가 비는 자리는 placeholder. 카드 식별은 인덱스가 아니라 c.id(React key).
  // 슬롯 수(maxCommissions)는 DataManager 설정에서 읽는다(ItemIcon 이 dataManager 를 직접 쓰는 것과 일관).
  const maxCommissions = dataManager.getCommissionConfig().maxCommissions
  const slots = Array.from(
    { length: maxCommissions },
    (_, i) => active[i] ?? null,
  )

  return (
    <div
      className="mt-3 flex gap-2"
      role="region"
      aria-label={t('commission.title')}
    >
      {slots.map((c, i) =>
        c ? (
          <CommissionCard
            key={c.id}
            commission={c}
            fulfillable={canFulfill(c.swordId)}
            onFulfill={onFulfill}
          />
        ) : (
          <EmptySlot key={`empty-${i}`} label={t('commission.empty')} />
        ),
      )}
    </div>
  )
}

function CommissionCard({
  commission,
  fulfillable,
  onFulfill,
}: {
  commission: Commission
  fulfillable: boolean
  onFulfill: (commission: Commission, cardEl: HTMLElement) => void
}) {
  const t = useT()
  const name = itemDisplayName(commission.swordId, t)

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, scale: 0.85, y: -8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      disabled={!fulfillable}
      onClick={(e) => onFulfill(commission, e.currentTarget)}
      // 보상 동작(납품) + 검 이름을 스크린리더에 합성해 알린다.
      aria-label={`${t('commission.fulfill')}: ${name}`}
      className={`relative flex flex-1 items-center gap-2 overflow-hidden rounded-lg border px-2.5 py-2 text-left transition-opacity ${
        fulfillable
          ? 'cursor-pointer border-enhance/60 bg-panel hover:opacity-90'
          : 'cursor-not-allowed border-frame/40 bg-panel-soft opacity-60'
      }`}
    >
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

function EmptySlot({ label }: { label: string }) {
  return (
    <div
      className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-frame/30 bg-panel-soft/40 px-2.5 py-2 text-xs text-on-dark-soft"
      aria-hidden
    >
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
