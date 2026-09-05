import { memo, useMemo, type RefObject } from 'react'
import { latestOf, useEffectStore } from '../store/effectStore'
import { useGameStore } from '../store/gameStore'
import { CoinFlight, type CoinFlightEvent } from './CoinFlight'
import { DropScatter, type DropEvent } from './DropScatter'
import { ItemFlight, type ItemFlightEvent } from './ItemFlight'

type CardOverlaysProps = {
  swordBoxRef: RefObject<HTMLDivElement | null>
  goldRef: RefObject<HTMLDivElement | null>
  inventoryRef: RefObject<HTMLDivElement | null>
}

// 카드 루트에 얹는 비행 오버레이(판매 코인·보관/장착 검·파괴 드롭) — 효과 store 의 kind 별 "최신 시작"(latestOf)만
// 구독한다. 새 효과가 시작될 때만 참조가 바뀌고 종료는 발행되지 않으므로, 연출 종료가 이 트리를 커밋시키지 않는다.
// 각 연출은 자기 수명(useOneShot)으로 내려가고, 드롭은 수명 종료 시(onExpire) 미수집분을 flush 한다.
export const CardOverlays = memo(function CardOverlays({
  swordBoxRef,
  goldRef,
  inventoryRef,
}: CardOverlaysProps) {
  const collectDrop = useGameStore((s) => s.collectDrop)
  const flushDrops = useGameStore((s) => s.flushDrops)
  const coinFlightFx = useEffectStore(latestOf('coinFlight'))
  const itemFlightFx = useEffectStore(latestOf('itemFlight'))
  const dropFx = useEffectStore(latestOf('drop'))

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
            appearDelaySec: dropFx.payload.appearDelaySec ?? 0,
          }
        : null,
    [dropFx],
  )

  return (
    <>
      <CoinFlight
        event={coinFlightEvent}
        sourceRef={swordBoxRef}
        targetRef={goldRef}
      />
      <ItemFlight
        event={itemFlightEvent}
        sourceRef={swordBoxRef}
        targetRef={inventoryRef}
      />
      {/* 파괴 드롭 — 카드 루트 마지막 자식이라 최상단에 그려진다(원본 페인트 순서 유지). 수명이 끝나면 미수집분 flush. */}
      <DropScatter
        event={dropEvent}
        sourceRef={swordBoxRef}
        targetRef={inventoryRef}
        onCollect={collectDrop}
        onExpire={flushDrops}
      />
    </>
  )
})
