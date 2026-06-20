import { memo, useEffect, useMemo, type RefObject } from 'react'
import { useEffectStore } from '../store/effectStore'
import { latestRunning } from '../store/effectQueue'
import { useGameStore } from '../store/gameStore'
import { CoinFlight, type CoinFlightEvent } from './CoinFlight'
import { DropScatter, type DropEvent } from './DropScatter'
import { ItemFlight, type ItemFlightEvent } from './ItemFlight'

type CardOverlaysProps = {
  // 검 박스(출발점)·골드창·인벤토리창(도착점) — GameScreen 이 소유하고 검 스테이지와 공유한다.
  swordBoxRef: RefObject<HTMLDivElement | null>
  goldRef: RefObject<HTMLDivElement | null>
  inventoryRef: RefObject<HTMLDivElement | null>
}

// 카드 전역 비행 오버레이(판매 코인·보관/장착 검 비행·파괴 드롭) — running(효과)을 자기 자신이 구독해
// GameScreen 의 gold·lockCount 커밋과 분리된다. 절대 위치는 카드(relative)를 기준으로 잡히므로(이 fragment
// 의 자식이 카드의 직속 DOM 자식이 된다) DOM 위치는 GameScreen 직접 렌더와 동일하다. memo 로 bail 한다.
export const CardOverlays = memo(function CardOverlays({
  swordBoxRef,
  goldRef,
  inventoryRef,
}: CardOverlaysProps) {
  // 드롭 수집·미수집 회수 액션(불변 참조).
  const collectDrop = useGameStore((s) => s.collectDrop)
  const flushDrops = useGameStore((s) => s.flushDrops)

  const coinFlightFx = useEffectStore((s) => latestRunning(s.running, 'coinFlight'))
  const itemFlightFx = useEffectStore((s) => latestRunning(s.running, 'itemFlight'))
  const dropFx = useEffectStore((s) => latestRunning(s.running, 'drop'))

  const coinFlightEvent = useMemo<CoinFlightEvent | null>(
    () =>
      coinFlightFx
        ? { id: coinFlightFx.id, coinCount: coinFlightFx.payload?.coinCount ?? 0 }
        : null,
    [coinFlightFx],
  )
  const itemFlightEvent = useMemo<ItemFlightEvent | null>(
    () =>
      itemFlightFx?.payload?.itemId
        ? { id: itemFlightFx.id, itemId: itemFlightFx.payload.itemId }
        : null,
    [itemFlightFx],
  )
  const dropEvent = useMemo<DropEvent | null>(
    () =>
      dropFx?.payload?.drops?.length
        ? {
            id: dropFx.id,
            drops: dropFx.payload.drops,
            // 재료 등장 시각(버스트 후) — 이번 강화의 무작위 떨림 길이를 반영한 타임라인 값.
            appearDelaySec: dropFx.payload.appearDelaySec ?? 0,
          }
        : null,
    [dropFx],
  )
  // 드롭 연출이 끝나면(dropFx 가 빠져 dropEvent 가 null) 미수집 대기분을 인벤토리로 회수한다(멱등).
  useEffect(() => {
    if (dropEvent === null) flushDrops()
  }, [dropEvent, flushDrops])

  return (
    <>
      {/* 판매 코인 연출 — 검 → 골드창(컬럼 가로지름). 출발/도착은 swordBoxRef·goldRef 로 측정. */}
      <CoinFlight
        event={coinFlightEvent}
        sourceRef={swordBoxRef}
        targetRef={goldRef}
      />
      {/* 보관·장착 연출 — 검 박스에서 검 아이콘이 인벤토리로 빨려 들어간다. */}
      <ItemFlight
        event={itemFlightEvent}
        sourceRef={swordBoxRef}
        targetRef={inventoryRef}
      />
      {/* 파괴 드롭 수집 연출 — 검 아래로 흩어진 재료가 인벤토리로 빨려 든다. */}
      <DropScatter
        event={dropEvent}
        sourceRef={swordBoxRef}
        targetRef={inventoryRef}
        onCollect={collectDrop}
      />
    </>
  )
})
