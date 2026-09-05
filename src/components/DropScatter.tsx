import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react'
import { onFxDone, playFx } from '../lib/fx'
import { sound } from '../lib/sound'
import { ItemIcon } from './ItemIcon'
import {
  dropAutoAtSec,
  DROP_FLIGHT_SEC,
  DROP_IN_SEC,
  dropLifetimeMs,
  makeDropTokens,
  type DropTokenSpec,
  type Point,
} from './drops'
import { OneShotOverlay } from './OneShotOverlay'
import { useRelativeCenter } from './useRelativeCenter'

// 파괴 드롭 흩뿌림 — 폭발이 드러난 직후(appearDelaySec) 재료 토큰들이 검 아래로 우르르 떨어져 바닥에 머물다가,
// 마우스를 대거나(hover/pointerdown) 머무는 시간이 끝나면 인벤토리로 빨려 든다. 토큰이 도착할 때마다 onCollect 로
// 실제 수량을 반영하고, 연출 수명이 끝나면(onExpire) 미수집분을 호출 측이 flush 한다.
export type DropEvent = {
  id: number
  drops: { itemId: string; count: number }[]
  appearDelaySec: number
}

export function DropScatter({
  event,
  sourceRef,
  targetRef,
  onCollect,
  onExpire,
}: {
  event: DropEvent | null
  sourceRef: RefObject<HTMLDivElement | null>
  targetRef: RefObject<HTMLDivElement | null>
  onCollect: (itemId: string, count: number) => void
  onExpire?: () => void
}) {
  return (
    <OneShotOverlay
      event={event}
      lifetimeMs={event ? dropLifetimeMs(event.appearDelaySec) : 0}
      onExpire={onExpire}
    >
      {(active) => (
        <DropPile
          key={active.id}
          drops={active.drops}
          appearDelaySec={active.appearDelaySec}
          sourceRef={sourceRef}
          targetRef={targetRef}
          onCollect={onCollect}
        />
      )}
    </OneShotOverlay>
  )
}

function DropPile({
  drops,
  appearDelaySec,
  sourceRef,
  targetRef,
  onCollect,
}: {
  drops: { itemId: string; count: number }[]
  appearDelaySec: number
  sourceRef: RefObject<HTMLDivElement | null>
  targetRef: RefObject<HTMLDivElement | null>
  onCollect: (itemId: string, count: number) => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const source = useRelativeCenter(rootRef, sourceRef)
  const target = useRelativeCenter(rootRef, targetRef)
  // 머무는 시간이 끝나면 남은 토큰을 한꺼번에 자동 수집한다.
  const [autoCollect, setAutoCollect] = useState(false)
  const [done, setDone] = useState<ReadonlySet<number>>(() => new Set())
  useEffect(() => {
    const tid = setTimeout(
      () => setAutoCollect(true),
      dropAutoAtSec(appearDelaySec) * 1000,
    )
    return () => clearTimeout(tid)
  }, [appearDelaySec])

  const tokens = useMemo(() => makeDropTokens(drops), [drops])

  return (
    <div ref={rootRef} className="absolute inset-0 overflow-visible">
      {source &&
        target &&
        tokens.map((spec, i) =>
          done.has(i) ? null : (
            <DropToken
              key={i}
              spec={spec}
              appearDelaySec={appearDelaySec}
              source={source}
              target={target}
              autoCollect={autoCollect}
              onCollected={() => {
                // 인벤토리 도착 시 실제 수집 반영(이 토큰이 대표하는 수량만큼) + 노드 정리.
                onCollect(spec.itemId, spec.count)
                setDone((s) => new Set(s).add(i))
              }}
            />
          ),
        )}
    </div>
  )
}

// 토큰 하나 — 낙하(검 중심 → 바닥 rest, backOut)와 수집(rest → 호를 그리며 인벤토리, 회전하며 축소)을 WAAPI 로 재생한다.
// 수집이 낙하 도중에 시작되면 낙하 애니메이션은 취소되고 rest 에서 출발한다(짧은 점프 — 드문 경우, 무해).
function DropToken({
  spec,
  appearDelaySec,
  source,
  target,
  autoCollect,
  onCollected,
}: {
  spec: DropTokenSpec
  appearDelaySec: number
  source: Point
  target: Point
  autoCollect: boolean
  onCollected: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState(false)
  const collecting = hovered || autoCollect
  const restX = source.x + spec.dx
  const restY = source.y + spec.dy

  // 낙하: 마운트 1회.
  useLayoutEffect(() => {
    playFx(ref.current, {
      channels: {
        x: [source.x, restX],
        y: [source.y, restY],
        scale: [0.4, 1],
        opacity: [0, 1],
      },
      durationSec: DROP_IN_SEC,
      delaySec: appearDelaySec + spec.inStagger,
      ease: 'backOut',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 수집: collecting 이 켜지는 순간 1회 — 도착하면 착지음 + 수집 반영.
  const onCollectedRef = useRef(onCollected)
  useEffect(() => {
    onCollectedRef.current = onCollected
  })
  useEffect(() => {
    if (!collecting) return
    const anim = playFx(ref.current, {
      channels: {
        x: [restX, restX + spec.drift, target.x],
        y: [restY, restY - spec.rise, target.y],
        scale: [1, 1.12, 0.2],
        opacity: [1, 1, 0],
        rotate: [0, spec.spin * 120, spec.spin * 420],
      },
      durationSec: DROP_FLIGHT_SEC,
      times: [0, 0.35, 1],
      ease: ['easeOut', 'easeIn'],
    })
    onFxDone(anim, () => {
      sound.playSfx('coin_pickup')
      onCollectedRef.current()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collecting])

  return (
    <div
      ref={ref}
      className="fx-layer absolute left-0 top-0 select-none"
      style={{
        width: spec.size,
        height: spec.size,
        marginLeft: -spec.size / 2,
        marginTop: -spec.size / 2,
        pointerEvents: collecting ? 'none' : 'auto',
        cursor: 'pointer',
        opacity: 0,
        transform: `translate(${source.x}px, ${source.y}px) scale(0.4)`,
      }}
      onPointerEnter={() => setHovered(true)}
      onPointerDown={() => setHovered(true)}
    >
      <ItemIcon itemId={spec.itemId} className="h-full w-full" />
    </div>
  )
}
