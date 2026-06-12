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
import type { GambleSession } from '../store/gameStore'
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
  // 도박 한 라운드 굴림 — store 굴림 + 메인 스테이지 강화 성공/실패 연출을 GameScreen 이 한 곳에서 처리한다.
  onGambleRoll: () => void
  // 굴림 비활성(직전 판정 연출 중 = 강화 잠금) — 연출 한 번이 끝난 뒤 다음 굴림이 가능하게 한다.
  gambleRollDisabled: boolean
}

export function CommissionBar({
  onFulfill,
  hotkeysEnabled,
  onGambleRoll,
  gambleRollDisabled,
}: CommissionBarProps) {
  const t = useT()
  const active = useCommissionStore((s) => s.active)
  // 도박(press-your-luck) 세션 — 진행 중이면 카드 행을 수상한 상인 진행 카드로 대체한다(누르면 1라운드 굴림,
  // 만료 시 자동 멈춤). 굴림 자체는 onGambleRoll(GameScreen)이, 만료 자동 멈춤은 여기서 bankGamble 로 한다.
  const gambleSession = useGameStore((s) => s.gambleSession)
  const bankGamble = useGameStore((s) => s.bankGamble)
  // items/currentSwordId 를 구독해 보유 상태가 바뀌면 카드 활성/비활성이 갱신되게 한다.
  const items = useGameStore((s) => s.items)
  const currentSwordId = useGameStore((s) => s.currentSwordId)
  // 거래·도박 공통 게이트(Commission 전체를 받는다) — 거래는 비용 충족, 도박은 검 보유 여부.
  const canFulfillCommission = useGameStore((s) => s.canFulfillCommission)
  // gold 도 구독한다 — 골드 비용 거래는 보유 골드가 비용을 넘는 순간 카드가 활성(초록)으로 바뀌어야 한다.
  const gold = useGameStore((s) => s.gold)
  void items
  void gold
  // 도박 제안 카드의 성공/실패 도달 레벨 계산용 — 현재 장착 검 레벨(없으면 0). currentSwordId 구독이라
  // 검이 바뀌면(강화·도박 등) 카드 표시도 갱신된다.
  const curSwordLevel = currentSwordId
    ? (dataManager.getSwordById(currentSwordId)?.level ?? 0)
    : 0

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

  // 제안 잠금 게이트(스토어와 동일 기준: 도달 강화 레벨 maxLevelReached >= unlockAtLevel). 잠금 중엔
  // 스토어가 active 를 비워 두지만(출제 안 함), 빈 바 영역까지 통째로 숨겨 초반 내내 "제안" 리전이
  // 노출되지 않게 한다. 단조라 한 번 해제되면 다시 잠기지 않는다.
  const maxLevelReached = useGameStore((s) => s.maxLevelReached)
  const locked = maxLevelReached < config.unlockAtLevel

  // 키보드(1·2·3) 납품 시 코인 연출의 출발점이 될 카드 DOM 을 슬롯 인덱스로 찾기 위한 컨테이너(클릭 경로는 currentTarget 사용).
  const slotsRef = useRef<HTMLDivElement>(null)
  const onSlot = useCallback(
    (slot: number) => {
      const c = active[slot]
      // 슬롯에 의뢰가 있고 성사 가능할 때만 — 빈 슬롯/미보유 키 입력은 무시(거래·도박 공통 게이트).
      if (!c || !canFulfillCommission(c)) return
      // 코인 연출의 출발점이 될 카드 DOM 을 슬롯 인덱스로 찾아 넘긴다(연출 전용·선택). 못 찾아도 onFulfill 이
      // 출발점을 옵션으로 받아 납품은 그대로 진행한다 — 마우스(currentTarget)와 동일하게 동작.
      const originEl =
        slotsRef.current?.querySelector<HTMLElement>(
          `[data-commission-slot="${slot}"]`,
        ) ?? null
      onFulfill(c, originEl)
    },
    [active, canFulfillCommission, onFulfill],
  )
  useCommissionHotkey({ enabled: hotkeysEnabled, onSlot })

  // 잠금 중이면 바 영역을 통째로 렌더하지 않는다(훅은 위에서 모두 호출한 뒤 — 훅 순서 불변).
  if (locked) return null

  // 통합 세션 타이머: 세션의 모든 제안이 같은 만료를 공유하므로 아무 제안(active[0])에서 createdAt/expiresAt 를
  // 읽어 카드 묶음 아래 단일 바로 표현한다. 세션이 비면(쿨다운) null → 바를 렌더하지 않는다. active 의 id 는
  // 단조 증가하고 complete/만료가 세션을 통째로 비우므로, 한 세션이 떠 있는 동안 active[0].id 는 안정적이다
  // (세션 단위 key) — 새 세션이 시작될 때만 바뀌어 바가 처음부터 다시 줄어든다.
  const session = active[0] ?? null

  return (
    <div
      className="mt-3 flex flex-col gap-1.5"
      role="region"
      aria-label={t('commission.title')}
    >
      {/* 거래 제안 카드는 게임 레이아웃이 허용하는 폭을 모두 쓴다 — 상단바(TopControls)·메인 그리드와
          동일한 62rem 밴드(lg+)를 mx-auto 로 가운데 정렬해 좌우 끝이 인벤토리/강화 패널과 맞물리게 한다.
          <lg(세로형)에선 컨테이너 폭을 그대로 꽉 채운다. 통합 타이머 바는 카드 행 아래에 같은 밴드 폭으로
          이어 붙인다(flex-col). 도착 연출 오버레이(OfferArrivalFx)는 카드 행 컨테이너(relative)에만 absolute
          inset-0 으로 깔려 카드 영역에만 정렬되고 타이머 바는 덮지 않는다. 62rem 은 그리드 컬럼 합
          (16+28+16 + gap)과 동기화할 것 — 컬럼/갭을 바꾸면 이 값도 함께 고친다. */}
      <div className="mx-auto flex w-full flex-col gap-1.5 lg:max-w-[62rem]">
        <div className="relative">
          <OfferArrivalFx />
          {/* 도박 세션 중엔 카드 행을 "수상한 상인 진행 카드" 하나만 남긴다("제안만 남고"). 클릭 순간 fulfill 이
              complete 로 다른 제안을 비워 active 는 이미 [] 라, 진행 카드 + 빈 슬롯만 남는다. 누를 때마다 1라운드
              굴려 메인 스테이지에 강화 성공/실패가 나오고, 검이 실제로 상승/하락한다(non-escrow). */}
          {gambleSession !== null ? (
            <div className="flex gap-2">
              <ActiveGambleCard
                session={gambleSession}
                disabled={gambleRollDisabled}
                onRoll={onGambleRoll}
                onExpire={bankGamble}
              />
              {Array.from({ length: Math.max(0, maxCommissions - 1) }, (_, i) => (
                <EmptySlot key={`gamble-empty-${i}`} />
              ))}
            </div>
          ) : (
            <div ref={slotsRef} className="flex gap-2">
              {slots.map((c, i) =>
                c ? (
                  <CommissionCard
                    key={c.id}
                    slotIndex={i}
                    commission={c}
                    fulfillable={canFulfillCommission(c)}
                    currentLevel={curSwordLevel}
                    onFulfill={onFulfill}
                  />
                ) : (
                  <EmptySlot key={`empty-${i}`} />
                ),
              )}
            </div>
          )}
        </div>
        {/* 통합 타이머 바 — 도박 중엔 세션 deadline 까지, 평소엔 의뢰 세션 만료까지 줄어든다. */}
        {gambleSession !== null ? (
          <GambleTimerBar
            key={`gamble-${gambleSession.deadline}`}
            deadline={gambleSession.deadline}
          />
        ) : session ? (
          <SessionTimerBar
            key={session.id}
            createdAt={session.createdAt}
            expiresAt={session.expiresAt}
          />
        ) : null}
      </div>
    </div>
  )
}

