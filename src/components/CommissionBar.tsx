import { useCallback, useEffect, useRef } from 'react'
import { motion } from 'motion/react'
import { dataManager } from '../data/DataManager'
import { useT } from '../i18n'
import { itemDisplayName } from '../lib/items'
import { formatAmount } from '../lib/format'
import { cssColorToken } from '../lib/cssToken'
import { useCommissionHotkey } from '../hooks/useCommissionHotkey'
import { useCommissionStore } from '../store/commissionStore'
import { useGameStore } from '../store/gameStore'
import { useOfferFxStore } from '../store/offerFxStore'
import type { Commission } from '../store/commissionQueue'
import { ItemIcon } from './ItemIcon'
import { OfferArrivalFx } from './OfferArrivalFx'

// 상단 의뢰 바. 현재 떠 있는 의뢰(active)를 최대 MAX_COMMISSIONS 슬롯으로 보여 준다.
// 각 의뢰서: 아이템 아이콘 + 이름 + 보상가(판매가에 인센티브가 붙은 금액). 요구 검을 보유했을 때만
// 클릭(납품) 가능하다. 빈 슬롯은 재생성 대기('준비 중') placeholder 로 채워 바 높이를 안정시킨다.
//
// 완료(검 소모+보상)는 부모(GameScreen)가 onFulfill 콜백으로 처리한다. 두 번째 인자는 코인 연출의
// 출발점(클릭한/슬롯의 카드 엘리먼트)이며 연출 전용·선택이다 — null 이어도 납품은 진행된다(키보드 경로 대비).
// 생명주기(active 에서 제거)는 commissionStore.fulfill 이 소유.
type CommissionBarProps = {
  onFulfill: (commission: Commission, originEl: HTMLElement | null) => void
  // 숫자 1·2·3 납품 단축키 활성 여부(상점 열림 등에서 끈다).
  hotkeysEnabled: boolean
}

