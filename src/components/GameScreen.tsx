import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { dataManager } from '../data/DataManager'
import { useActionHotkeys } from '../hooks/useActionHotkeys'
import { useEnhanceHotkey } from '../hooks/useEnhanceHotkey'
import { useT, type TranslationKey } from '../i18n'
import { countOf, PROTECTION_TICKET_ID } from '../lib/items'
import { sound } from '../lib/sound'
import { swordSpriteUrl } from '../lib/sprites'
import { useEffectStore } from '../store/effectStore'
import { latestRunning, runningEventsOf, type Effect } from '../store/effectQueue'
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
import { ItemFlight, ITEM_FLIGHT_MS, type ItemFlightEvent } from './ItemFlight'
import {
  HammerStrike,
  HAMMER_STRIKE_MS,
  HAMMER_IMPACT_MS,
  type HammerStrikeEvent,
} from './HammerStrike'
import { EnhanceButton } from './EnhanceButton'
import {
  FloatingTextEffect,
  type FloatingTextEvent,
} from './FloatingTextEffect'
import { pickFloatingText } from './floatingText'
import { GoldGainText, type GoldGainEvent } from './GoldGainText'
import { InventoryPanel } from './InventoryPanel'
import { particleCount } from './particles'
import { protectionState, isProtectionActive } from './protection'
import { SellButton } from './SellButton'
import { StoreButton } from './StoreButton'
import { SHAKE_SEC } from './shake'
import { ShopModal } from './ShopModal'
import { GameClearModal } from './GameClearModal'
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

