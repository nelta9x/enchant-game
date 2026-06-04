import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ItemIcon } from './ItemIcon'
import {
  DROP_APPEAR_DELAY_SEC,
  DROP_AUTO_AT_SEC,
  DROP_FLIGHT_SEC,
  DROP_IN_SEC,
  DROP_LIFETIME_MS,
  makeDropTokens,
  relativeCenter,
  type DropTokenSpec,
  type Point,
} from './drops'
import { useOneShot } from './useOneShot'

// 파괴 드롭 수집 연출(프레젠테이션 전용). 게임 로직과 분리되어 'drop' 이벤트(재생 id + 드롭 스택)
// 에만 반응한다. 검(sourceRef) 아래로 재료가 흩어져 떨어진 뒤, 마우스로 스칠 때마다(또는 일정
// 시간 후 자동으로) 각 재료가 인벤토리창(targetRef)으로 빨려 들어간다.
//
// 좌표: 토큰은 이 오버레이(absolute inset-0) 안에 산다. 출발(검)·도착(인벤토리)은 "오버레이 자신의
// rect" 기준으로 측정한다(카드의 padding/border 만큼 어긋나지 않도록 — relativeCenter, 코인과 동일).
//
// 인지/접근성: 순수 시각 연출이라 aria-hidden. 실제 인벤토리 수량은 store 에서 이미 반영되었다.
// 오버레이는 클릭을 막지 않도록 pointer-events-none, 개별 토큰만 호버를 받도록 pointer-events-auto.

export type DropEvent = {
  id: number
  drops: { itemId: string; count: number }[]
}
export { DROP_LIFETIME_MS }

export function DropScatter({
  event,
  sourceRef,
  targetRef,
  onCollect,
}: {
  event: DropEvent | null
  sourceRef: RefObject<HTMLDivElement | null>
  targetRef: RefObject<HTMLDivElement | null>
  // 토큰이 인벤토리에 도착(수집 완료)할 때 호출 — 실제 인벤토리 반영은 호출 측(store.collectDrop)이 한다.
  // DropScatter 는 store 를 모른 채 "무엇이 수집됐는지"만 알린다(뷰-로직 분리).
  onCollect: (itemId: string, count: number) => void
}) {
  const active = useOneShot(event, DROP_LIFETIME_MS)

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-visible"
      aria-hidden
    >
      <AnimatePresence>
        {active && (
          <DropPile
            key={active.id}
            drops={active.drops}
            sourceRef={sourceRef}
            targetRef={targetRef}
            onCollect={onCollect}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// 한 번의 드롭. key=event.id 로 마운트되며, 마운트 시점에 출발/도착 좌표를 "자신의 rect" 기준으로
// 한 번 측정해 잡아둔다. 미수집 토큰은 DROP_AUTO_AT_SEC 뒤 일괄 자동 수집된다(바닥에 영구히 남지 않도록).
function DropPile({
  drops,
  sourceRef,
  targetRef,
  onCollect,
}: {
  drops: { itemId: string; count: number }[]
  sourceRef: RefObject<HTMLDivElement | null>
  targetRef: RefObject<HTMLDivElement | null>
  onCollect: (itemId: string, count: number) => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [coords, setCoords] = useState<{ source: Point; target: Point } | null>(
    null,
  )
  // 미수집분 일괄 자동 수집 신호(바닥에 영구히 머물지 않도록). 마우스로 스친 토큰은 개별 수집된다.
  const [autoCollect, setAutoCollect] = useState(false)
  // 수집 완료(인벤토리 도착)된 토큰 인덱스 — 보이지 않는 인터랙티브 노드를 정리한다.
  const [done, setDone] = useState<ReadonlySet<number>>(() => new Set())

  // 측정은 paint 전(useLayoutEffect)에 1회. 좌표 확정 전엔 토큰을 그리지 않는다(coords 가드).
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

  // 일정 시간(머묾) 뒤 미수집 토큰을 일괄 수집. 타이머 콜백에서만 set → set-state-in-effect 규칙 OK.
  useEffect(() => {
    const tid = setTimeout(() => setAutoCollect(true), DROP_AUTO_AT_SEC * 1000)
    return () => clearTimeout(tid)
  }, [])

  const tokens = useMemo(() => makeDropTokens(drops), [drops])

  return (
    <motion.div
      ref={rootRef}
      className="absolute inset-0 overflow-visible"
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
    >
      {coords &&
        tokens.map((spec, i) =>
          done.has(i) ? null : (
            <DropToken
              key={i}
              spec={spec}
              source={coords.source}
              target={coords.target}
              autoCollect={autoCollect}
              onCollected={() => {
                // 인벤토리 도착 시 실제 수집 반영(이 토큰이 대표하는 수량만큼) + 노드 정리.
                onCollect(spec.itemId, spec.count)
                setDone((s) => new Set(s).add(i))
              }}
            />
          ),
        )}
    </motion.div>
  )
}

// 재료 토큰 1개 — 검 위치에서 아래로 "툭" 떨어져(backOut 바운스) 흩어진 자리에 머문다. 마우스로 스치면
// (onPointerEnter) 또는 autoCollect 신호가 오면 살짝 떠올랐다(rise) 인벤토리로 빨려 들어가며 작아진다.
// 빨려드는 동안은 pointer-events-none — 커서가 쫓아와도 재트리거되지 않는다.
function DropToken({
  spec,
  source,
  target,
  autoCollect,
  onCollected,
}: {
  spec: DropTokenSpec
  source: Point
  target: Point
  autoCollect: boolean
  onCollected: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const collecting = hovered || autoCollect

  const restX = source.x + spec.dx
  const restY = source.y + spec.dy

  return (
    <motion.div
      className="absolute left-0 top-0 select-none"
      style={{
        width: spec.size,
        height: spec.size,
        marginLeft: -spec.size / 2,
        marginTop: -spec.size / 2,
        pointerEvents: collecting ? 'none' : 'auto',
        cursor: 'pointer',
      }}
      onPointerEnter={() => setHovered(true)}
      // 검 중심에서 시작해(파괴 지점) 아래 rest 로 떨어진다.
      initial={{ x: source.x, y: source.y, scale: 0.4, opacity: 0 }}
      animate={
        collecting
          ? {
              // 바닥 → 살짝 떠올랐다(rise) → 인벤토리로 빨려 들어가며 작아짐.
              x: [restX, restX + spec.drift, target.x],
              y: [restY, restY - spec.rise, target.y],
              scale: [1, 1.12, 0.2],
              opacity: [1, 1, 0],
              rotate: [0, spec.spin * 120, spec.spin * 420],
            }
          : {
              // 검 위치에서 흩어진 자리로 낙하(바운스 착지).
              x: restX,
              y: restY,
              scale: 1,
              opacity: 1,
              rotate: 0,
            }
      }
      transition={
        collecting
          ? {
              duration: DROP_FLIGHT_SEC,
              times: [0, 0.35, 1],
              ease: ['easeOut', 'easeIn'],
            }
          : {
              delay: DROP_APPEAR_DELAY_SEC + spec.inStagger,
              duration: DROP_IN_SEC,
              ease: 'backOut',
            }
      }
      onAnimationComplete={() => {
        if (collecting) onCollected()
      }}
    >
      <ItemIcon itemId={spec.itemId} className="h-full w-full" />
    </motion.div>
  )
}