export function CommissionBar({
  onFulfill,
  hotkeysEnabled,
}: CommissionBarProps) {
  const t = useT()
  const active = useCommissionStore((s) => s.active)
  // items/currentSwordId 를 구독해 보유 상태가 바뀌면 카드 활성/비활성이 갱신되게 한다.
  const items = useGameStore((s) => s.items)
  const currentSwordId = useGameStore((s) => s.currentSwordId)
  const canFulfill = useGameStore((s) => s.canFulfill)
  // gold 도 구독한다 — 골드 비용 거래는 보유 골드가 비용을 넘는 순간 카드가 활성(초록)으로 바뀌어야 한다.
  const gold = useGameStore((s) => s.gold)
  void items
  void currentSwordId
  void gold

  // 새 거래 제안이 슬롯에 들어오면 도착 연출을 1회 재생한다(연출 본체는 OfferArrivalFx).
  // active 의 id 집합을 직전과 비교해 처음 보는 id 가 있으면 발화. 단조 증가 id 라 재사용 충돌 없음.
  const fireOfferFx = useOfferFxStore((s) => s.fire)
  const seenIds = useRef<Set<number>>(new Set())
  const seeded = useRef(false)
  useEffect(() => {
    const ids = active.map((c) => c.id)
    // 첫 마운트(부트스트랩 스폰)는 NEW 로 깜빡이지 않도록 현재 id 를 본 것으로 시드만 한다.
    if (!seeded.current) {
      seenIds.current = new Set(ids)
      seeded.current = true
      return
    }
    const arrived = ids.some((id) => !seenIds.current.has(id))
    seenIds.current = new Set(ids)
    if (arrived) fireOfferFx()
  }, [active, fireOfferFx])

  // 인덱스 기반 슬롯 — active 가 비는 자리는 placeholder. 카드 식별은 인덱스가 아니라 c.id(React key).
  // 슬롯 수(maxCommissions)는 DataManager 설정에서 읽는다(ItemIcon 이 dataManager 를 직접 쓰는 것과 일관).
  const config = dataManager.getCommissionConfig()
  const maxCommissions = config.maxCommissions
  const slots = Array.from(
    { length: maxCommissions },
    (_, i) => active[i] ?? null,
  )

  // 키보드(1·2·3) 납품 시 코인 연출의 출발점이 될 카드 DOM 을 슬롯 인덱스로 찾기 위한 컨테이너(클릭 경로는 currentTarget 사용).
  const slotsRef = useRef<HTMLDivElement>(null)
  const onSlot = useCallback(
    (slot: number) => {
      const c = active[slot]
      // 슬롯에 의뢰가 있고 납품 가능할 때만 — 빈 슬롯/미보유 키 입력은 무시.
      if (!c || !canFulfill(c.cost)) return
      // 코인 연출의 출발점이 될 카드 DOM 을 슬롯 인덱스로 찾아 넘긴다(연출 전용·선택). 못 찾아도 onFulfill 이
      // 출발점을 옵션으로 받아 납품은 그대로 진행한다 — 마우스(currentTarget)와 동일하게 동작.
      const originEl =
        slotsRef.current?.querySelector<HTMLElement>(
          `[data-commission-slot="${slot}"]`,
        ) ?? null
      onFulfill(c, originEl)
    },
    [active, canFulfill, onFulfill],
  )
  useCommissionHotkey({ enabled: hotkeysEnabled, onSlot })

  // 제안 기능이 잠긴 초반에도 바 영역을 통째로 숨기지 않는다 — 잠금 중 스토어가 active 를 비워 두므로
  // (출제 안 함) 일반 렌더 경로가 전 슬롯 EmptySlot + idle 타이머 스페이서로 같은 높이의 빈 영역을 확보해,
  // 해제 전후로 아래 UI 위치가 흔들리지 않게 한다(픽셀 단위로 동일한 footprint). 해제는 단조라 한 번뿐.

  // 통합 세션 타이머: 세션의 모든 제안이 같은 만료를 공유하므로 아무 제안(active[0])에서 createdAt/expiresAt 를
  // 읽어 카드 묶음 아래 단일 바로 표현한다. 세션이 비면(쿨다운/잠금) null → 바는 보이지 않는 동일 높이
  // 스페이서로 자리만 지킨다(아래 SessionTimerBar active=false). active 의 id 는 단조 증가하고 complete/만료가
  // 세션을 통째로 비우므로, 한 세션이 떠 있는 동안 active[0].id 는 안정적이다 (세션 단위 key) — 새 세션이
  // 시작될 때만 바뀌어 바가 처음부터 다시 줄어든다.
  const session = active[0] ?? null

  return (
    <div
      className="mt-3 flex flex-col gap-1.5"
      role="region"
      aria-label={t('commission.title')}
    >
      {/* 거래 제안 카드는 게임 레이아웃이 허용하는 폭을 모두 쓴다 — 상단바(TopControls)·메인 그리드와
          동일한 61rem 밴드(lg+)를 mx-auto 로 가운데 정렬해 좌우 끝이 인벤토리/강화 패널과 맞물리게 한다.
          <lg(세로형)에선 컨테이너 폭을 그대로 꽉 채운다. 통합 타이머 바는 카드 행 아래에 같은 밴드 폭으로
          이어 붙인다(flex-col). 도착 연출 오버레이(OfferArrivalFx)는 카드 행 컨테이너(relative)에만 absolute
          inset-0 으로 깔려 카드 영역에만 정렬되고 타이머 바는 덮지 않는다. 61rem 은 그리드 컬럼 합
          (16+28+16 + gap)과 동기화할 것 — 컬럼/갭을 바꾸면 이 값도 함께 고친다. */}
      <div className="mx-auto flex w-full flex-col gap-1.5 lg:max-w-[61rem]">
        <div className="relative">
          <OfferArrivalFx />
          <div ref={slotsRef} className="flex gap-2">
            {slots.map((c, i) =>
              c ? (
                <CommissionCard
                  key={c.id}
                  slotIndex={i}
                  commission={c}
                  fulfillable={canFulfill(c.cost)}
                  onFulfill={onFulfill}
                />
              ) : (
                <EmptySlot key={`empty-${i}`} />
              ),
            )}
          </div>
        </div>
        {/* 타이머 바 슬롯은 세션이 없어도(쿨다운/잠금) 항상 자식으로 두어 부모 flex-col gap-1.5 의 간격과
            바 높이를 항상 확보한다 — 세션이 떴다 사라질 때 아래 UI 가 흔들리지 않게. 비활성 구간은
            보이지 않는 동일 높이 스페이서로 그린다(SessionTimerBar 내부). key 는 세션 id 기반을 유지하되
            쿨다운 구간은 'idle' 로 두어 idle↔세션 전환 시 remount → 새 세션 애니메이션이 처음부터 재생된다. */}
        <SessionTimerBar
          key={session?.id ?? 'idle'}
          createdAt={session?.createdAt ?? 0}
          expiresAt={session?.expiresAt ?? 0}
          active={session !== null}
        />
      </div>
    </div>
  )
}