function CommissionCard({
  slotIndex,
  commission,
  fulfillable,
  currentLevel,
  onFulfill,
}: {
  slotIndex: number
  commission: Commission
  fulfillable: boolean
  // 도박 카드의 성공/실패 도달 레벨 계산용(현재 장착 검 레벨). 거래 카드는 쓰지 않는다.
  currentLevel: number
  onFulfill: (commission: Commission, cardEl: HTMLElement) => void
}) {
  const t = useT()
  // 도박(수상한 상인)은 비용/보상 구조가 없어 별도 카드로 렌더한다(검을 걸어 ±레벨 — kind 로 분기).
  if (commission.kind === 'gamble') {
    return (
      <GambleCard
        slotIndex={slotIndex}
        commission={commission}
        fulfillable={fulfillable}
        currentLevel={currentLevel}
        onFulfill={onFulfill}
      />
    )
  }
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
    reward.kind === 'gold' ? `${formatAmount(reward.amount)} gold` : rewardName

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
            </>
          ) : null}
        </span>
      </span>
    </motion.button>
  )
}

// 수상한 상인(도박) 카드 — 거래와 달리 비용/보상이 없고 "검을 걸어" 성공(+winDelta)/실패(−loseDelta)로 갈린다.
// 즉시 실행(확인 모달 없음 — 디자인 결정)이라 거래 카드와 똑같이 클릭/숫자키로 바로 onFulfill 한다(판정은 셸).
// 위험을 시각으로 구분하기 위해 강조색을 거래(success=초록) 대신 danger(적색) 계열로 둔다.
function GambleCard({
  slotIndex,
  commission,
  fulfillable,
  currentLevel,
  onFulfill,
}: {
  slotIndex: number
  commission: Extract<Commission, { kind: 'gamble' }>
  fulfillable: boolean
  // 현재 장착 검 레벨 — 클릭(첫 굴림)의 성공/실패 도달 레벨을 카드에 미리 보여 주는 데 쓴다(base = 현재 검).
  currentLevel: number
  onFulfill: (commission: Commission, cardEl: HTMLElement) => void
}) {
  const t = useT()
  const key = slotIndex + 1 // 실행 단축키(1·2·3) — 거래와 동일
  return (
    <motion.button
      type="button"
      data-commission-slot={slotIndex}
      initial={{ opacity: 0, scale: 0.85, y: -8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      disabled={!fulfillable}
      onClick={(e) => onFulfill(commission, e.currentTarget)}
      // 진입점임을 스크린리더에 알린다 — 누르면 다른 제안이 사라지고 진행 카드로 바뀌어 라운드를 굴린다.
      aria-label={`${t('commission.gamble.title')}: ${t('commission.gamble.stake')}`}
      aria-keyshortcuts={`${key}`}
      // 성사 가능(검 보유)하면 적색으로 강조(위험), 불가하면 흐리게.
      className={`relative flex flex-1 items-center justify-center gap-3 overflow-hidden rounded-lg border px-3 py-4 text-left transition-opacity ${
        fulfillable
          ? 'cursor-pointer border-danger bg-panel ring-1 ring-danger/60 shadow-[0_0_12px_-2px_var(--color-danger)] hover:opacity-90'
          : 'cursor-not-allowed border-frame/40 bg-panel-soft opacity-60'
      }`}
    >
      <KeyHint slot={key} active={fulfillable} />
      {/* 헤드라인 = 주사위(도박 상징). */}
      <span
        className="grid h-12 w-12 shrink-0 place-items-center text-danger"
        aria-hidden
      >
        <DiceIcon className="h-9 w-9" />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-xs font-semibold text-on-dark">
          {t('commission.gamble.title')}
        </span>
        {/* 정보만 보여 준다 — 클릭(첫 굴림) 성공 시 도달 검(+N) / 실패 시 도달 검(+M) / 성공 확률(%).
            base = 현재 검 레벨이라, 그 한 번이 검을 어디로 보낼지 미리 알 수 있다. */}
        <GambleOdds
          winLevel={gambleWinLevel(currentLevel, commission.winDelta)}
          loseLevel={gambleLoseLevel(currentLevel, commission.loseDelta)}
          chance={commission.successChance}
        />
      </span>
    </motion.button>
  )
}

// 도박 도달 레벨 — 성공은 상한(최고 검)에서, 실패는 하한(시작 검 +1)에서 클램프한다(순수 코어 pressRound 와 동일
// 규칙). 진입 카드는 현재 검 레벨을 base 로, 진행 카드는 누적/시작 레벨을 넘긴다(실패는 항상 시작 base 기준 — 모델 A).
function gambleWinLevel(fromLevel: number, winDelta: number): number {
  return Math.min(dataManager.getMaxSwordLevel(), fromLevel + winDelta)
}
function gambleLoseLevel(baseLevel: number, loseDelta: number): number {
  return Math.max(1, baseLevel - loseDelta)
}

// 도박 정보 표시(성공/실패 도달 레벨 + 성공 확률) — 제안 카드·진행 카드가 공유한다. 성공=초록(상승), 실패=적색
// (하락), 확률은 중립. "검을 걸기" 같은 안내 문구 없이 "몇 강화가 되는지"만 보여 준다(요구사항).
function GambleOdds({
  winLevel,
  loseLevel,
  chance,
}: {
  winLevel: number
  loseLevel: number
  chance: number
}) {
  const t = useT()
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-bold tabular-nums">
      <span className="text-success">
        {t('commission.gamble.next')} +{winLevel}
      </span>
      <span className="text-on-dark-soft">{Math.round(chance * 100)}%</span>
      <span className="text-danger">
        {t('commission.gamble.bustTo')} +{loseLevel}
      </span>
    </span>
  )
}

// 수상한 상인(도박) 진행 카드 — 세션이 열려 있는 동안 카드 행에서 다른 제안 자리를 대신한다(다른 제안은 사라지고
// 이 카드만 남는다). 누를 때마다 1라운드 굴린다(onRoll = GameScreen 의 굴림+연출). 성공이면 검이 실제로 강화되어
// (메인 스테이지 강화 성공 연출) 다음 라운드를 또 누를 수 있고, 실패면 검이 하락하며 종료, 최대 maxRounds. 별도
// 패널 없이 "검을 강화/약화"하는 카드일 뿐 — 누적 진행은 스테이지의 검 레벨로 보인다. 굴림 연출 중(disabled)엔
// 막아 한 번이 끝난 뒤 다음 굴림이 가능하게 한다(강화 버튼과 동일 박자). 만료(deadline) 시 자동으로 멈춰 현재
// 누적을 지킨다(onExpire = bankGamble — 만료는 패배가 아니다).
function ActiveGambleCard({
  session,
  disabled,
  onRoll,
  onExpire,
}: {
  session: GambleSession
  disabled: boolean
  onRoll: () => void
  onExpire: () => void
}) {
  const t = useT()
  // 만료 자동 멈춤 — deadline(세션 내내 불변) 도달 시 1회. 라운드로 session 참조가 바뀌어도 같은 절대 시각까지만 센다.
  useEffect(() => {
    const ms = session.deadline - Date.now()
    if (ms <= 0) {
      onExpire()
      return
    }
    const timer = window.setTimeout(onExpire, ms)
    return () => clearTimeout(timer)
  }, [session, onExpire])

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, scale: 0.85, y: -8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      disabled={disabled}
      onClick={onRoll}
      // 누를 때마다 1라운드 굴림. 진행(누적·라운드)은 스테이지 검과 라운드 점으로 보인다.
      aria-label={`${t('commission.gamble.title')}: ${t('commission.gamble.roll')}`}
      className={`relative flex flex-1 items-center justify-center gap-3 overflow-hidden rounded-lg border px-3 py-4 text-left transition-opacity ${
        disabled
          ? 'cursor-wait border-danger/40 bg-panel-soft opacity-60' // 연출 중 — 다음 굴림 대기
          : 'cursor-pointer border-danger bg-panel ring-1 ring-danger/60 shadow-[0_0_12px_-2px_var(--color-danger)] hover:opacity-90'
      }`}
    >
      <span
        className="grid h-12 w-12 shrink-0 place-items-center text-danger"
        aria-hidden
      >
        <DiceIcon className="h-9 w-9" />
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="truncate text-xs font-semibold text-on-dark">
          {t('commission.gamble.title')}
        </span>
        {/* 이번 굴림의 성공/실패 도달 레벨 + 성공 확률 — 제안 카드와 동일 정보. 성공은 현재 누적(press.currentLevel)
            기준 +winDelta, 실패는 시작(press.baseLevel) 기준 -loseDelta(모델 A — 쌓을수록 실패 손실이 커진다). */}
        <GambleOdds
          winLevel={gambleWinLevel(
            session.press.currentLevel,
            session.params.winDelta,
          )}
          loseLevel={gambleLoseLevel(
            session.press.baseLevel,
            session.params.loseDelta,
          )}
          chance={session.params.successChance}
        />
        {/* 라운드 진행(●●○) — maxRounds 한도를 보여 준다. */}
        <RoundDots done={session.press.round} total={session.params.maxRounds} />
      </span>
    </motion.button>
  )
}

