import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { dataManager } from '../data/DataManager'
import { useEnhanceHotkey } from '../hooks/useEnhanceHotkey'
import { useT, type TranslationKey } from '../i18n'
import { countOf, PROTECTION_TICKET_ID } from '../lib/items'
import { swordSpriteUrl } from '../lib/sprites'
import { useEffectStore } from '../store/effectStore'
import { latestRunning } from '../store/effectQueue'
import { useGameStore } from '../store/gameStore'
import { useCommissionStore } from '../store/commissionStore'
import type { Commission } from '../store/commissionQueue'
import { useUiStore } from '../store/uiStore'
import { CommissionBar } from './CommissionBar'
import {
  DestructionEffect,
  DESTRUCTION_DURATION_MS,
  type DestructionEvent,
} from './DestructionEffect'
import { destructionTargetOf } from './destruction'
import { coinCount } from './coins'
import { CoinFlight, COIN_FLIGHT_MS, type CoinFlightEvent } from './CoinFlight'
import { DropScatter, DROP_LIFETIME_MS, type DropEvent } from './DropScatter'
import { EnhanceButton } from './EnhanceButton'
import { GoldDisplay } from './GoldDisplay'
import { InventoryPanel } from './InventoryPanel'
import { particleCount } from './particles'
import { SellButton } from './SellButton'
import { StoreButton } from './StoreButton'
import { SHAKE_SEC } from './shake'
import { ShopModal } from './ShopModal'
import {
  SuccessEffect,
  SUCCESS_DURATION_MS,
  type SuccessEvent,
} from './SuccessEffect'
import { SwordStage } from './SwordStage'
import { TopControls } from './TopControls'

// 강화 결과를 스크린리더에 알릴 i18n 키(연출 kind → 결과 문구). 시각 연출은 aria-hidden 이라
// 별도의 sr-only 라이브 리전으로 결과를 음성 전달한다(시각 토스트는 연출로 대체되어 제거됨).
const ANNOUNCE_KEY: Record<string, TranslationKey> = {
  successBurst: 'toast.success',
  destruction: 'toast.destroyed',
  protectedShake: 'toast.protected',
}