function CommissionCard({
  slotIndex,
  commission,
  fulfillable,
  onFulfill,
}: {
  slotIndex: number
  commission: Commission
  fulfillable: boolean
  onFulfill: (commission: Commission, cardEl: HTMLElement) => void
}) {
  const t = useT()
  const key = slotIndex + 1 // 납품 단축키(1·2·3)
  // 거래는 "지불(cost) → 보상(reward)". 둘 다 골드 또는 아이템(Material)이다.
  // 헤드라인 = 지불할 것(큰 아이콘), 보조줄 = 받는 것(→ 표기). 골드 비용 거래는 코인이 헤드라인이 된다.
  const cost = commission.cost
  const reward = commission.reward
  const costName = cost.kind === 'item' ? itemDisplayName(cost.itemId, t) : ''
  const costLvl =
    cost.kind === 'item'
      ? (dataManager.getSwordById(cost.itemId)?.level ?? null)
      : null
  const rewardName =
    reward.kind === 'item' ? itemDisplayName(reward.itemId, t) : ''
  const rewardLvl =
    reward.kind === 'item'
      ? (dataManager.getSwordById(reward.itemId)?.level ?? null)
      : null
  // 스크린리더용 "지불 → 보상" 문구.
  const costLabel =
    cost.kind === 'gold'
      ? `${formatAmount(cost.amount)} gold`
      : `${costName}${cost.count > 1 ? ` ×${cost.count}` : ''}`
  const rewardLabel =
    reward.kind === 'gold'
      ? `${formatAmount(reward.amount)} gold`
      : reward.kind === 'item'
        ? `${rewardName}${reward.count > 1 ? ` ×${reward.count}` : ''}`
        : rewardName

  return (
    <motion.button
      type="button"
      data-commission-slot={slotIndex}
      initial={{ opacity: 0, scale: 0.85, y: -8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      disabled={!fulfillable}
      onClick={(e) => onFulfill(commission, e.currentTarget)}
      // 거래 동작(지불 → 보상)을 스크린리더에 합성해 알린다. 단축키도 안내한다.
      aria-label={`${t('commission.fulfill')}: ${costLabel} → ${rewardLabel}`}
      aria-keyshortcuts={`${key}`}
      // 지불 가능하면 초록색으로 강조(테두리 + 글로우), 불가하면 흐리게.
      className={`relative flex flex-1 items-center justify-center gap-3 overflow-hidden rounded-lg border px-3 py-4 text-left transition-opacity ${
        fulfillable
          ? 'cursor-pointer border-success bg-panel ring-1 ring-success/60 shadow-[0_0_12px_-2px_var(--color-success)] hover:opacity-90'
          : 'cursor-not-allowed border-frame/40 bg-panel-soft opacity-60'
      }`}
    >
      <KeyHint slot={key} active={fulfillable} />
      {/* 헤드라인 아이콘 = 지불할 것(아이템이면 아이콘, 골드면 큰 코인). */}
      {cost.kind === 'item' ? (
        <ItemIcon itemId={cost.itemId} className="h-12 w-12" />
      ) : (
        <span
          className="grid h-12 w-12 shrink-0 place-items-center text-gold"
          aria-hidden
        >
          <CoinIcon className="h-9 w-9" />
        </span>
      )}
      <span className="flex min-w-0 flex-col gap-0.5">
        {/* 지불 라인 */}
        {cost.kind === 'item' ? (
          <span className="flex min-w-0 items-baseline">
            <span className="truncate text-xs font-semibold text-on-dark">
              {costName}
            </span>
            {costLvl !== null && (
              <span className="ml-1 shrink-0 text-xs font-bold tabular-nums text-gold">
                +{costLvl}
              </span>
            )}
            {cost.count > 1 && (
              <span className="ml-1 shrink-0 text-xs font-semibold tabular-nums text-on-dark-soft">
                ×{cost.count}
              </span>
            )}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs font-bold text-gold">
            <CoinIcon />
            {formatAmount(cost.amount)}
          </span>
        )}
        {/* 보상 라인 — "→ 받는 것" */}
        <span className="flex min-w-0 items-center gap-1 text-xs font-bold text-gold">
          <span className="shrink-0 text-on-dark-soft" aria-hidden>
            →
          </span>
          {reward.kind === 'gold' ? (
            <>
              <CoinIcon />
              {formatAmount(reward.amount)}
            </>
          ) : reward.kind === 'item' ? (
            <>
              <ItemIcon itemId={reward.itemId} className="h-4 w-4 shrink-0" />
              <span className="truncate">{rewardName}</span>
              {rewardLvl !== null && (
                <span className="shrink-0 tabular-nums">+{rewardLvl}</span>
              )}
              {reward.count > 1 && (
                <span className="shrink-0 tabular-nums text-on-dark-soft">
                  ×{reward.count}
                </span>
              )}
            </>
          ) : null}
        </span>
      </span>
    </motion.button>
  )
}

// 슬롯 단축키(1·2·3) 힌트 — 카드 우상단 작은 배지. 납품 가능하면 초록으로 또렷하게.
function KeyHint({ slot, active }: { slot: number; active: boolean }) {
  return (
    <span
      aria-hidden
      className={`absolute right-1 top-1 grid h-4 w-4 place-items-center rounded text-[0.65rem] font-bold ${
        active ? 'bg-success/25 text-success' : 'bg-black/20 text-on-dark-soft'
      }`}
    >
      {slot}
    </span>
  )
}

// 통합 세션 타이머 바 — 세션의 모든 제안이 공유하는 만료까지 남은 시간을 카드 묶음 "아래" 단일 바로 표현한다
// (카드별 바가 아니라 세션 1개 바 = 통합 지속시간). 슬롯은 레이아웃 안정을 위해 항상 마운트돼 있고(쿨다운/잠금
// 구간은 active=false 로 보이지 않는 동일 높이 스페이서), 세션 id(쿨다운은 'idle') 로 key 되어 idle↔세션 전환 시
// remount 된다. 세션 생성(createdAt) 직후 같은 렌더 커밋에서 활성 마운트되므로 전체 길이(expiresAt-createdAt)를
// 기준으로 scaleX 1→0 을 선형 애니메이션한다(매 프레임 재렌더·rAF·Date.now 폴링 없이 컴포지터가 처리 — 카드
// 타이머가 쓰던 것과 동일 철학, 순수 렌더 유지). 새 세션이 시작될 때만 key 가 바뀌어 처음부터 다시 줄어든다.
// 시간이 줄수록 황금→적색으로 물들어 임박을 알린다(motion 은 CSS var 키프레임 보간을 못 하므로 진행색은
// 토큰을 런타임에 1회 해석한 실제 값(cssColorToken)을 쓴다 — index.css 단일 출처 유지, hex 사본 없음).
function SessionTimerBar({
  createdAt,
  expiresAt,
  active,
}: {
  createdAt: number
  expiresAt: number
  // 세션이 떠 있는지. false(쿨다운/잠금)면 같은 높이의 보이지 않는 스페이서만 그려 레이아웃 높이만 유지한다.
  active: boolean
}) {
  // 비활성 구간: 트랙·애니메이션 없이 동일 높이(h-1.5) 투명 스페이서. 빈 회색 트랙을 굳이 보여 주지 않는다
  // (EmptySlot 이 허전한 placeholder 를 비우는 것과 같은 철학). 토큰 해석도 건너뛴다.
  if (!active) return <span className="block h-1.5 w-full" aria-hidden />

  const totalSec = Math.max(0, expiresAt - createdAt) / 1000
  const gold = cssColorToken('--color-gold')
  const danger = cssColorToken('--color-danger')

  return (
    <span
      className="relative block h-1.5 w-full overflow-hidden rounded-full bg-black/25"
      aria-hidden
    >
      <motion.span
        className="block h-full origin-left rounded-full"
        initial={{ scaleX: 1, backgroundColor: 'var(--color-gold)' }}
        animate={{
          scaleX: 0,
          // 줄어드는 내내 황금색을 유지하다 끝부분(60%~)에서 적색으로 — 임박 경고.
          backgroundColor: [gold, gold, danger],
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

// 의뢰가 없는 슬롯은 그냥 빈 공간으로 둔다 — 배경·텍스트·키 힌트 없이 비워, "제안 대기 중" 같은
// placeholder 가 허전하게 보이지 않게 한다. 단, 의뢰가 오갈 때 게임 레이아웃이 흔들리지 않도록
// 카드와 동일한 박스 크기는 유지한다: 보이지 않는 스페이서(h-12 = 카드 아이콘 높이) + 같은 px-3/py-4,
// 그리고 box-border 높이에 카드 테두리(border 1px)가 더하는 만큼을 투명 테두리로 똑같이 채운다.
function EmptySlot() {
  return (
    <div
      className="flex flex-1 border border-transparent px-3 py-4"
      aria-hidden
    >
      <span className="h-12 w-0 shrink-0" aria-hidden />
    </div>
  )
}

function CoinIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`${className} shrink-0`}
      fill="currentColor"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
    </svg>
  )
}
