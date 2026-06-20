import { useCallback, useMemo, useRef, useState, type RefObject } from 'react'
import { dataManager } from '../data/DataManager'
import type { ItemCost } from '../data/types'
import { useActionHotkeys } from '../hooks/useActionHotkeys'
import { useEnhanceHotkey } from '../hooks/useEnhanceHotkey'
import { useStableCallback } from '../hooks/useStableCallback'
import { useT } from '../i18n'
import { countOf, PROTECTION_TICKET_ID } from '../lib/items'
import { sound } from '../lib/sound'
import { useEffectStore } from '../store/effectStore'
import { useGameStore } from '../store/gameStore'
import { useResultStore } from '../store/resultStore'
import { useCommissionStore } from '../store/commissionStore'
import type { Commission } from '../store/commissionQueue'
import { useUiStore } from '../store/uiStore'
import { CommissionBar } from './CommissionBar'
import { destructionTargetOf } from './destruction'
import { coinCount } from './coins'
import { CoinFlight, COIN_FLIGHT_MS } from './CoinFlight'
import { dropAppearSec, dropLifetimeMs } from './drops'
import { ItemFlight, ITEM_FLIGHT_MS } from './ItemFlight'
import { hammerStrikeMs, type HammerShape } from './hammerTiming'
import { computeEnhanceTimeline } from './enhanceTimeline'
import { EnhanceButton } from './EnhanceButton'
import { pickFloatingText } from './floatingText'
import type { GoldGainEvent } from './GoldGainText'
import { InventoryPanel } from './InventoryPanel'
import { particleCount } from './particles'
import { protectionState, isProtectionActive } from './protection'
import { ActionButton } from './ActionButton'
import { ShopModal } from './ShopModal'
import { GameClearModal } from './GameClearModal'
import { TopControls } from './TopControls'
import { CenterStage } from './CenterStage'
import { CardOverlays } from './CardOverlays'

// enchantCostItems 의 기본 빈 배열 — 매 렌더 새 [](`?? []`)를 만들면 EnhanceButton 의 memo 가 깨진다.
const EMPTY_ITEM_COSTS: readonly ItemCost[] = []

// 클릭 순간 캡처한 카드 rect 를 고정해 두는 보이지 않는 비행 출발 anchor(영점 크기·클릭 통과).
// 의뢰 완료의 코인·아이템 보상 연출이 공유한다 — 카드가 active 에서 빠져 사라진 뒤에도
// 출발 좌표가 유효하다(언마운트 타이밍에 의존하지 않음).
function FlightAnchor({
  rect,
  anchorRef,
}: {
  rect: DOMRect
  anchorRef: RefObject<HTMLDivElement | null>
}) {
  return (
    <div
      ref={anchorRef}
      aria-hidden
      className="pointer-events-none fixed"
      style={{
        left: rect.left + rect.width / 2,
        top: rect.top + rect.height / 2,
        width: 0,
        height: 0,
      }}
    />
  )
}

