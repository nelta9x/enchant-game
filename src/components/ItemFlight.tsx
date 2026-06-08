import {
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { sound } from '../lib/sound'
import { relativeCenter, type Point } from './coins'
import { ItemIcon } from './ItemIcon'
import { useOneShot } from './useOneShot'

// 아이템/검이 인벤토리로 "쏙" 빨려 들어가는 연출(프레젠테이션 전용). 게임 로직과 분리되어
// 'itemFlight' 이벤트(재생 id + itemId)에만 반응한다 — CoinFlight(검 → 골드창 코인 비행)를
// 미러링하되, 코인 다발 대신 아이콘 1장이 출발점(sourceRef)에서 인벤토리(targetRef)로 난다.
//
// 출발점은 상황마다 다르다: 보관·장착은 검 박스, 의뢰 아이템 보상은 클릭한 카드(고정 anchor).
// 도착점은 항상 인벤토리 패널이다. 좌표는 이 오버레이(absolute inset-0) 자신의 rect 기준으로
// 측정한다(카드의 padding/border 만큼 어긋나지 않도록 — relativeCenter).
//
// 무엇이 나는지는 ItemIcon 이 해석한다(검 스프라이트·아이템 스프라이트·토큰 폴백 모두 처리).
// 검의 itemId 는 sword id 라 그대로 검 스프라이트로 그려진다.

// ── 연출 타이밍 — 길이의 단일 출처. enqueueEffect.durationMs · useOneShot 수명 · 모션이 공유. ──
export const ITEM_FLIGHT_SEC = 0.55 // 아이콘 1장의 전체 수명(떠오름 → 빨려듦)
export const ITEM_FLIGHT_MS = Math.round(ITEM_FLIGHT_SEC * 1000) + 120

export type ItemFlightEvent = { id: number; itemId: string }

export function ItemFlight({
  event,
  sourceRef,
  targetRef,
  startSizeClass = 'h-36 w-36',
}: {
  event: ItemFlightEvent | null
  sourceRef: RefObject<HTMLDivElement | null>
  targetRef: RefObject<HTMLDivElement | null>
  startSizeClass?: string
}) {
  const active = useOneShot(event, ITEM_FLIGHT_MS)

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-visible"
      aria-hidden
    >
      <AnimatePresence>
        {active && (
          <FlyingItem
            key={active.id}
            itemId={active.itemId}
            sourceRef={sourceRef}
            targetRef={targetRef}
            startSizeClass={startSizeClass}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// 한 번의 비행. key=event.id 로 마운트되며, 마운트 시점에 출발/도착 좌표를 "자신의 rect" 기준으로
// 한 번 측정해 상태로 잡아둔다(이후 새 비행이 와도 이 인스턴스의 좌표는 고정 — 교체 중 튀지 않음).
function FlyingItem({
  itemId,
  sourceRef,
  targetRef,
  startSizeClass,
}: {
  itemId: string
  sourceRef: RefObject<HTMLDivElement | null>
  targetRef: RefObject<HTMLDivElement | null>
  startSizeClass: string
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [coords, setCoords] = useState<{ source: Point; target: Point } | null>(
    null,
  )

  // 측정은 paint 전(useLayoutEffect)에 1회. 좌표가 확정되기 전엔 아이콘을 그리지 않아(coords 가드)
  // 출발점에서 깜빡 나타나는 원점 플래시가 없다. (set-state-in-effect 의 정석적 "측정" 예외)
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

  return (
    <div ref={rootRef} className="absolute inset-0 overflow-visible">
      {coords && (
        <motion.div
          className="absolute left-0 top-0"
          style={{ marginLeft: 0, marginTop: 0 }}
          // 출발점에서 살짝 위로 떴다(중간 지점을 출발/도착보다 높게) 인벤토리로 빨려들며 작아지고
          // 사라진다 — backOut(떠오름) → easeInOut(이동) → backIn(당겼다 급가속 흡수). CoinChip 동일 호흡.
          initial={{
            x: coords.source.x,
            y: coords.source.y,
            scale: 1,
            opacity: 0,
          }}
          animate={{
            x: [coords.source.x, midX(coords), coords.target.x],
            y: [coords.source.y, apexY(coords), coords.target.y],
            scale: [1, 0.92, 0.2],
            opacity: [1, 1, 0],
          }}
          transition={{
            duration: ITEM_FLIGHT_SEC,
            times: [0, 0.45, 1],
            ease: ['backOut', 'easeInOut', 'backIn'],
          }}
          // 흡수가 끝나는 순간(= 인벤토리 도달) 가방에 빨려드는 'coin_pickup' 틱(드롭 수집과 동일 오디오 언어).
          onAnimationComplete={() => sound.playSfx('coin_pickup')}
        >
          {/* 아이콘 자체를 중앙 정렬 박스로 감싸 transform 원점(motion.div의 x/y)이 아이콘 중심이 되게 한다. */}
          <div className="-translate-x-1/2 -translate-y-1/2">
            <ItemIcon itemId={itemId} className={startSizeClass} />
          </div>
        </motion.div>
      )}
    </div>
  )
}

// 비행 중간 지점 — 출발/도착의 가로 중앙, 세로로는 둘 중 높은 쪽보다 더 위로 띄워 "쏙 떠올랐다 들어가는"
// 아치를 만든다(작은 위치 변화에서도 호가 보이도록 고정 오프셋을 더한다).
function midX(c: { source: Point; target: Point }): number {
  return (c.source.x + c.target.x) / 2
}
function apexY(c: { source: Point; target: Point }): number {
  return Math.min(c.source.y, c.target.y) - 36
}
