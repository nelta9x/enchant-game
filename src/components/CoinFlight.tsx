import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { itemSpriteUrl } from '../lib/sprites'
import { sound } from '../lib/sound'
import {
  COIN_FLIGHT_MS,
  COIN_FLIGHT_SEC,
  makeCoins,
  relativeCenter,
  type CoinSpec,
  type Point,
} from './coins'
import { useOneShot } from './useOneShot'

// 판매 코인 연출(프레젠테이션 전용). 게임 로직과 분리되어 'coinFlight' 이벤트(재생 id + 코인 수)
// 에만 반응한다. 검 위치(sourceRef)에서 코인이 뿜어져 나와 골드창(targetRef)으로 빨려 들어간다.
//
// 좌표: 코인은 이 오버레이(absolute inset-0) 안에 산다. 출발/도착 위치는 "오버레이 자신의 rect"
// 를 기준으로 측정한다(카드의 padding/border 만큼 어긋나지 않도록 — relativeCenter).
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
  const active = useOneShot(event, COIN_FLIGHT_MS)

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-visible"
      aria-hidden
    >
      <AnimatePresence>
        {active && (
          <CoinBurst
            key={active.id}
            coinCount={active.coinCount}
            sourceRef={sourceRef}
            targetRef={targetRef}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// 한 번의 분출. key=event.id 로 마운트되며, 마운트 시점에 출발/도착 좌표를 "자신의 rect" 기준으로
// 한 번 측정해 자기 상태로 잡아둔다(이후 새 분출이 와도 이 인스턴스의 좌표는 고정 — 교체 중 튀지 않음).
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
  const [coords, setCoords] = useState<{ source: Point; target: Point } | null>(
    null,
  )

  // 측정은 paint 전(useLayoutEffect)에 1회. 좌표가 확정되기 전엔 코인을 그리지 않아(coords 가드)
  // 검 중심에서 깜빡 나타나는 원점 플래시가 없다. (set-state-in-effect 의 정석적 "측정" 예외)
  useLayoutEffect(() => {
    const root = rootRef.current
    const src = sourceRef.current
    const tgt = targetRef.current
    if (!root || !src || !tgt) return
    const origin = root.getBoundingClientRect()
    setCoords({
      source: relativeCenter(src.getBoundingClientRect(), origin),
      target: relativeCenter(tgt.getBoundingClientRect(), origin),
    })
  }, [sourceRef, targetRef])

  const coins = useMemo(() => makeCoins(coinCount), [coinCount])

  return (
    <motion.div
      ref={rootRef}
      className="absolute inset-0 overflow-visible"
      // 새 판매로 교체되면 끊기지 않게 부드럽게 사라진다.
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
    >
      {coords && (
        <>
          {/* 분출 섬광 — 검에서 코인이 터져 나오는 순간의 황금 번쩍임(요소 1개, 가볍다). */}
          <motion.span
            className="absolute rounded-full"
            style={{
              left: coords.source.x,
              top: coords.source.y,
              width: 150,
              height: 150,
              marginLeft: -75,
              marginTop: -75,
              background:
                'radial-gradient(circle, color-mix(in srgb, var(--color-gold-glow) 80%, transparent), transparent 70%)',
            }}
            initial={{ scale: 0.3, opacity: 0 }}
            animate={{ scale: 1.25, opacity: [0, 0.9, 0] }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
          {coins.map((c, i) => (
            <CoinChip
              key={i}
              spec={c}
              source={coords.source}
              target={coords.target}
            />
          ))}
        </>
      )}
    </motion.div>
  )
}

// 코인 1개 — 검에서 위로 흩뿌려 "튀어올라"(backOut: 정점을 살짝 넘었다 되돌아오는 바운스) 코인마다
// 다른 시간 체공하다, 골드창 반대로 살짝 당겼다(backIn: anticipation) 급가속하며 빨려 들어간다.
// 위치·크기·투명도가 같은 곡선을 타 "통 튀어 떠 있다 → 휙 빨려듦"이 일관되게 보인다. (DOTween 의
// DOPunchPosition (elastic) + DOMove(InBack) 표준 기법을 Motion 내장 backOut/backIn 으로 옮긴 것)
function CoinChip({
  spec,
  source,
  target,
}: {
  spec: CoinSpec
  source: Point
  target: Point
}) {
  // 튀어오름 정점(검 위쪽). 정점에서 살짝 가라앉고 옆으로 분산되며 잠시 체공한 뒤 골드창으로 흡수.
  const apexX = source.x + Math.cos(spec.angle) * spec.rise
  const apexY = source.y + Math.sin(spec.angle) * spec.rise // sin<0 → 검 위쪽
  const hoverX = apexX + spec.drift
  const hoverY = apexY + spec.settle

  return (
    <motion.img
      src={COIN_SPRITE}
      alt=""
      draggable={false}
      className="absolute left-0 top-0 select-none"
      style={{
        width: spec.size,
        height: spec.size,
        marginLeft: -spec.size / 2,
        marginTop: -spec.size / 2,
        imageRendering: 'pixelated',
      }}
      initial={{ x: source.x, y: source.y, scale: 0, opacity: 0, rotate: 0 }}
      animate={{
        x: [source.x, apexX, hoverX, target.x],
        y: [source.y, apexY, hoverY, target.y],
        scale: [0.3, 1.18, 1.05, 0.16], // 통 튀고 → 체공 → 휙 흡수되며 작아짐
        opacity: [0, 1, 1, 0], // 빨려드는 끝에서야 사라짐(체공 동안은 또렷)
        rotate: [0, spec.spin * 90, spec.spin * 150, spec.spin * 520], // 빨려들 때 빛 반사하듯 빠르게 돈다
      }}
      transition={{
        delay: spec.stagger,
        duration: COIN_FLIGHT_SEC,
        // 튀어오름(0~15%, backOut 바운스) → 체공(~hold, 코인마다 다름) → 당겼다 급가속 흡수(backIn).
        times: [0, 0.15, spec.hold, 1],
        ease: ['backOut', 'easeInOut', 'backIn'],
      }}
      // 흡수가 끝나는 순간(애니메이션 완료 = 골드창 도달) 코인마다 'coin_pickup'을 울린다 —
      // 코인은 stagger 로 시간차를 두고 도착하므로 동전 쏟아지듯 차르륵 연달아 난다(풀이 보이스 상한으로 묶음).
      onAnimationComplete={() => sound.playSfx('coin_pickup')}
    />
  )
}