// 메인 강화 화면. 레퍼런스 레이아웃을 따른 가로 스테이지:
//   상단(언어·난이도 / 상점·닫기) · 좌(비용카드·인벤토리) · 중앙(검 스테이지) · 우(강화·골드).
// 강화 1회 결과는 연출(성공=떨림 후 황금 파티클 / 파괴=떨림 후 폭발 / 방지=떨림)로 보여 주고,
// 결과 문구는 화면에 보이지 않는 sr-only 라이브 리전으로 음성 전달한다.
export function GameScreen() {
  const t = useT()
  // 골드도 구독한다(값은 쓰지 않고 void — 아래) — 보유 골드가 비용 경계를 넘는 순간 강화 버튼 게이팅
  // (canEnhance)이 갱신되도록 재렌더만 유발한다(CommissionBar 와 동일 idiom). 골드 '값' 표시는 GoldDisplay
  // 가 store 를 직접 구독하므로, GameScreen 이 골드에 재렌더돼도 InventoryPanel(gold prop 제거)·CenterStage·
  // CardOverlays 는 memo 로 bail 한다 — 골드 차감만으로 무거운 트리가 재조정되지 않는다.
  const gold = useGameStore((s) => s.gold)
  void gold
  const currentSwordId = useGameStore((s) => s.currentSwordId)
  const items = useGameStore((s) => s.items)
  const enhance = useGameStore((s) => s.enhance)
  const canEnhanceFn = useGameStore((s) => s.canEnhance)
  const sell = useGameStore((s) => s.sell)
  const canSellFn = useGameStore((s) => s.canSell)
  const store = useGameStore((s) => s.store)
  const equip = useGameStore((s) => s.equip)
  const canStoreFn = useGameStore((s) => s.canStore)
  // (collectDrop·flushDrops 는 CardOverlays 가 직접 구독한다 — 드롭 연출이 그쪽으로 이관됐다.)

  const protectionArmed = useUiStore((s) => s.protectionArmed)
  const toggleProtection = useUiStore((s) => s.toggleProtection)

  // 연출(Effect) 시스템 — 강화 버튼 잠금은 lockCount(>0이면 잠금). running(효과 트리거) 자체는 더 이상
  // GameScreen 이 구독하지 않는다 — 검 스테이지·오버레이로 흘러가던 running 파생 일체를 CenterStage·
  // CardOverlays(자기 자신이 running 을 kind 별로 좁혀 구독하는 memo 자식)로 옮겼다. 덕분에 연출 전이(망치·
  // 버스트·드롭·비행 등 다수)가 GameScreen 을 커밋시키지 않고, GameScreen 의 gold·lockCount·items 커밋도
  // 무거운 연출 서브트리를 재조정하지 않는다("검 변경 리렌더 폭풍"의 양방향 결합을 끊는다).
  const enqueueEffect = useEffectStore((s) => s.enqueueEffect)
  const lockCount = useEffectStore((s) => s.lockCount)

  const sword =
    currentSwordId !== null
      ? dataManager.getSwordById(currentSwordId)
      : undefined

  // 강화 연출 타이밍(망치 임팩트·모양·재강화 가드) — 데이터(animation.json)에서 1회 읽어 매 강화의
  // 타임라인과 임팩트 의존 props(망치·Hit 불꽃·보호 플레어)에 쓴다. load 이후라 안전(컴포넌트는 적재 후 렌더).
  // anim 과 hammerShape 를 여기 한 곳에서 만들어 모든 소비처(타임라인·플레어·불꽃·망치·잠금·방지 떨림)에
  // 흘려 crossover 불일치를 차단한다. hammerShape 는 데이터의 망치 모양 필드에서 파생한다.
  const anim = useMemo(() => dataManager.getAnimation(), [])
  // 모양 객체는 고정(useMemo) — 매 렌더 새 객체를 만들면 HammerStrike 가 강화 연사 리렌더마다
  // 새 props 를 받는다(파생 데이터는 불변이므로 참조도 고정한다).
  const hammerShape: HammerShape = useMemo(
    () => ({
      snapSec: anim.hammerSnapMs / 1000,
      holdAfterSec: anim.hammerHoldAfterMs / 1000,
      fadeoutSec: anim.hammerFadeoutMs / 1000,
    }),
    [anim],
  )

  // (검 스프라이트 프리로드는 SpriteStore 가 시작 시 전량 GPU 풀링하므로 여기서 따로 하지 않는다 — main.tsx 참고.)

  // 보호 결계 상태(보호불가/부족/대기/발동) — 흩어진 조건 대신 순수 코어 한 곳에서 계산한다.
  // 검이 없으면 'disabled'(이 단계 보호 불가)로 본다. 실제 강화 적용 여부는 armed 일 때만.
  const ownedTickets = countOf(items, PROTECTION_TICKET_ID)
  const protection = useMemo(
    () =>
      protectionState(
        sword ? sword.protectionTickets : 'disabled',
        ownedTickets,
        protectionArmed,
      ),
    [sword, ownedTickets, protectionArmed],
  )
  const effectiveProtection = isProtectionActive(protection)
  // 강화 가능 여부는 store 의 현재 골드·아이템·검으로 판정한다(canEnhanceFn 이 내부에서 읽음). 위 gold/items
  // 구독이 그 변화에 GameScreen 을 재렌더해 이 값을 최신으로 재계산한다 → 버튼 게이팅 갱신.
  const canEnhance = canEnhanceFn(effectiveProtection)
  const canSell = canSellFn()
  const canStore = canStoreFn()

  // 강화 쿨다운(연출 잠금) 중인지 — 강화 직후 타임라인 lockMs(= 떨림 끝 + 재강화 가드) 동안 lockCount>0 이다.
  const enhanceLocked = lockCount > 0
  // 스페이스 단축키 게이트 — 꾹 누름 연사 박자가 이 잠금에 묶여 있으므로(useEnhanceHotkey) 잠금을 포함해 둔다.
  // 버튼은 잠금 동안 '비활성(흐림)'이 아니라 쿨다운 오버레이로 표현하므로, 아래에서 disabled={!canEnhance} 로
  // 따로 게이팅한다(클릭은 handleEnhance 의 잠금 가드가 막는다).
  const enhanceDisabled = !canEnhance || enhanceLocked

  // 상점 팝업 열림 상태.
  const [shopOpen, setShopOpen] = useState(false)
  const openShop = useCallback(() => setShopOpen(true), [])
  const closeShop = useCallback(() => setShopOpen(false), [])

  // 게임 클리어(승리) — 최종 검(다음 단계 없음)에 도달하면 축하 모달을 띄운다. reveal 시점에 resultStore
  // 가 켠다(가격강조·이름공개와 같은 박자) → 여기선 좁혀 구독해 모달만 띄운다.
  const cleared = useResultStore((s) => s.cleared)

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

  // 직전 강화의 재강화 잠금 길이(ms) — 매 강화마다 떨림 길이에 따라 다르므로 버튼 충전 오버레이가 같은
  // 길이로 걷히도록 보관한다(handleEnhance 가 타임라인 lockMs 로 갱신). 첫 강화 전엔 결과를 모르므로
  // 현재 검의 성공 떨림으로 어림한다(검이 없으면 떨림 0). 첫 강화 직후 실제 결과의 lockMs 로 대체된다.
  const [lastLockMs, setLastLockMs] = useState(
    () => computeEnhanceTimeline(anim, sword ? sword.shake.success : 0).lockMs,
  )

  // 강화 결과 플로팅 텍스트("아이구!..." 등)의 id 카운터 — 핸들러가 강화 시점에 후보 한 줄을 뽑아 이벤트를
  // 만들고 resultStore.showFloatingText 로 넘긴다(표시는 CenterStage 가 resultStore 구독으로 그린다).
  const floatTextKey = useRef(0)

  // ── 강화 결과의 "공개(reveal)" 시점 ─────────────────────────────────────────────
  // 결과 공개 상태(heldSwordId·가격강조·플로팅텍스트·클리어)와 타이머는 resultStore 로 분리했다 — reveal
  // 전이가 GameScreen 의 gold·lockCount 커밋과 얽혀 무거운 트리를 재조정하던 결합을 끊는다. 여기선 인벤토리
  // 장착행에 쓸 revealedSword 만 좁혀 구독해 파생한다(검 스테이지는 CenterStage 가 직접 resultStore 구독).
  // heldSwordId 가 있으면(강화 직후 떨림 동안) 강화 전 검을, null 이면 현재(결과) 검을 이름·스탯에 보인다.
  const heldSwordId = useResultStore((s) => s.heldSwordId)
  const revealedSword =
    heldSwordId !== null ? dataManager.getSwordById(heldSwordId) : sword

  // originEl 은 코인 비행의 "출발점"(연출 전용·선택)이다 — 납품(검 소모·보상·생명주기)은 store 가 소유하며
  // 엘리먼트 유무와 무관하게 진행된다. 연출 엘리먼트에 게임 액션을 묶지 않는다(키보드 납품이 막히던 버그의 근본 차단).
  const handleFulfill = useStableCallback(
    (commission: Commission, originEl: HTMLElement | null) => {
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
  })

  const handleSell = useStableCallback(() => {
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
  })

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
  const handleStore = useStableCallback(() => {
    if (!canStore) return // store() 와 동일 게이트(시작 검·검 없음이면 보관할 게 없음)
    const outgoing = currentSwordId
    store()
    if (outgoing) enqueueItemFlight(outgoing)
  })

  // 장착 — 가방의 검을 끼우면 현재 검이 가방으로 옮겨진다(equip → bankOutgoing). 그 나가는 검도
  // 인벤토리로 빨려 드는 연출을 띄운다. 단, 시작 검(sword_1)은 가방에 들어가지 않고 버려지므로 제외.
  const handleEquip = useStableCallback((itemId: string) => {
    const outgoing = canStore ? currentSwordId : null
    equip(itemId)
    if (outgoing) enqueueItemFlight(outgoing)
  })

  const handleEnhance = useStableCallback(() => {
    // 쿨다운(재강화 가드) 중 들어온 강화는 무시한다 — 버튼이 더 이상 disabled 가 아니라(클릭/Enter 가능)
    // 쿨다운 오버레이만 덮으므로, 이 가드로 '쿨다운 중 단발 입력'을 no-op 으로 만든다(요구사항: 재강화는
    // UI 가드만으로 막는다 — 게임 로직은 불변). hold 연사는 useHoldRepeat 가 동일 게이팅.
    if (enhanceLocked) return
    // 강화 전(현재) 검 — store 는 enhance() 에서 즉시 검을 교체하지만, currentSwordId 는 이번 렌더의
    // 스냅샷이라 이 핸들러 안에선 강화 전 값을 유지한다. 결과 공개 전까지 이름·스탯에 보여 줄 검이다.
    const prevSwordId = currentSwordId
    const result = enhance(effectiveProtection)
    if (!result) return

    // 제안 갱신은 강화 시도 기반이다 — 결과(성공/실패/보호/파괴)에 무관하게 강화 1회를 의뢰 큐에 알린다.
    // (no-op 강화는 위에서 빠지므로 알리지 않는다.) 카운터 차감·세션 갱신은 commissionStore 가 소유한다.
    useCommissionStore.getState().notifyAttempt()

    // ── 이번 강화의 연출 타임라인(단일 출처) ──────────────────────────────────────
    // 떨림 시간(shakeMs)을 결과별 검 데이터에서 고르고, 데이터 타이밍과 합쳐 모든 마일스톤·수명을 도출한다.
    // 아래 모든 효과·사운드·공개 타이머·잠금이 이 한 객체의 슬라이스를 쓴다 — impact+shake 계산이 곳곳에서
    // 어긋나(= 강화 전/후 검 동시 노출 버그) 발생하지 않도록 한곳에서만 계산한다.
    // 떨림 길이는 강화 대상(강화 전) 검의 결과별 shake(SwordData.shake[outcome])에서 고른다 — sword 는 이번
    // 렌더의 currentSwordId 스냅샷이라 강화 전 검이고, result 가 있으면 검이 있었다는 뜻이라 여기선 존재한다.
    // 0 이하면 타임라인이 0 으로 클램프해 그 결과에선 떨림 없이 임팩트 시점에 바로 공개·버스트한다.
    const tl = computeEnhanceTimeline(
      anim,
      sword ? sword.shake[result.outcome] : 0,
    )
    const burstAtSec = tl.burstAtMs / 1000

    // 결과 공개 지연: 강화 전 검을 떨림 동안 이름·스탯에 유지했다가, 떨림이 끝나는 순간(burstAt = revealAt)
    // 결과 검으로 한 번에 전환한다. 가격 강조·게임 클리어도 그 시점에 함께 푼다(연출 전 스포일 방지).
    // 상태·타이머는 resultStore 가 소유한다(reveal 전이를 GameScreen 커밋과 분리 — 무거운 트리 재조정 차단).
    const scheduleReveal = (pricePop: boolean, terminal: boolean) => {
      useResultStore.getState().scheduleReveal({
        prevSwordId,
        pricePop,
        terminal,
        revealAtMs: tl.revealAtMs,
      })
    }

    // 강화 '캉!' 타격음 — 결과(성공·파괴·방지)와 무관하게 한 번 재생. 망치가 검에 닿는 순간(impactMs)에
    // 맞춰 미뤄, 화면에서 내리꽂는 순간 울리도록 한다(Hit 불꽃·떨림 시작과 동일 앵커).
    sound.playSfx('enhance', { delayMs: tl.impactMs })

    // 망치 내려치기 연출 — 결과와 무관하게 강화 시도마다 검 위로 호라드릭 망치가 내리꽂힌다(잠금X·병렬).
    // 이 이벤트가 HitSparkCanvas 의 불꽃 트리거도 겸한다(임팩트 = 닿는 순간). 잠금은 아래 enhanceLock 전담.
    enqueueEffect({
      kind: 'hammerStrike',
      exclusive: false,
      locksEnhance: false,
      durationMs: hammerStrikeMs(tl.impactMs, hammerShape),
    })

    // 강화 결과 플로팅 텍스트(데이터 기반) — 결과를 이벤트 키로 매핑해 후보 한 줄을 뽑아 검 중상단에
    // 띄운다. 빈 슬롯(미설정)이면 null → 미표시. 등장 타이밍(delaySec)은 떨림이 끝나는 burstAt 에 맞춘다.
    const floatEventKey =
      result.outcome === 'success'
        ? 'enhanceSuccess'
        : result.outcome === 'protected'
          ? 'enhanceProtected'
          : result.outcome === 'whiff'
            ? 'enhanceWhiff' // 헛방(파괴 없는 실패) 전용 슬롯
            : 'enhanceFail' // 'destroyed' → 실패(네이밍 브릿지)
    const pickedTextKey = pickFloatingText(
      dataManager.getFloatingTexts(floatEventKey),
    )
    if (pickedTextKey) {
      floatTextKey.current += 1
      useResultStore.getState().showFloatingText({
        id: floatTextKey.current,
        textKey: pickedTextKey,
        delaySec: burstAtSec,
      })
    }

    // 강화 버튼 잠금(재강화 가드)은 성공·파괴·방지 공통 — 연출과 별개의 병렬 효과(lockCount). 길이는
    // 타임라인 lockMs(= 버스트 + 재강화 가드)로, 떨림이 끝나고 가드(0.1s)만큼 뒤에 풀린다(요구사항).
    // 버튼 충전 오버레이가 같은 길이로 걷히도록 마지막 잠금 길이를 보관한다.
    setLastLockMs(tl.lockMs)
    const lockEnhance = () =>
      enqueueEffect({
        kind: 'enhanceLock',
        exclusive: false,
        locksEnhance: true,
        durationMs: tl.lockMs,
      })

    // "떨림 후 분출 + 새 검 등장 억제"를 한 쌍으로 건다(성공·파괴 공통 안무). 잔상(sprite) 떨림→버스트와
    // 새 검 등장(burstAt 까지 억제)이 항상 같은 타임라인 슬라이스를 쓰도록 한곳에서 enqueue 한다 — 두 분기가
    // 따로 작성하면 한쪽 payload(예: 등장 억제 지연)만 고쳐 잔상 소멸·새 검 등장이 어긋나는(강화 전/후 검 동시
    // 노출) 발산이 생길 수 있어 일반화한다. 파티클 수는 단계(level)에 비례 — 호출 측이 잔상/도달 검을 해석해 넘긴다.
    const enqueueShakeBurst = (kind: string, sprite: string, level: number) => {
      enqueueEffect({
        kind,
        exclusive: false,
        locksEnhance: false,
        durationMs: tl.burstLifetimeMs,
        payload: {
          sprite,
          particleCount: particleCount(level),
          impactMs: tl.impactMs,
          shakeMs: tl.shakeMs,
        },
      })
      enqueueEffect({
        kind: 'entranceSuppress',
        exclusive: false,
        locksEnhance: false,
        durationMs: tl.suppressMs,
        payload: { entranceDelaySec: burstAtSec },
      })
    }

    if (result.outcome === 'success') {
      // 성공 = (실패와 동일 안무) 망치 임팩트 → 떨림(검 데이터) → 황금 파티클 분출 + 상위 검 등장 ∥ 재강화 가드.
      // 잔상은 강화 전 검(fromId), 파티클 수는 도달 검(toId)의 단계에 비례 — 둘 다 이 뷰 경계에서 해석(원칙 2).
      // 잔상 소멸·새 검 등장이 같은 burstAt 을 써 정확히 교대한다(강화 전/후 검 동시 노출 없음 — enqueueShakeBurst).
      const from = dataManager.getSwordById(result.fromId)
      const next = dataManager.getSwordById(result.toId)
      if (from) {
        enqueueShakeBurst('successBurst', from.sprite, next?.level ?? 0)
      }
      // 가치 상승 강조 — 도달 검(toId)이 강화 전(fromId)보다 비싸면 가격 표시를 한 번 통 튀게 한다.
      // "강화 성공으로 올랐다"는 사실은 이 분기에만 있으므로 여기서 판정한다(장착·판매와 구분).
      const pricePop =
        !!next &&
        !!from &&
        next.sellPrice !== null &&
        from.sellPrice !== null &&
        next.sellPrice > from.sellPrice
      // 최종 검(다음 단계 없음)에 도달하면 게임 클리어. id 하드코딩 대신 nextId === null 로 판별해
      // 최고 단계가 바뀌어도 자동 동작한다.
      const terminal = !!next && next.nextId === null
      lockEnhance()
      // 이름·판매가·가격 강조·클리어 모달을 떨림이 끝나는 burstAt 에 한 번에 공개한다 — store 는 검을 즉시
      // 교체하지만 그 결과가 연출 전에 새지 않도록 미룬다(스프라이트 등장과 같은 박자).
      scheduleReveal(pricePop, terminal)
    } else if (result.outcome === 'destroyed') {
      // 파괴 폭발 효과음 — 떨림이 끝나 폭발이 터지는 순간(burstAt)에 맞춰 울린다('캉!' 직후가 아닌 분출 시점).
      sound.playSfx('enchant_destroyed', { delayMs: tl.burstAtMs })
      // 파괴 = 폭발 연출 ∥ 재강화 가드. 파티클 수는 파괴된 검(fromId)의 단계에 비례.
      // 스프라이트(fromId)는 이 뷰 경계에서 해석해 payload 로 넘긴다(원칙 2).
      const target = destructionTargetOf(result)
      const destroyed = target ? dataManager.getSwordById(target.id) : undefined
      if (target && destroyed) {
        // 잔상은 파괴된 검(fromId), 등장 억제는 떨림 끝(burstAt)까지 — 성공과 동일 안무(enqueueShakeBurst).
        enqueueShakeBurst('destruction', destroyed.sprite, destroyed.level)
      }
      // 드롭이 있으면 재료가 검 아래로 흩어져 떨어지는 연출(잠금X·병렬). 폭발(burstAt)이 드러난 직후
      // 떨어지도록 등장 시각을 타임라인에서 도출한다(검 데이터 떨림 길이만큼 함께 늦춰짐). 실제 인벤토리 수량은 store 반영됨.
      if (result.drops.length > 0) {
        const appearSec = dropAppearSec(burstAtSec)
        enqueueEffect({
          kind: 'drop',
          exclusive: false,
          locksEnhance: false,
          durationMs: dropLifetimeMs(appearSec),
          payload: {
            drops: result.drops.map((d) => ({ ...d })),
            appearDelaySec: appearSec,
          },
        })
      }
      lockEnhance()
      // 파괴로 시작 검(+1)으로 리셋된 결과도 떨림이 끝난 뒤 이름이 바뀌도록 공개를 미룬다
      // (떨림·폭발 동안은 파괴된 검 이름을 유지 → 폭발이 드러나는 순간 +1 로 전환).
      scheduleReveal(false, false)
    } else if (result.outcome === 'protected') {
      // 방지 = 떨림만(폭발 없음) → 파괴보호장치 덕분에 살아남았음을 인지시킨다. 떨림은 망치가 닿는
      // 순간(impact)부터 검 데이터 떨림 길이(shake)만큼 — 성공/파괴 잔상 떨림과 동일 박자(SwordStage 가 실제 검을 흔든다).
      enqueueEffect({
        kind: 'protectedShake',
        exclusive: false,
        locksEnhance: false,
        durationMs: tl.protectedDurationMs,
        payload: { impactMs: tl.impactMs, shakeMs: tl.shakeMs },
      })
      // 재강화 가드는 성공·파괴와 동일하게 건다 — 마우스·스페이스 모두 일관되도록.
      lockEnhance()
    } else if (result.outcome === 'whiff') {
      // 헛방 = 떨림만(폭발·드랍 없음, 검 보존) → 강화가 빗나갔을 뿐 검은 살아남았음을 인지시킨다.
      // 방지와 동일한 "떨림만" 안무를 쓰되 별개 kind 로 둔다 — 결계(파괴보호) 플레어는 켜지 않는다
      // (whiffShake 는 검 떨림만 구동하고, protectedShake 만 결계를 번쩍인다 — 아래 shakeKey/blockKey 분리).
      // 검 이름·스프라이트는 그대로라 scheduleReveal·버스트(분출) 없이 떨림만 띄운다.
      enqueueEffect({
        kind: 'whiffShake',
        exclusive: false,
        locksEnhance: false,
        durationMs: tl.protectedDurationMs,
        payload: { impactMs: tl.impactMs, shakeMs: tl.shakeMs },
      })
      // 재강화 가드는 성공·파괴·방지와 동일하게 건다.
      lockEnhance()
    }
  })

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

  // (연출 트리거 투영·스프라이트 오버레이·결계 plonk·결과 알림은 CenterStage 로, 비행 오버레이는
  // CardOverlays 로 이관 — 둘 다 자기 자신이 running 을 좁혀 구독한다. GameScreen 은 running 비구독.)

  // lg+(데스크탑)에선 바깥 패딩을 없애 카드가 브라우저를 꽉 채우게 한다 — 베젤(검정) 여백 제거.
  // <lg(세로형)에선 베젤 프레임을 유지한다.
  // items-stretch: 카드를 래퍼 높이(100svh − 패딩)에 늘려 세로 화면을 꽉 채운다 — 카드 자신은
  // min-h-svh 를 두지 않는다(카드+패딩 = svh 가 돼 스크롤 0; min-h-svh 면 패딩만큼 넘쳤다).
  // 내용이 넘치면 카드가 자라 overflow-y-auto 로 스크롤된다(짧은 화면 안전망).
  return (
    <div className="flex min-h-svh items-stretch justify-center overflow-x-hidden overflow-y-auto bg-bezel p-3 sm:p-6 lg:p-0">
      {/* lg+(데스크탑): 레이아웃은 고정 비율(좌 16rem · 가운데 28rem · 우 16rem)이며, 화면이 커지면
          루트 font-size 가 커져(아래 index.css clamp) rem 기반 UI 전체가 통째로 균일하게 스케일된다
          (가운데만 비어 보이던 1fr 제거 → 빈 공간이 비례적으로 늘지 않음). 컬럼 트랙은 justify-center 로
          가운데 정렬하고, bg-stage 가 화면 전체를 덮어 양옆 여백도 베이지(검정 없음). 미디어쿼리(lg)는
          초기 16px 기준이라 스케일과 무관하게 1024px 에서 고정 — <lg 는 세로 단일 컬럼(16px). */}
      <div className="relative flex w-full flex-col rounded-2xl border border-stage-edge bg-stage p-4 shadow-2xl sm:p-5 lg:rounded-none lg:border-0 lg:px-0">
        {/* 상단 컨트롤은 아래 메인 그리드와 같은 폭으로 가운데 정렬한다. 그리드는 full-width 안에서
            lg:grid-cols-[16rem_28rem_16rem] + gap-2(0.25rem×2=0.5rem, 갭 2개=1rem) = 61rem 만 justify-center 로
            가운데에 쓰는데, TopControls 만 full-width 라 상단바가 좌우로 더 넓게 튀어나와 보였다(불일치).
            여기서 같은 61rem 밴드(mx-auto)로 묶어 언어토글·게이지·상점 줄이 인벤토리/강화 패널의 좌우 끝과
            정렬되게 한다. bg-stage(베이지)는 바깥 div 가 계속 full-width 로 깐다. 61rem 은 위 그리드 컬럼
            합과 동기화할 것 — 컬럼/갭을 바꾸면 이 값도 함께 고친다. <lg(세로형)은 그대로 full-width. */}
        <div className="lg:mx-auto lg:w-full lg:max-w-[61rem]">
          <TopControls onOpenShop={openShop} />
        </div>

        {/* 상단 거래 제안 바 — 요구 검을 보유했을 때 클릭하면 검을 넘기고 보상(판매가+인센티브)을 받는다. */}
        <CommissionBar onFulfill={handleFulfill} hotkeysEnabled={!shopOpen} />

        {/* 좁은 화면(<lg)은 단일 컬럼 세로 스택, lg+ 는 3열 그리드 — 3열은 고정폭 검 스테이지(검 박스 240·
            이름 배너 320)가 들어갈 만큼 넓을 때만 쓴다. sm(640) 기준이면 640~1024 구간에서 가운데 트랙이
            눌려 좌우 패널과 겹치므로, 전환 기준을 lg(1024)로 둔다(성공률을 검 오른쪽으로 옮기는 lg 와 일치).
            세로형: flex-1 로 카드의 남는 세로 공간을 이 컨테이너가 모두 차지하고, 안에서 검 스테이지 셀이
            다시 flex-1 로 늘어 위(마법진)·아래(강화/판매/인벤토리) 앵커를 만든다. lg+: lg:grid + lg:flex-none
            로 기존 3열 고정 레이아웃(my-auto 세로 중앙)을 그대로 복원한다. */}
        <div className="mt-3 flex min-h-0 flex-1 flex-col gap-2 lg:my-auto lg:grid lg:min-h-[34rem] lg:flex-none lg:justify-center lg:grid-cols-[16rem_28rem_16rem]">
          {/* 좌: 인벤토리(강화비용·판매가는 우측 버튼으로 통합 — 별도 비용 카드 없음).
              세로형(<lg)에선 강화 버튼처럼 컬럼 폭을 꽉 채우고, lg+(3열)에선 컬럼을 채운다. */}
          <div className="order-last flex w-full min-h-0 flex-none flex-col lg:order-none lg:justify-center">
            {/* ref: 파괴 드롭이 빨려 들어갈 도착점 측정용 — 패널을 감싸 드롭이 보이는 인벤토리로 들어가게 한다.
                lg+(데스크탑)에선 컬럼 높이에서 세로 중앙 정렬(고정 높이 박스, 꽉 채우지 않음). */}
            <div ref={inventoryRef}>
              <InventoryPanel
                // 장착행도 무대 이름과 같은 박자로 공개한다(강화 결과가 망치 전에 새지 않도록).
                sword={revealedSword}
                level={revealedSword?.level ?? null}
                items={items}
                onEquip={handleEquip}
                // 장착 행을 클릭하면 보관(별도 보관 버튼 제거 — 보관 트리거를 인벤토리로 옮김).
                onStoreEquipped={handleStore}
                canStoreEquipped={canStore}
                goldPulseKey={goldPulse.key}
                goldCoinCount={goldPulse.count}
                goldRef={goldRef}
              />
            </div>
          </div>

          {/* 중앙: 검 스테이지 + 결과 연출(오버레이) — running(효과)·resultStore(공개 상태)를 자기 자신이
              구독하는 memo 자식. GameScreen 의 gold·lockCount·items 커밋과 분리돼, 무거운 검 스테이지·오버레이
              트리는 연출 트리거가 바뀔 때만 재조정된다(검 변경 리렌더 폭풍 차단의 핵심). 내부에 ParticleEmitProvider·
              SwordStage·스프라이트 오버레이·골드획득 텍스트·결과 알림을 모두 품는다. */}
          <CenterStage
            liveSword={sword}
            protection={protection}
            onToggleProtection={toggleProtection}
            onOpenShop={openShop}
            swordBoxRef={swordBoxRef}
            goldGain={goldGain}
          />

          {/* 우: 강화 카드(비용 포함) + 판매 버튼(세로 중앙). 판매가는 검 스테이지에 금색으로 표시.
              보관은 좌측 인벤토리의 장착 행 클릭으로 옮겼다(별도 보관 버튼 없음).
              보유 골드는 좌측 인벤토리 헤더 우측 배지로 옮겼다(스크롤 영역 밖 고정). */}
          <div className="flex flex-none flex-col items-center justify-center">
            {/* 액션 패널 = 인벤토리 패널과 동일 크기. 폭은 컬럼(16rem)으로 이미 같고, 높이는 인벤토리
                패널 높이(헤더 2.8125rem[골드 알약 py-1 포함] + 목록 17.25rem + 테두리 0.125rem = 20.1875rem)에
                맞춘다. lg+ 에선 그 높이의 2행 그리드(강화 2 : 판매 1)로 버튼이 행을 채운다(items-stretch).
                세로형(<lg)은 콘텐츠 높이의 일반 flex 스택. (인벤토리 헤더/목록 높이를 바꾸면 이 값도 같이 고칠 것.) */}
            <div className="flex w-full flex-col items-center gap-2 lg:grid lg:h-[20.1875rem] lg:grid-rows-[2fr_1fr] lg:items-stretch">
              <EnhanceButton
                disabled={!canEnhance}
                charging={enhanceLocked}
                // 충전 오버레이는 직전 강화의 재강화 잠금 길이(매회 떨림에 따라 다름)로 걷힌다.
                chargeMs={lastLockMs}
                onEnhance={handleEnhance}
                enchantCost={sword?.enchantCost ?? null}
                enchantCostItems={sword?.enchantCostItems ?? EMPTY_ITEM_COSTS}
              />
              {/* 세로형(<lg)에선 판매 버튼 높이를 ~30% 키운다(min-h ≈ 2.92rem×1.3). 데스크탑은
                  고정 높이 2fr:1fr 그리드가 높이를 정하므로 lg:min-h-0 으로 리셋(영향 없음). */}
              <ActionButton
                disabled={!canSell}
                onClick={handleSell}
                className="min-h-[3.8rem] lg:min-h-0"
              >
                {t('action.sell')}
              </ActionButton>
            </div>
          </div>
        </div>

        {/* 의뢰 완료 코인 연출 — 출발점은 클릭한 의뢰 카드(FlightAnchor 로 좌표 고정), 도착점은 골드창. */}
        {commissionCoin && (
          <FlightAnchor
            rect={commissionCoin.rect}
            anchorRef={commissionAnchorRef}
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

        {/* 의뢰 아이템 보상 연출 — 출발점은 클릭한 의뢰 카드(FlightAnchor 로 고정), 도착점은 인벤토리.
            보상 아이템 아이콘이 카드에서 가방으로 빨려 든다(코인 비행과 동형, 작은 크기로 이륙). */}
        {commissionItem && (
          <FlightAnchor
            rect={commissionItem.rect}
            anchorRef={commissionItemAnchorRef}
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

        {/* 판매 코인·보관/장착 검 비행·파괴 드롭 — running(효과)을 자기 자신이 구독하는 memo 자식.
            절대 위치는 카드(relative) 기준(fragment 자식이 카드 직속 DOM). GameScreen 커밋과 분리된다.
            카드 루트 마지막에 둬 파괴 드롭(이 fragment 의 마지막 자식)이 최상단에 그려진다(원본 페인트 순서 유지). */}
        <CardOverlays
          swordBoxRef={swordBoxRef}
          goldRef={goldRef}
          inventoryRef={inventoryRef}
        />
      </div>

      {/* 상점 팝업 (전체 화면 오버레이 — 열렸을 때만 렌더) */}
      <ShopModal open={shopOpen} onClose={closeShop} />
      <GameClearModal
        open={cleared}
        onClose={() => useResultStore.getState().dismissCleared()}
      />
    </div>
  )
}