// 메인 강화 화면. 레퍼런스 레이아웃을 따른 가로 스테이지:
//   상단(언어·난이도 / 상점·닫기) · 좌(비용카드·인벤토리) · 중앙(검 스테이지) · 우(강화·골드).
// 강화 1회 결과는 연출(성공=떨림 후 황금 파티클 / 파괴=떨림 후 폭발 / 방지=떨림)로 보여 주고,
// 결과 문구는 화면에 보이지 않는 sr-only 라이브 리전으로 음성 전달한다.
export function GameScreen() {
  const t = useT()
  const gold = useGameStore((s) => s.gold)
  const currentSwordId = useGameStore((s) => s.currentSwordId)
  const items = useGameStore((s) => s.items)
  const enhance = useGameStore((s) => s.enhance)
  const canEnhanceFn = useGameStore((s) => s.canEnhance)
  const sell = useGameStore((s) => s.sell)
  const canSellFn = useGameStore((s) => s.canSell)
  const store = useGameStore((s) => s.store)
  const equip = useGameStore((s) => s.equip)
  const canStoreFn = useGameStore((s) => s.canStore)
  const collectDrop = useGameStore((s) => s.collectDrop)
  const flushDrops = useGameStore((s) => s.flushDrops)

  const protectionArmed = useUiStore((s) => s.protectionArmed)
  const toggleProtection = useUiStore((s) => s.toggleProtection)

  // 연출(Effect) 시스템 — 강화 버튼 잠금은 lockCount(>0이면 잠금), 연출 트리거는 running 에서.
  const enqueueEffect = useEffectStore((s) => s.enqueueEffect)
  const lockCount = useEffectStore((s) => s.lockCount)
  const running = useEffectStore((s) => s.running)

  const sword =
    currentSwordId !== null
      ? dataManager.getSwordById(currentSwordId)
      : undefined

  // 파괴보호장치 사용(armed) 가능 조건: 단계가 파괴보호장치를 허용(number>0)하고, 요구 수량 이상 보유.
  const ownedTickets = countOf(items, PROTECTION_TICKET_ID)
  const canArm =
    sword !== undefined &&
    typeof sword.protectionTickets === 'number' &&
    sword.protectionTickets > 0 &&
    ownedTickets >= sword.protectionTickets
  const effectiveProtection = protectionArmed && canArm
  const canEnhance = canEnhanceFn(effectiveProtection)
  const canSell = canSellFn()
  const canStore = canStoreFn()

  // 강화 버튼과 스페이스 단축키가 공유하는 단일 게이트(강화 불가거나 연출 잠금 중이면 비활성).
  const enhanceDisabled = !canEnhance || lockCount > 0

  // 상점 팝업 열림 상태.
  const [shopOpen, setShopOpen] = useState(false)
  const openShop = useCallback(() => setShopOpen(true), [])
  const closeShop = useCallback(() => setShopOpen(false), [])

  // 판매 코인 연출의 출발점(검 박스)·도착점(골드창) 측정용 ref.
  const swordBoxRef = useRef<HTMLDivElement>(null)
  const goldRef = useRef<HTMLDivElement>(null)
  // 파괴 드롭 수집 연출의 도착점(인벤토리창) 측정용 ref(출발점은 검 박스 = swordBoxRef).
  const inventoryRef = useRef<HTMLDivElement>(null)

  // 의뢰 완료 코인 연출 — 출발점이 클릭한 의뢰 카드(판매의 검 박스와 다름)라 별도 CoinFlight 인스턴스를 쓴다.
  // 클릭 순간 카드의 viewport rect 를 캡처해 fixed anchor 에 박아 두면, 카드가 active 에서 빠져 사라져도
  // 출발 좌표가 유효하다(언마운트 타이밍에 의존하지 않음). coinKeyRef 는 같은 효과를 연타로 재생할 키.
  const [commissionCoin, setCommissionCoin] = useState<{
    id: number
    rect: DOMRect
    coinCount: number
  } | null>(null)
  const commissionAnchorRef = useRef<HTMLDivElement>(null)
  const commissionCoinKey = useRef(0)

  // 골드창 상승 연출(통통통 + 숫자 카운트업)은 GoldDisplay 의 pulseKey 변화로만 구동된다.
  // 판매와 의뢰 완료가 공유하는 단일 펄스 — 둘 다 골드를 늘리므로 같은 카운터를 올린다.
  // (코인 비행 자체는 출발점이 달라 각자 다른 CoinFlight 인스턴스로 그리지만, 골드 상승은 한 경로로 모은다.)
  const [goldPulse, setGoldPulse] = useState<{ key: number; count: number }>({
    key: 0,
    count: 0,
  })

  const handleFulfill = (commission: Commission, cardEl: HTMLElement) => {
    const rect = cardEl.getBoundingClientRect()
    // 생명주기·검 소모는 store 가 소유 — 수락(true)일 때만 코인 연출을 띄운다.
    if (!useCommissionStore.getState().fulfill(commission.id)) return
    commissionCoinKey.current += 1
    setCommissionCoin({
      id: commissionCoinKey.current,
      rect,
      coinCount: coinCount(commission.reward),
    })
    setGoldPulse((p) => ({ key: p.key + 1, count: coinCount(commission.reward) }))
  }

  const handleSell = () => {
    const price = sell()
    if (price === null || price <= 0) return
    // 판매 = 검에서 코인이 뿜어져 골드창으로 빨려 들어가는 연출(잠금 없음·병렬). 코인 수는 판매가에 비례.
    enqueueEffect({
      kind: 'coinFlight',
      exclusive: false,
      locksEnhance: false,
      durationMs: COIN_FLIGHT_MS,
      payload: { coinCount: coinCount(price) },
    })
    setGoldPulse((p) => ({ key: p.key + 1, count: coinCount(price) }))
  }

  const handleEnhance = () => {
    const result = enhance(effectiveProtection)
    if (!result) return

    // 강화 버튼 잠금(0.4s)은 성공·파괴 공통 — 연출과 별개의 병렬 효과(lockCount). SHAKE_SEC 가 단일 출처.
    const lockEnhance = () =>
      enqueueEffect({
        kind: 'enhanceLock',
        exclusive: false,
        locksEnhance: true,
        durationMs: SHAKE_SEC * 1000,
      })

    if (result.outcome === 'success') {
      // 성공 = (실패와 동일 안무) 떨림 → 황금 파티클 분출 + 상위 검 등장(잠금X) ∥ 강화 버튼 잠금(0.4s).
      // 잔상은 강화 전 검(fromId), 파티클 수는 도달 검(toId)의 단계에 비례 — 둘 다 이 뷰 경계에서 해석(원칙 2).
      const from = dataManager.getSwordById(result.fromId)
      const next = dataManager.getSwordById(result.toId)
      if (from) {
        enqueueEffect({
          kind: 'successBurst',
          exclusive: false,
          locksEnhance: false,
          durationMs: SUCCESS_DURATION_MS,
          payload: {
            spriteUrl: swordSpriteUrl(from.sprite),
            particleCount: particleCount(next?.level ?? 0),
          },
        })
        // 새(상위) 검 등장을 떨림 구간(0.4s)만 가린다 — 파괴와 동일(분출에서 드러나듯 등장).
        // 잠금 해제(0.4s) 후 재강화로 마운트되는 새 검이 잘못 지연돼 사라지지 않도록 연출 전체가 아닌 0.4s만.
        enqueueEffect({
          kind: 'entranceSuppress',
          exclusive: false,
          locksEnhance: false,
          durationMs: SHAKE_SEC * 1000,
        })
      }
      lockEnhance()
    } else if (result.outcome === 'destroyed') {
      // 파괴 = 폭발 연출(잠금X·~1초) ∥ 강화 버튼 잠금(0.4s). 파티클 수는 파괴된 검(fromId)의 단계에 비례.
      // 스프라이트(fromId)는 이 뷰 경계에서 해석해 payload 로 넘긴다(원칙 2).
      const target = destructionTargetOf(result)
      const destroyed = target ? dataManager.getSwordById(target.id) : undefined
      if (target && destroyed) {
        enqueueEffect({
          kind: 'destruction',
          exclusive: false,
          locksEnhance: false,
          durationMs: DESTRUCTION_DURATION_MS,
          payload: {
            spriteUrl: swordSpriteUrl(destroyed.sprite),
            particleCount: particleCount(destroyed.level),
          },
        })
        // 새 검(+0) 등장을 떨림 구간(0.4s)만 가린다 — 파괴 연출 전체(~1초)가 아니라.
        // 그래야 잠금 해제(0.4s) 후 +0 을 재강화해 성공해도 새 검이 0.4s 사라지지 않는다.
        enqueueEffect({
          kind: 'entranceSuppress',
          exclusive: false,
          locksEnhance: false,
          durationMs: SHAKE_SEC * 1000,
        })
      }
      // 드롭이 있으면 재료가 검 아래로 흩어져 떨어지는 연출(잠금X·병렬). 폭발이 드러난 뒤
      // 떨어지도록 등장은 연출 내부에서 지연한다. 실제 인벤토리 수량은 store 에서 이미 반영됨.
      if (result.drops.length > 0) {
        enqueueEffect({
          kind: 'drop',
          exclusive: false,
          locksEnhance: false,
          durationMs: DROP_LIFETIME_MS,
          payload: { drops: result.drops.map((d) => ({ ...d })) },
        })
      }
      lockEnhance()
    } else if (result.outcome === 'protected') {
      // 방지 = 떨림만(잠금·폭발 없음) → 파괴보호장치 덕분에 살아남았음을 인지시킨다.
      enqueueEffect({
        kind: 'protectedShake',
        exclusive: false,
        locksEnhance: false,
        durationMs: SHAKE_SEC * 1000,
      })
    }
  }

  // 데스크탑에서 스페이스바 = 강화(상점이 닫혀 있을 때만, 강화 버튼과 동일한 게이트를 따른다).
  useEnhanceHotkey({
    enabled: !shopOpen,
    disabled: enhanceDisabled,
    onEnhance: handleEnhance,
  })

  // 연출 트리거는 effectStore 의 running 에서 "가장 최근"으로 뽑는다(latestRunning — 겹친 새 효과 유실 방지).
  // 생명주기·타이밍은 Effect 시스템이 소유한다.
  const destructionEvent = useMemo<DestructionEvent | null>(() => {
    const fx = latestRunning(running, 'destruction')
    return fx?.payload?.spriteUrl
      ? {
          id: fx.id,
          spriteUrl: fx.payload.spriteUrl,
          particleCount: fx.payload.particleCount ?? 0,
        }
      : null
  }, [running])
  const successEvent = useMemo<SuccessEvent | null>(() => {
    const fx = latestRunning(running, 'successBurst')
    return fx?.payload?.spriteUrl
      ? {
          id: fx.id,
          spriteUrl: fx.payload.spriteUrl,
          particleCount: fx.payload.particleCount ?? 0,
        }
      : null
  }, [running])
  const coinFlightEvent = useMemo<CoinFlightEvent | null>(() => {
    const fx = latestRunning(running, 'coinFlight')
    return fx ? { id: fx.id, coinCount: fx.payload?.coinCount ?? 0 } : null
  }, [running])
  const dropEvent = useMemo<DropEvent | null>(() => {
    const fx = latestRunning(running, 'drop')
    return fx?.payload?.drops?.length
      ? { id: fx.id, drops: fx.payload.drops }
      : null
  }, [running])
  // 드롭 연출이 끝나면(running 에서 'drop' 효과가 빠져 dropEvent 가 null 이 됨) 미수집 대기분을
  // 인벤토리로 회수한다(연출 완료 콜백이 누락돼도 유실 0). flushDrops 는 멱등 — 빈 대기분이면 무변화.
  useEffect(() => {
    if (dropEvent === null) flushDrops()
  }, [dropEvent, flushDrops])
  const shakeKey = latestRunning(running, 'protectedShake')?.id ?? 0

  // 결과를 스크린리더에 알린다(시각 연출은 aria-hidden). 가장 최근 알림 대상 효과의 문구.
  let announceFx: { id: number; kind: string } | null = null
  for (const e of running) {
    if (e.kind in ANNOUNCE_KEY && (announceFx === null || e.id > announceFx.id))
      announceFx = e
  }
  const announcement = announceFx ? t(ANNOUNCE_KEY[announceFx.kind]) : ''

  return (
    <div className="flex min-h-svh items-center justify-center overflow-auto bg-bezel p-3 sm:p-6">
      <div className="relative w-full max-w-5xl rounded-2xl border border-stage-edge bg-stage p-4 shadow-2xl sm:p-5">
        <TopControls onOpenShop={openShop} />

        {/* 상단 의뢰 바 — 요구 검을 보유했을 때 클릭하면 검을 넘기고 보상(판매가+인센티브)을 받는다. */}
        <CommissionBar onFulfill={handleFulfill} hotkeysEnabled={!shopOpen} />

        {/* 모바일(<sm)은 단일 컬럼으로 스택 — 좁은 화면에서 고정폭 검 스테이지가
            좁은 트랙에 눌려 좌우 패널과 겹치는 것을 방지(반응형 폴리시는 스프린트 6). */}
        <div className="mt-3 grid grid-cols-1 gap-4 sm:min-h-[34rem] sm:grid-cols-[minmax(9.5rem,13rem)_minmax(0,1fr)_minmax(11rem,13rem)]">
          {/* 좌: 인벤토리(강화비용·판매가는 우측 버튼으로 통합 — 별도 비용 카드 없음) */}
          {/* ref: 파괴 드롭이 빨려 들어갈 도착점 측정용. */}
          <div ref={inventoryRef} className="flex min-h-0 flex-col">
            <div className="min-h-0 flex-1">
              <InventoryPanel
                sword={sword}
                level={sword?.level ?? null}
                items={items}
                onEquip={equip}
              />
            </div>
          </div>

          {/* 중앙: 검 스테이지 + 결과 연출(오버레이) */}
          <div className="relative flex items-center justify-center">
            <SwordStage
              sword={sword}
              level={sword?.level ?? null}
              ownedTickets={ownedTickets}
              armed={effectiveProtection}
              canArm={canArm}
              onToggleProtection={toggleProtection}
              spriteOverlay={
                <>
                  <DestructionEffect event={destructionEvent} />
                  <SuccessEffect event={successEvent} />
                </>
              }
              // 새 검 등장 지연은 "떨림 구간"에만(entranceSuppress 효과의 수명 = 0.4s) — 파괴 연출
              // 전체가 아니라. 그래야 연출 도중 재강화로 마운트되는 새 검이 잘못 지연돼 사라지지 않는다.
              entranceDelay={
                latestRunning(running, 'entranceSuppress') ? SHAKE_SEC : 0
              }
              // 방지 시 실제 검을 떨게 한다(파괴와 구분 — 폭발 없이 떨림만).
              shakeKey={shakeKey}
              // 판매 코인이 뿜어져 나올 출발점(검 박스) 측정용.
              swordBoxRef={swordBoxRef}
            />
            {/* 결과 음성 알림(시각 연출은 aria-hidden) — 화면엔 보이지 않는 라이브 리전. */}
            <div
              role="status"
              aria-live="polite"
              aria-atomic="true"
              className="sr-only"
            >
              {announcement}
            </div>
          </div>

          {/* 우: 강화 카드(비용 포함) + 판매 버튼(판매가 포함) + 보관 버튼(세로 중앙) + 골드(하단) */}
          <div className="flex flex-col items-center justify-between gap-4">
            <div className="grid w-full flex-1 place-items-center">
              <div className="flex w-full flex-col items-center gap-3">
                <EnhanceButton
                  disabled={enhanceDisabled}
                  onEnhance={handleEnhance}
                  enhanceCost={sword?.enhanceCost ?? null}
                />
                <SellButton
                  disabled={!canSell}
                  onSell={handleSell}
                  sellPrice={sword?.sellPrice ?? null}
                />
                <StoreButton disabled={!canStore} onStore={store} />
              </div>
            </div>
            <div ref={goldRef} className="w-full">
              <GoldDisplay
                gold={gold}
                pulseKey={goldPulse.key}
                coinCount={goldPulse.count}
              />
            </div>
          </div>
        </div>

        {/* 판매 코인 연출 — 카드 전체를 덮는 오버레이(검 → 골드창, 컬럼 가로지름). 자리만 차지하지
            않도록 absolute. 출발/도착은 swordBoxRef·goldRef 로 측정한다. */}
        <CoinFlight
          event={coinFlightEvent}
          sourceRef={swordBoxRef}
          targetRef={goldRef}
        />

        {/* 의뢰 완료 코인 연출 — 출발점은 클릭한 의뢰 카드(아래 fixed anchor 로 좌표 고정), 도착점은 골드창.
            anchor 는 보이지 않는 영점 크기 요소로, 카드가 사라진 뒤에도 측정한 출발 좌표를 유지한다. */}
        {commissionCoin && (
          <div
            ref={commissionAnchorRef}
            aria-hidden
            className="pointer-events-none fixed"
            style={{
              left: commissionCoin.rect.left + commissionCoin.rect.width / 2,
              top: commissionCoin.rect.top + commissionCoin.rect.height / 2,
              width: 0,
              height: 0,
            }}
          />
        )}
        <CoinFlight
          event={
            commissionCoin
              ? { id: commissionCoin.id, coinCount: commissionCoin.coinCount }
              : null
          }
          sourceRef={commissionAnchorRef}
          targetRef={goldRef}
        />

        {/* 파괴 드롭 수집 연출 — 카드 전체를 덮는 오버레이(검 아래 → 인벤토리창). 재료가 검 아래로
            흩어져 떨어진 뒤 마우스로 스칠 때마다(또는 일정 시간 후) 인벤토리로 빨려 든다. */}
        <DropScatter
          event={dropEvent}
          sourceRef={swordBoxRef}
          targetRef={inventoryRef}
          onCollect={collectDrop}
        />
      </div>

      {/* 상점 팝업 (전체 화면 오버레이 — 열렸을 때만 렌더) */}
      <ShopModal open={shopOpen} onClose={closeShop} />
    </div>
  )
}
