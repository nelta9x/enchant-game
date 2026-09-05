import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { onFxDone, playFx } from '../lib/fx'
import { COIN_FLIGHT_SEC, type CoinSpec, type Point } from './coins'

// 검(출발점)에서 튀어올라 잠깐 체공한 뒤 목표(골드창·인벤토리)로 빨려 드는 비행 칩 — 코인·아이템·검 비행 공용.
// 궤적은 순수 스펙(CoinSpec)이 정하고, 재생은 WAAPI(lib/fx)로 컴포지터가 단독으로 돈다(칩 수십 개가 날아도 메인 스레드
// 프레임 비용 0). 마운트 시 한 번 재생하고 완료(onComplete — 착지음)를 알린다. 초기 스타일은 첫 키프레임과 같게 두어
// 애니메이션이 걸리기 전 한 프레임도 비치지 않는다.
export function FlightChip({
  spec,
  source,
  target,
  onComplete,
  children,
}: {
  spec: CoinSpec
  source: Point
  target: Point
  onComplete?: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const apexX = source.x + Math.cos(spec.angle) * spec.rise
    const apexY = source.y + Math.sin(spec.angle) * spec.rise // sin<0 → 위쪽
    const hoverX = apexX + spec.drift
    const hoverY = apexY + spec.settle
    const anim = playFx(ref.current, {
      channels: {
        x: [source.x, apexX, hoverX, target.x],
        y: [source.y, apexY, hoverY, target.y],
        scale: [0.3, 1.18, 1.05, 0.16], // 통 튀고 → 체공 → 휙 흡수되며 작아짐
        opacity: [0, 1, 1, 0], // 빨려드는 끝에서야 사라짐(체공 동안은 또렷)
      },
      durationSec: COIN_FLIGHT_SEC,
      delaySec: spec.stagger,
      times: [0, 0.15, spec.hold, 1],
      ease: ['backOut', 'easeInOut', 'backIn'],
    })
    if (onComplete) onFxDone(anim, onComplete)
    // 스펙·좌표는 마운트 시점 값으로 1회 재생 — 부모 리렌더로 재시작하지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div
      ref={ref}
      className="fx-layer absolute left-0 top-0"
      style={{ opacity: 0, transform: `translate(${source.x}px, ${source.y}px) scale(0.3)` }}
    >
      {/* transform 원점(x/y)이 콘텐츠 중심이 되도록 중앙 정렬 박스로 감싼다. */}
      <div className="-translate-x-1/2 -translate-y-1/2">{children}</div>
    </div>
  )
}

// 분출 섬광 — 출발점에서 코인/아이템이 터져 나오는 순간의 황금 번쩍임(짧게 커지며 사라짐).
export function LaunchFlare({ at }: { at: Point }) {
  const ref = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    playFx(ref.current, {
      channels: { scale: [0.3, 1.25], opacity: [0, 0.9, 0] },
      durationSec: 0.4,
      ease: 'easeOut',
    })
  }, [])
  return (
    <span
      ref={ref}
      className="fx-layer absolute rounded-full"
      style={{
        left: at.x,
        top: at.y,
        width: 150,
        height: 150,
        marginLeft: -75,
        marginTop: -75,
        opacity: 0,
        background:
          'radial-gradient(circle, color-mix(in srgb, var(--color-gold-glow) 80%, transparent), transparent 70%)',
      }}
    />
  )
}
