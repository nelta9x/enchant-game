import { useMemo, useRef, type RefObject } from 'react'
import { sound } from '../lib/sound'
import { COIN_FLIGHT_MS, makeCoins } from './coins'
import { FlightChip, LaunchFlare } from './FlightChip'
import { ItemIcon } from './ItemIcon'
import { OneShotOverlay } from './OneShotOverlay'
import { useRelativeCenter } from './useRelativeCenter'

// 아이템/검이 인벤토리로 "쏙" 빨려 들어가는 연출(프레젠테이션 전용). 게임 로직과 분리되어
// 'itemFlight' 이벤트(재생 id + itemId)에만 반응한다 — 골드(코인) 비행과 거의 같은 안무를 쓴다:
// 같은 분출 섬광(LaunchFlare) + 같은 비행 칩(FlightChip). 코인과 갈리는 점은 둘 — (1) 코인 다발 대신
// 아이콘 1장이 난다(아이템은 단일 객체라 칩 1개), (2) 회전을 끈다(아래 spin=false — 검·아이템이
// 공중제비 도는 게 어색해서. 코인만 빛 반사하듯 돈다). 그 외 위치·크기·투명도 곡선은 코인과 공유한다.
//
// 출발점은 상황마다 다르다: 보관·장착은 검 박스, 의뢰 아이템 보상은 클릭한 카드(고정 anchor).
// 도착점은 항상 인벤토리 패널이다(골드는 그 안의 골드창으로 가지만 아이템은 목록으로 — "동일"은
// 안무를 뜻하고 도착지가 아니다). 좌표는 이 오버레이(absolute inset-0) 자신의 rect 기준으로
// 측정한다(useRelativeCenter — 카드의 padding/border 만큼 어긋나지 않도록).
//
// 무엇이 나는지는 ItemIcon 이 해석한다(검 스프라이트·아이템 스프라이트·토큰 폴백 모두 처리).
// 검의 itemId 는 sword id 라 그대로 검 스프라이트로 그려진다.

// ── 연출 타이밍 — 골드(코인) 비행과 같은 길이를 공유한다(동일 안무 = 동일 타이밍). enqueueEffect
//    의 durationMs · useOneShot 수명이 이 값을 쓴다. 단일 출처는 coins.ts(COIN_FLIGHT_MS). ──
export const ITEM_FLIGHT_MS = COIN_FLIGHT_MS

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
  return (
    <OneShotOverlay event={event} lifetimeMs={ITEM_FLIGHT_MS}>
      {(active) => (
        <FlyingItem
          key={active.id}
          itemId={active.itemId}
          sourceRef={sourceRef}
          targetRef={targetRef}
          startSizeClass={startSizeClass}
        />
      )}
    </OneShotOverlay>
  )
}

// 한 번의 비행. key=event.id 로 마운트되며, 마운트 시점에 출발/도착 좌표를 "자신의 rect" 기준으로
// 한 번 측정해 잡아둔다(useRelativeCenter — 이후 새 비행이 와도 이 인스턴스의 좌표는 고정 — 교체 중 튀지 않음).
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
  // 좌표가 확정되기 전엔 아이콘을 그리지 않아(null 가드) 출발점에서 깜빡 나타나는 원점 플래시가 없다.
  const source = useRelativeCenter(rootRef, sourceRef)
  const target = useRelativeCenter(rootRef, targetRef)

  // 아이템은 단일 객체 → 칩 1개. makeCoins(1) 이 주는 결정적 단일 spec(정중앙 위로 튀어오르는 분출
  // 파라미터)을 그대로 써 골드 다발의 한 칩과 같은 분출 곡선을 공유한다(Math.random 없이 결정적).
  // 단 spec.spin(회전)은 안 쓴다 — 아래 FlightChip 에 spin=false 라 회전 키프레임이 빠진다.
  const spec = useMemo(() => makeCoins(1)[0], [])

  return (
    <div ref={rootRef} className="absolute inset-0 overflow-visible">
      {source && target && (
        <>
          {/* 분출 섬광 — 골드 비행과 동일한 황금 번쩍임(출발 순간 1회, LaunchFlare 공유). */}
          <LaunchFlare at={source} />
          {/* 비행 칩 1개에 아이콘을 실어 보낸다 — 골드 코인과 같은 안무·타이밍(FlightChip 공유). */}
          <FlightChip
            spec={spec}
            source={source}
            target={target}
            // 검·아이템은 회전 없이 곧장 빨려든다(코인만 빛 반사하듯 돈다 — FlightChip spin 기본 true).
            spin={false}
            // 흡수가 끝나는 순간(= 인벤토리 도달) 가방에 빨려드는 'coin_pickup' 틱(드롭 수집·코인과 동일 오디오 언어).
            onComplete={() => sound.playSfx('coin_pickup')}
          >
            <ItemIcon itemId={itemId} className={startSizeClass} />
          </FlightChip>
        </>
      )}
    </div>
  )
}