// 실행 중 버스트 효과(성공·파괴)를 연출 이벤트로 투영한다 — 같은 kind 를 전부 뽑아(runningEventsOf:
// 겹친 옛 버스트 유실 방지) {id, spriteUrl, particleCount} 로 매핑한다. spriteUrl 없는 효과(자리만 있는
// 잠금 등)는 제외(빈 배열). 성공·파괴가 동일 형태라 한 곳에서 만든다 — 두 memo 의 중복을 없애 payload
// 필드를 늘려도 한쪽만 고쳐 어긋나는 일이 없게 한다.
function toBurstEvents(
  running: Effect[],
  kind: string,
): { id: number; spriteUrl: string; particleCount: number }[] {
  return runningEventsOf(running, kind).flatMap((e) =>
    e.payload?.spriteUrl
      ? [
          {
            id: e.id,
            spriteUrl: e.payload.spriteUrl,
            particleCount: e.payload.particleCount ?? 0,
          },
        ]
      : [],
  )
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

  // 보호 결계 상태(보호불가/부족/대기/발동) — 흩어진 조건 대신 순수 코어 한 곳에서 계산한다.
  // 검이 없으면 'disabled'(이 단계 보호 불가)로 본다. 실제 강화 적용 여부는 armed 일 때만.
  const ownedTickets = countOf(items, PROTECTION_TICKET_ID)
  const protection = protectionState(
    sword ? sword.protectionTickets : 'disabled',
    ownedTickets,
    protectionArmed,
  )
  const effectiveProtection = isProtectionActive(protection)
  const canEnhance = canEnhanceFn(effectiveProtection)
  const canSell = canSellFn()
  const canStore = canStoreFn()

  // 강화 쿨다운(연출 잠금) 중인지 — 강화 직후 enhanceDelayMs 동안 lockCount>0 이다.
  const enhanceLocked = lockCount > 0
  // 스페이스 단축키 게이트 — 꾹 누름 연사 박자가 이 잠금에 묶여 있으므로(useEnhanceHotkey) 잠금을 포함해 둔다.
  // 버튼은 잠금 동안 '비활성(흐림)'이 아니라 쿨다운 오버레이로 표현하므로, 아래에서 disabled={!canEnhance} 로
  // 따로 게이팅한다(클릭은 handleEnhance 의 잠금 가드가 막는다).
  const enhanceDisabled = !canEnhance || enhanceLocked

  // 상점 팝업 열림 상태.
  const [shopOpen, setShopOpen] = useState(false)
  const openShop = useCallback(() => setShopOpen(true), [])
  const closeShop = useCallback(() => setShopOpen(false), [])

  // 게임 클리어(승리) — 최종 검(다음 단계 없음)에 도달하면 축하 모달을 띄운다.
  const [cleared, setCleared] = useState(false)

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

  // 의뢰 아이템 보상 연출 — 골드(코인 비행)와 달리 보상이 아이템(물물교환)이면 클릭한 카드에서
  // 보상 아이템이 인벤토리로 빨려 들어간다. 코인 연출과 동형(카드 rect 를 고정 anchor 로 캡처해
  // 카드가 사라진 뒤에도 출발 좌표 유지). 출발=카드 anchor, 도착=인벤토리(아래 inventoryRef).
  const [commissionItem, setCommissionItem] = useState<{
    id: number
    rect: DOMRect
    itemId: string
  } | null>(null)
  const commissionItemAnchorRef = useRef<HTMLDivElement>(null)
  const commissionItemKey = useRef(0)

  // 골드창 상승 연출(통통통 + 숫자 카운트업)은 GoldDisplay 의 pulseKey 변화로만 구동된다.
  // 판매와 의뢰 완료가 공유하는 단일 펄스 — 둘 다 골드를 늘리므로 같은 카운터를 올린다.
  // (코인 비행 자체는 출발점이 달라 각자 다른 CoinFlight 인스턴스로 그리지만, 골드 상승은 한 경로로 모은다.)
  const [goldPulse, setGoldPulse] = useState<{ key: number; count: number }>({
    key: 0,
    count: 0,
  })

  // 골드 획득 플로팅 텍스트("+금액") — 판매·의뢰완료가 공유하는 단일 연출. 검 박스 위에 황금색으로
  // 떠오르며, 글자 크기는 획득 골드가 많을수록 커진다(goldTextSize). id 단조 증가로 연타도 재생된다.
  const [goldGain, setGoldGain] = useState<GoldGainEvent | null>(null)
  const goldGainKey = useRef(0)
  const showGoldGain = useCallback((amount: number) => {
    goldGainKey.current += 1
    setGoldGain({ id: goldGainKey.current, amount })
  }, [])

  // 판매가 강조(pop) 트리거 — 강화 성공으로 검 가치(sellPrice)가 오른 순간에만 올린다(아래 handleEnhance
  // 성공 분기). SwordStage 가 shakeKey 와 같은 방식으로 소비해 가격 표시를 한 번 통 튀게 한다. 보관·장착·
  // 판매로 currentSwordId(→가격)가 바뀔 때는 이 분기를 타지 않으므로 pop 이 터지지 않는다.
  const [pricePopKey, setPricePopKey] = useState(0)

  // 강화 결과 플로팅 텍스트("아이구!..." 등) — 데이터(floatingText.json) 기반. 강화 결과(성공/실패/방지)를
  // 이벤트 키로 매핑해 후보 한 줄을 뽑아 검 중상단에 띄운다. id 단조 증가로 연타도 교체 재생되며, 빈
  // 슬롯(미설정 문구)이면 null 이라 아무것도 안 뜬다.
  const [floatingText, setFloatingText] = useState<FloatingTextEvent | null>(
    null,
  )
  const floatTextKey = useRef(0)

  // originEl 은 코인 비행의 "출발점"(연출 전용·선택)이다 — 납품(검 소모·보상·생명주기)은 store 가 소유하며
  // 엘리먼트 유무와 무관하게 진행된다. 연출 엘리먼트에 게임 액션을 묶지 않는다(키보드 납품이 막히던 버그의 근본 차단).
  const handleFulfill = (commission: Commission, originEl: HTMLElement | null) => {
    // 생명주기·검 소모는 store 가 소유 — 수락(true)일 때만 연출을 띄운다.
    if (!useCommissionStore.getState().fulfill(commission.id)) return
    // 보상 획득 '짤랑' 효과음 — 판매와 동일(검·재료를 내주고 보상을 받는 순간).
    sound.playSfx('item_sold')
    // 골드 보상일 때만 코인 비행·골드 펄스·획득 텍스트 연출. 아이템 보상(물물교환)은 인벤토리로
    // 들어가므로 골드 연출을 띄우지 않는다(reward.kind 로 분기 — reward 는 Material).
    if (commission.reward.kind === 'gold') {
      const amount = commission.reward.amount
      // 출발점을 못 받았으면 코인 비행만 생략한다(골드 펄스·획득 텍스트는 그대로). rect 는 언마운트 전(동기)에 읽어 유효.
      if (originEl) {
        commissionCoinKey.current += 1
        setCommissionCoin({
          id: commissionCoinKey.current,
          rect: originEl.getBoundingClientRect(),
          coinCount: coinCount(amount),
        })
      }
      setGoldPulse((p) => ({ key: p.key + 1, count: coinCount(amount) }))
      showGoldGain(amount)
    } else if (commission.reward.kind === 'item' && originEl) {
      // 아이템 보상 — 클릭한 카드에서 보상 아이템이 인벤토리로 빨려 들어가는 연출(코인과 동형 anchor).
      // 실제 지급은 fulfill 이 이미 끝냈다(연출은 순수 부가). rect 는 언마운트 전(동기)에 읽어 유효.
      commissionItemKey.current += 1
      setCommissionItem({
        id: commissionItemKey.current,
        rect: originEl.getBoundingClientRect(),
        itemId: commission.reward.itemId,
      })
    }
  }

  const handleSell = () => {
    const price = sell()
    if (price === null || price <= 0) return
    // 판매 성사 '차칭' 효과음 — 판매한 순간 1회(코인 착지음 coin_pickup 은 연출 중 코인마다 별도로 울린다).
    sound.playSfx('item_sold')
    // 판매 = 검에서 코인이 뿜어져 골드창으로 빨려 들어가는 연출(잠금 없음·병렬). 코인 수는 판매가에 비례.
    enqueueEffect({
      kind: 'coinFlight',
      exclusive: false,
      locksEnhance: false,
      durationMs: COIN_FLIGHT_MS,
      payload: { coinCount: coinCount(price) },
    })
    setGoldPulse((p) => ({ key: p.key + 1, count: coinCount(price) }))
    showGoldGain(price)
  }

  // 검이 검 박스에서 인벤토리로 빨려 들어가는 연출(보관·장착 공용·병렬·비잠금). 코인 비행과 동일하게
  // Effect 시스템으로 구동한다 — 어떤 검이 나는지는 itemId(= 나가는 검의 sword id)로 전한다.
  const enqueueItemFlight = (itemId: string) =>
    enqueueEffect({
      kind: 'itemFlight',
      exclusive: false,
      locksEnhance: false,
      durationMs: ITEM_FLIGHT_MS,
      payload: { itemId },
    })

  // 보관 — 현재 검을 가방으로. 나가는 검(변이 전 currentSwordId)을 캡처해 비행 연출을 띄운다.
  const handleStore = () => {
    if (!canStore) return // store() 와 동일 게이트(시작 검·검 없음이면 보관할 게 없음)
    const outgoing = currentSwordId
    store()
    if (outgoing) enqueueItemFlight(outgoing)
  }

  // 장착 — 가방의 검을 끼우면 현재 검이 가방으로 옮겨진다(equip → bankOutgoing). 그 나가는 검도
  // 인벤토리로 빨려 드는 연출을 띄운다. 단, 시작 검(sword_0)은 가방에 들어가지 않고 버려지므로 제외.
  const handleEquip = (itemId: string) => {
    const outgoing = canStore ? currentSwordId : null
    equip(itemId)
    if (outgoing) enqueueItemFlight(outgoing)
  }

  const handleEnhance = () => {
    // 쿨다운(강화 딜레이) 중 들어온 강화는 무시한다 — 버튼이 더 이상 disabled 가 아니라(클릭/Enter 가능)
    // 쿨다운 오버레이만 덮으므로, 이 가드로 '쿨다운 중 단발 입력'을 no-op 으로 만든다.
    // (연타 throttle 자체는 강화 잠금 lockCount(~600ms)와 hold 연사의 min-gap(400ms)이 책임진다 — 이
    //  가드는 그 이중 발사 방지턱이 아니라 쿨다운 중 단발 활성화 차단이다. hold 는 useHoldRepeat 가 동일 게이팅.)
    if (enhanceLocked) return
    const result = enhance(effectiveProtection)
    if (!result) return

    // 강화 '캉!' 타격음 — 결과(성공·파괴·방지)와 무관하게 한 번 재생. 망치가 검에 닿는 순간(HAMMER_IMPACT_MS,
    // 분출 직전)에 맞춰 미뤄, 화면에서 내리꽂는 순간 울리도록 한다(버튼·스페이스 공통 경로).
    sound.playSfx('enhance', { delayMs: HAMMER_IMPACT_MS })

    // 망치 내려치기 연출 — 결과와 무관하게 강화 시도마다 검 위로 호라드릭 망치가 내리꽂힌다(잠금X·병렬).
    // 잠금은 아래 enhanceLock 가 전담하고, 이 효과는 순수 시각(임팩트가 분출 직전에 맞물려 친다→터진다).
    enqueueEffect({
      kind: 'hammerStrike',
      exclusive: false,
      locksEnhance: false,
      durationMs: HAMMER_STRIKE_MS,
    })

    // 강화 결과 플로팅 텍스트(데이터 기반) — 결과를 이벤트 키로 매핑해 후보 한 줄을 뽑아 검 중상단에
    // 띄운다. 빈 슬롯(미설정)이면 null → 미표시. 분기보다 앞에 둬 어느 분기가 빠져도 안전하며, 화면
    // 등장 타이밍은 연출 컴포넌트의 delay(결과 분출 박자)가 맞춘다.
    const floatEventKey =
      result.outcome === 'success'
        ? 'enhanceSuccess'
        : result.outcome === 'protected'
          ? 'enhanceProtected'
          : 'enhanceFail' // 'destroyed' → 실패(네이밍 브릿지)
    const pickedTextKey = pickFloatingText(
      dataManager.getFloatingTexts(floatEventKey),
    )
    if (pickedTextKey) {
      floatTextKey.current += 1
      setFloatingText({ id: floatTextKey.current, textKey: pickedTextKey })
    }

    // 강화 버튼 잠금(연타 딜레이)은 성공·파괴·방지 공통 — 연출과 별개의 병렬 효과(lockCount). 길이는
    // 데이터(config.enhanceDelayMs)에서 읽어 떨림(SHAKE_SEC) 연출과 독립적으로 조절한다.
    const lockEnhance = () =>
      enqueueEffect({
        kind: 'enhanceLock',
        exclusive: false,
        locksEnhance: true,
        durationMs: dataManager.getConfig().enhanceDelayMs,
      })

    if (result.outcome === 'success') {
      // 성공 = (실패와 동일 안무) 떨림 → 황금 파티클 분출 + 상위 검 등장(잠금X) ∥ 강화 버튼 잠금(강화 딜레이).
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
        // 잠금 해제(강화 딜레이) 후 재강화로 마운트되는 새 검이 잘못 지연돼 사라지지 않도록 연출 전체가 아닌 0.4s만.
        enqueueEffect({
          kind: 'entranceSuppress',
          exclusive: false,
          locksEnhance: false,
          durationMs: SHAKE_SEC * 1000,
        })
      }
      // 가치 상승 강조 — 도달 검(toId)이 강화 전(fromId)보다 비싸면 가격 표시를 한 번 통 튀게 한다.
      // "강화 성공으로 올랐다"는 사실은 이 분기에만 있으므로 여기서 트리거한다(장착·판매와 구분).
      if (
        next &&
        from &&
        next.sellPrice !== null &&
        from.sellPrice !== null &&
        next.sellPrice > from.sellPrice
      ) {
        setPricePopKey((k) => k + 1)
      }
      lockEnhance()
      // 최종 검(다음 단계 없음)에 도달하면 게임 클리어. id 하드코딩 대신 nextId === null 로 판별해
      // 최고 단계가 바뀌어도 자동 동작한다. 성공 분출 연출과 함께 축하 모달을 띄운다.
      if (next && next.nextId === null) setCleared(true)
    } else if (result.outcome === 'destroyed') {
      // 파괴 폭발 효과음 — 떨림(0.4s)이 끝나 폭발이 터지는 순간에 맞춰 울린다('캉!' 직후가 아닌 분출 시점).
      sound.playSfx('enchant_destroyed', { delayMs: SHAKE_SEC * 1000 })
      // 파괴 = 폭발 연출(잠금X·~1초) ∥ 강화 버튼 잠금(강화 딜레이). 파티클 수는 파괴된 검(fromId)의 단계에 비례.
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
        // 그래야 잠금 해제(강화 딜레이) 후 +0 을 재강화해 성공해도 새 검이 0.4s 사라지지 않는다.
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
      // 방지 = 떨림만(폭발 없음) → 파괴보호장치 덕분에 살아남았음을 인지시킨다.
      enqueueEffect({
        kind: 'protectedShake',
        exclusive: false,
        locksEnhance: false,
        durationMs: SHAKE_SEC * 1000,
      })
      // 강화 버튼 잠금(강화 딜레이)은 성공·파괴와 동일하게 건다 — 마우스·스페이스 모두 강화 딜레이가 일관되도록.
      lockEnhance()
    }
  }

  // 데스크탑에서 스페이스바 = 강화(상점이 닫혀 있을 때만, 강화 버튼과 동일한 게이트를 따른다).
  useEnhanceHotkey({
    enabled: !shopOpen,
    disabled: enhanceDisabled,
    onEnhance: handleEnhance,
  })

  // 데스크탑 액션 단축키: Ctrl 탭 = 판매, Alt 탭 = 보관(단독 탭만 — 조합키 오발 방지), S = 상점 열기.
  // 상점이 닫혀 있을 때만 부착한다(모달 내부 입력 보존). 판매·보관 가능 여부는 핸들러가 self-gate.
  useActionHotkeys({
    enabled: !shopOpen,
    onSell: handleSell,
    onStore: handleStore,
    onOpenShop: openShop,
  })

  // 연출 트리거는 effectStore 의 running 에서 뽑는다(생명주기·타이밍은 Effect 시스템이 소유). 대부분은
  // "가장 최근" 1개만(latestRunning — 겹친 새 효과 유실 방지)이지만, 성공·파괴 버스트는 running 의 해당
  // 효과를 전부 렌더한다(toBurstEvents) — 연출 중 재강화해도 옛 버스트가 잘리지 않고 끝까지 터지도록
  // (파티클은 떨림 0.4s 뒤에 나오는데, 잠금 해제 직후 재강화하면 최신 1개만 그릴 경우 버스트가 매번
  // 리셋돼 안 나온다). 동시 개수는 잠금(config.enhanceDelayMs)이 버스트(~1s)보다 짧아 보통 ~2~3개로
  // 바운드되지만, 잠금을 버스트보다 훨씬 짧게(권장 하한 ~400ms 미만) 두면 마우스 연타로 더 누적될 수 있다.
  // 주의: flatMap 이 running 변경마다 새 이벤트 객체를 만들어 각 연출의 useOneShot 백스톱 타이머가 매번
  // 리셋되지만 무해하다 — 실제 unmount 는 effectStore 의 _finish(durationMs)가 소유하고 백스톱은 보조다.
  const destructionEvents = useMemo<DestructionEvent[]>(
    () => toBurstEvents(running, 'destruction'),
    [running],
  )
  const successEvents = useMemo<SuccessEvent[]>(
    () => toBurstEvents(running, 'successBurst'),
    [running],
  )
  const coinFlightEvent = useMemo<CoinFlightEvent | null>(() => {
    const fx = latestRunning(running, 'coinFlight')
    return fx ? { id: fx.id, coinCount: fx.payload?.coinCount ?? 0 } : null
  }, [running])
  const itemFlightEvent = useMemo<ItemFlightEvent | null>(() => {
    const fx = latestRunning(running, 'itemFlight')
    return fx?.payload?.itemId ? { id: fx.id, itemId: fx.payload.itemId } : null
  }, [running])
  const hammerStrikeEvent = useMemo<HammerStrikeEvent | null>(() => {
    const fx = latestRunning(running, 'hammerStrike')
    return fx ? { id: fx.id } : null
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

  // lg+(데스크탑)에선 바깥 패딩을 없애 카드가 브라우저를 꽉 채우게 한다 — 베젤(검정) 여백 제거.
  // <lg(세로형)에선 베젤 프레임을 유지한다.
  return (
    <div className="flex min-h-svh items-center justify-center overflow-x-hidden overflow-y-auto bg-bezel p-3 sm:p-6 lg:p-0">
      {/* lg+(데스크탑): 레이아웃은 고정 비율(좌 16rem · 가운데 28rem · 우 16rem)이며, 화면이 커지면
          루트 font-size 가 커져(아래 index.css clamp) rem 기반 UI 전체가 통째로 균일하게 스케일된다
          (가운데만 비어 보이던 1fr 제거 → 빈 공간이 비례적으로 늘지 않음). 컬럼 트랙은 justify-center 로
          가운데 정렬하고, bg-stage 가 화면 전체를 덮어 양옆 여백도 베이지(검정 없음). 미디어쿼리(lg)는
          초기 16px 기준이라 스케일과 무관하게 1024px 에서 고정 — <lg 는 세로 단일 컬럼(16px). */}
      <div className="relative flex w-full flex-col rounded-2xl border border-stage-edge bg-stage p-4 shadow-2xl sm:p-5 lg:min-h-svh lg:rounded-none lg:border-0 lg:px-0">
        {/* 상단 컨트롤은 아래 메인 그리드와 같은 폭으로 가운데 정렬한다. 그리드는 full-width 안에서
            lg:grid-cols-[16rem_28rem_16rem] + gap-4(0.25rem×4=1rem, 갭 2개) = 62rem 만 justify-center 로
            가운데에 쓰는데, TopControls 만 full-width 라 상단바가 좌우로 더 넓게 튀어나와 보였다(불일치).
            여기서 같은 62rem 밴드(mx-auto)로 묶어 언어토글·게이지·상점 줄이 인벤토리/강화 패널의 좌우 끝과
            정렬되게 한다. bg-stage(베이지)는 바깥 div 가 계속 full-width 로 깐다. 62rem 은 위 그리드 컬럼
            합과 동기화할 것 — 컬럼/갭을 바꾸면 이 값도 함께 고친다. <lg(세로형)은 그대로 full-width. */}
        <div className="lg:mx-auto lg:w-full lg:max-w-[62rem]">
          <TopControls onOpenShop={openShop} />
        </div>

        {/* 상단 거래 제안 바 — 요구 검을 보유했을 때 클릭하면 검을 넘기고 보상(판매가+인센티브)을 받는다. */}
        <CommissionBar onFulfill={handleFulfill} hotkeysEnabled={!shopOpen} />

        {/* 좁은 화면(<lg)은 단일 컬럼으로 세로 스택 — 3열은 고정폭 검 스테이지(검 박스 240·이름 배너 320)가
            들어갈 만큼 넓을 때만 쓴다. sm(640) 기준이면 640~1024 구간에서 가운데 트랙이 눌려 좌우 패널과
            겹치므로, 전환 기준을 lg(1024)로 둔다(성공률을 검 오른쪽으로 옮기는 lg 기준과도 일치). */}
        <div className="mt-3 grid grid-cols-1 gap-4 lg:my-auto lg:min-h-[34rem] lg:justify-center lg:grid-cols-[16rem_28rem_16rem]">
          {/* 좌: 인벤토리(강화비용·판매가는 우측 버튼으로 통합 — 별도 비용 카드 없음).
              세로형(<lg)에선 강화 버튼처럼 컬럼 폭을 꽉 채우고, lg+(3열)에선 컬럼을 채운다. */}
          <div className="flex w-full min-h-0 flex-col lg:justify-center">
            {/* ref: 파괴 드롭이 빨려 들어갈 도착점 측정용 — 패널을 감싸 드롭이 보이는 인벤토리로 들어가게 한다.
                lg+(데스크탑)에선 컬럼 높이에서 세로 중앙 정렬(고정 높이 박스, 꽉 채우지 않음). */}
            <div ref={inventoryRef}>
              <InventoryPanel
                sword={sword}
                level={sword?.level ?? null}
                items={items}
                onEquip={handleEquip}
                gold={gold}
                goldPulseKey={goldPulse.key}
                goldCoinCount={goldPulse.count}
                goldRef={goldRef}
              />
            </div>
          </div>

          {/* 중앙: 검 스테이지 + 결과 연출(오버레이). 고정폭 28rem 트랙이라 검 주위 여백은 트랙이 제공. */}
          <div className="relative flex items-center justify-center">
            <SwordStage
              sword={sword}
              level={sword?.level ?? null}
              // 보호 결계: 순수 상태 + 토글(발동)·상점(부족 보충)·플레어(방지 발동) 트리거.
              // blockKey 는 protectedShake 와 같은 트리거(shakeKey)를 공유 — 막아낸 순간 결계가 번쩍인다.
              protection={{
                state: protection,
                onToggle: toggleProtection,
                onShop: openShop,
                blockKey: shakeKey,
              }}
              spriteOverlay={
                <>
                  {/* 성공·파괴 버스트는 동시에 여러 개가 떠 있을 수 있다(재강화 시 옛 버스트 유지) —
                      각 효과를 id 로 키잉해 독립 재생한다. */}
                  {destructionEvents.map((ev) => (
                    <DestructionEffect key={ev.id} event={ev} />
                  ))}
                  {successEvents.map((ev) => (
                    <SuccessEffect key={ev.id} event={ev} />
                  ))}
                  {/* 망치는 결과 연출 위(전면)에 그려 내려치는 순간이 가려지지 않게 한다(맨 뒤 렌더). */}
                  <HammerStrike event={hammerStrikeEvent} />
                  {/* 결과 텍스트("아이구!...")는 망치·결과 연출 위 최전면에 띄운다. */}
                  <FloatingTextEffect event={floatingText} />
                </>
              }
              // 새 검 등장 지연은 "떨림 구간"에만(entranceSuppress 효과의 수명 = 0.4s) — 파괴 연출
              // 전체가 아니라. 그래야 연출 도중 재강화로 마운트되는 새 검이 잘못 지연돼 사라지지 않는다.
              entranceDelay={
                latestRunning(running, 'entranceSuppress') ? SHAKE_SEC : 0
              }
              // 방지 시 실제 검을 떨게 한다(파괴와 구분 — 폭발 없이 떨림만).
              shakeKey={shakeKey}
              // 강화 성공으로 가치(판매가)가 오른 순간 가격 표시를 한 번 통 튀게 한다.
              pricePopKey={pricePopKey}
              // 판매 코인이 뿜어져 나올 출발점(검 박스) 측정용.
              swordBoxRef={swordBoxRef}
            />
            {/* 골드 획득 텍스트("+금액") — 검 박스 위로 떠오르는 황금색 연출(SwordStage 위에 그려 전면 표시).
                판매·의뢰완료 공유. 출발점은 항상 검 박스(swordBoxRef) — "장착 무기가 있던 위치". */}
            <GoldGainText event={goldGain} anchorRef={swordBoxRef} />
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

          {/* 우: 강화 카드(비용 포함) + 판매 버튼 + 보관 버튼(세로 중앙). 판매가는 검 스테이지에 금색으로 표시.
              보유 골드는 좌측 인벤토리 패널의 별도 섹션으로 옮겼다(화폐 분리). */}
          <div className="flex flex-col items-center justify-center">
            {/* 액션 패널 = 인벤토리 패널과 동일 크기. 폭은 컬럼(16rem)으로 이미 같고, 높이는 인벤토리
                패널 높이(헤더+골드+목록 17.25rem+패딩 = 23.375rem)에 맞춘다. lg+ 에선 그 높이의 3행
                그리드(강화 2 : 판매 1 : 보관 1)로 버튼이 행을 채운다(items-stretch). 세로형(<lg)은
                콘텐츠 높이의 일반 flex 스택. (인벤토리 목록 높이를 바꾸면 이 23.375rem 도 같이 고칠 것.) */}
            <div className="flex w-full flex-col items-center gap-3 lg:grid lg:h-[23.375rem] lg:grid-rows-[2fr_1fr_1fr] lg:items-stretch">
              <EnhanceButton
                disabled={!canEnhance}
                charging={enhanceLocked}
                chargeMs={dataManager.getConfig().enhanceDelayMs}
                onEnhance={handleEnhance}
                enhanceCost={sword?.enhanceCost ?? null}
              />
              <SellButton disabled={!canSell} onSell={handleSell} />
              <StoreButton disabled={!canStore} onStore={handleStore} />
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

        {/* 보관·장착 연출 — 검 박스에서 검 아이콘이 인벤토리로 빨려 들어간다(스테이지 검 크기로 이륙). */}
        <ItemFlight
          event={itemFlightEvent}
          sourceRef={swordBoxRef}
          targetRef={inventoryRef}
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

        {/* 의뢰 아이템 보상 연출 — 출발점은 클릭한 의뢰 카드(fixed anchor 로 고정), 도착점은 인벤토리.
            보상 아이템 아이콘이 카드에서 가방으로 빨려 든다(코인 비행과 동형, 작은 크기로 이륙). */}
        {commissionItem && (
          <div
            ref={commissionItemAnchorRef}
            aria-hidden
            className="pointer-events-none fixed"
            style={{
              left: commissionItem.rect.left + commissionItem.rect.width / 2,
              top: commissionItem.rect.top + commissionItem.rect.height / 2,
              width: 0,
              height: 0,
            }}
          />
        )}
        <ItemFlight
          event={
            commissionItem
              ? { id: commissionItem.id, itemId: commissionItem.itemId }
              : null
          }
          sourceRef={commissionItemAnchorRef}
          targetRef={inventoryRef}
          startSizeClass="h-12 w-12"
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
      <GameClearModal open={cleared} onClose={() => setCleared(false)} />
    </div>
  )
}
