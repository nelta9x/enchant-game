import { useCallback, useMemo, useRef, useState } from 'react'
import { dataManager } from '../data/DataManager'
import { useEnhanceHotkey } from '../hooks/useEnhanceHotkey'
import { useT, type TranslationKey } from '../i18n'
import { countOf, PROTECTION_TICKET_ID } from '../lib/items'
import { swordSpriteUrl } from '../lib/sprites'
import { useEffectStore } from '../store/effectStore'
import { latestRunning } from '../store/effectQueue'
import { useGameStore } from '../store/gameStore'
import { useUiStore } from '../store/uiStore'
import {
  DestructionEffect,
  DESTRUCTION_DURATION_MS,
  type DestructionEvent,
} from './DestructionEffect'
import { destructionTargetOf } from './destruction'
import { coinCount } from './coins'
import { CoinFlight, COIN_FLIGHT_MS, type CoinFlightEvent } from './CoinFlight'
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

  // 방지권 사용(armed) 가능 조건: 단계가 방지권을 허용(number>0)하고, 요구 수량 이상 보유.
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
      lockEnhance()
    } else if (result.outcome === 'protected') {
      // 방지 = 떨림만(잠금·폭발 없음) → 방지권 덕분에 살아남았음을 인지시킨다.
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

        {/* 모바일(<sm)은 단일 컬럼으로 스택 — 좁은 화면에서 고정폭 검 스테이지가
            좁은 트랙에 눌려 좌우 패널과 겹치는 것을 방지(반응형 폴리시는 스프린트 6). */}
        <div className="mt-3 grid grid-cols-1 gap-4 sm:min-h-[34rem] sm:grid-cols-[minmax(9.5rem,13rem)_minmax(0,1fr)_minmax(11rem,13rem)]">
          {/* 좌: 인벤토리(강화비용·판매가는 우측 버튼으로 통합 — 별도 비용 카드 없음) */}
          <div className="flex min-h-0 flex-col">
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
                pulseKey={coinFlightEvent?.id ?? 0}
                coinCount={coinFlightEvent?.coinCount ?? 0}
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
      </div>

      {/* 상점 팝업 (전체 화면 오버레이 — 열렸을 때만 렌더) */}
      <ShopModal open={shopOpen} onClose={closeShop} />
    </div>
  )
}