// 라운드 진행 점 — 완료한 승리 라운드(done)는 채워지고 남은 칸은 빈 점. total = maxRounds.
function RoundDots({ done, total }: { done: number; total: number }) {
  return (
    <span className="mt-0.5 flex gap-1" aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`h-1.5 w-1.5 rounded-full ${
            i < done ? 'bg-danger' : 'bg-frame/40'
          }`}
        />
      ))}
    </span>
  )
}

// 수상한 상인 카드의 주사위 아이콘(도박 상징) — 5눈 단순 표현. 색은 부모가 currentColor 로 정한다.
function DiceIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`${className} shrink-0`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="16" cy="8" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="8" cy="16" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="16" cy="16" r="1.5" fill="currentColor" stroke="none" />
    </svg>
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
// (카드별 바가 아니라 세션 1개 바 = 통합 지속시간). 바는 세션 id 로 key 되어 마운트/언마운트되고(완료·만료 시
// 언마운트), 생성(createdAt) 직후 같은 렌더 커밋에서 마운트되므로 전체 길이(expiresAt-createdAt)를 기준으로
// scaleX 1→0 을 선형 애니메이션한다(매 프레임 재렌더·rAF·Date.now 폴링 없이 컴포지터가 처리 — 카드 타이머가
// 쓰던 것과 동일 철학, 순수 렌더 유지). 새 세션이 시작될 때만 key 가 바뀌어 처음부터 다시 줄어든다.
// 시간이 줄수록 황금→적색으로 물들어 임박을 알린다(motion 은 CSS var 키프레임 보간을 못 하므로 진행색은
// 토큰을 런타임에 1회 해석한 실제 값(cssColorToken)을 쓴다 — index.css 단일 출처 유지, hex 사본 없음).
function SessionTimerBar({
  createdAt,
  expiresAt,
}: {
  createdAt: number
  expiresAt: number
}) {
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

// 도박 진행 타이머 바 — 세션 deadline(절대 시각)까지 scaleX 1→0(SessionTimerBar 와 동일 철학, 컴포지터 처리).
// deadline 으로 key 되어 세션마다 마운트/언마운트되고, 마운트 시점의 남은 시간을 전체 길이로 잡는다. 도박은 항상
// 위험(적색) 강조라 색 보간 없이 단색 danger 로 둔다(임박 경고는 색이 아니라 길이로).
function GambleTimerBar({ deadline }: { deadline: number }) {
  const totalSec = Math.max(0, deadline - Date.now()) / 1000
  return (
    <span
      className="relative block h-1.5 w-full overflow-hidden rounded-full bg-black/25"
      aria-hidden
    >
      <motion.span
        className="block h-full origin-left rounded-full bg-danger"
        initial={{ scaleX: 1 }}
        animate={{ scaleX: 0 }}
        transition={{ duration: totalSec, ease: 'linear' }}
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
