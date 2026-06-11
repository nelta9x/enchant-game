import { useMemo, useRef, type RefObject } from 'react'
import { motion } from 'motion/react'
import { itemSpriteUrl } from '../lib/sprites'
import { sound } from '../lib/sound'
import { COIN_FLIGHT_MS, makeCoins, type CoinSpec, type Point } from './coins'
import { FlightChip, LaunchFlare } from './FlightChip'
import { OneShotOverlay } from './OneShotOverlay'
import { useRelativeCenter } from './useRelativeCenter'

// 판매 코인 연출(프레젠테이션 전용). 게임 로직과 분리되어 'coinFlight' 이벤트(재생 id + 코인 수)
// 에만 반응한다. 검 위치(sourceRef)에서 코인이 뿜어져 나와 골드창(targetRef)으로 빨려 들어간다.
//
// 좌표: 코인은 이 오버레이(absolute inset-0) 안에 산다. 출발/도착 위치는 "오버레이 자신의 rect"
// 를 기준으로 측정한다(useRelativeCenter — 카드의 padding/border 만큼 어긋나지 않도록).
//
// 컴퓨팅: 모든 코인은 transform/opacity 만 애니메이션(컴포지터 처리 — 레이아웃/페인트 없음).
// 같은 PNG 한 장을 50개가 공유(1회 디코드). "가장 최근" 한 번만 렌더하므로(latestRunning 으로
// 뽑은 event) 판매를 연타해도 화면에 쌓이는 코인 수가 상한(MAX_COINS)으로 묶인다.

const COIN_SPRITE = itemSpriteUrl('gold_coin.png')

export type CoinFlightEvent = { id: number; coinCount: number }
export { COIN_FLIGHT_MS }

export function CoinFlight({
  event,
  sourceRef,
  targetRef,
}: {
  event: CoinFlightEvent | null
  sourceRef: RefObject<HTMLDivElement | null>
  targetRef: RefObject<HTMLDivElement | null>
}) {
  return (
    <OneShotOverlay event={event} lifetimeMs={COIN_FLIGHT_MS}>
      {(active) => (
        <CoinBurst
          key={active.id}
          coinCount={active.coinCount}
          sourceRef={sourceRef}
          targetRef={targetRef}
        />
      )}
    </OneShotOverlay>
  )
}

// 한 번의 분출. key=event.id 로 마운트되며, 마운트 시점에 출발/도착 좌표를 "자신의 rect" 기준으로
// 한 번 측정해 잡아둔다(useRelativeCenter — 이후 새 분출이 와도 이 인스턴스의 좌표는 고정 — 교체 중 튀지 않음).
function CoinBurst({
  coinCount,
  sourceRef,
  targetRef,
}: {
  coinCount: number
  sourceRef: RefObject<HTMLDivElement | null>
  targetRef: RefObject<HTMLDivElement | null>
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  // 좌표가 확정되기 전엔 코인을 그리지 않아(null 가드) 검 중심에서 깜빡 나타나는 원점 플래시가 없다.
  const source = useRelativeCenter(rootRef, sourceRef)
  const target = useRelativeCenter(rootRef, targetRef)

  const coins = useMemo(() => makeCoins(coinCount), [coinCount])

  return (
    <motion.div
      ref={rootRef}
      className="absolute inset-0 overflow-visible"
      // 새 판매로 교체되면 끊기지 않게 부드럽게 사라진다.
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
    >
      {source && target && (
        <>
          {/* 분출 섬광 — 검에서 코인이 터져 나오는 순간의 황금 번쩍임(아이템 비행과 공유). */}
          <LaunchFlare at={source} />
          {coins.map((c, i) => (
            <CoinChip key={i} spec={c} source={source} target={target} />
          ))}
        </>
      )}
    </motion.div>
  )
}

// 코인 1개 — 공유 비행 칩(FlightChip)에 코인 PNG 를 실어 보낸다. 튀어올라 체공 후 흡수·페이드
// 안무는 FlightChip 가 소유하며 아이템 비행과 위치·크기·투명도 곡선을 공유한다. 코인만 다른 점은
// (1) 빨려들 때 회전한다(FlightChip spin 기본 true — 아이템 비행은 spin=false 로 끈다), (2) 실리는
// 내용(같은 PNG 1장)과 칩 크기(spec.size).
function CoinChip({
  spec,
  source,
  target,
}: {
  spec: CoinSpec
  source: Point
  target: Point
}) {
  return (
    <FlightChip
      spec={spec}
      source={source}
      target={target}
      // 흡수가 끝나는 순간(애니메이션 완료 = 골드창 도달) 코인마다 'coin_pickup'을 울린다 —
      // 코인은 stagger 로 시간차를 두고 도착하므로 동전 쏟아지듯 차르륵 연달아 난다(풀이 보이스 상한으로 묶음).
      onComplete={() => sound.playSfx('coin_pickup')}
    >
      <img
        src={COIN_SPRITE}
        alt=""
        draggable={false}
        className="block select-none"
        style={{
          width: spec.size,
          height: spec.size,
          imageRendering: 'pixelated',
        }}
      />
    </FlightChip>
  )
}
