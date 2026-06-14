import { type ReactNode } from 'react'
import { motion } from 'motion/react'
import { COIN_FLIGHT_SEC, type CoinSpec, type Point } from './coins'

// 인벤토리로 빨려 드는 "비행 칩 1개"의 공유 모션 프리미티브 — 코인 다발(CoinFlight)과 아이콘
// 1장(ItemFlight)이 같은 안무를 쓰도록 모션을 한 곳에 둔다. 곡선을 두 곳에 재구현하면 두 연출이
// 미세하게 어긋난다 — 위치·크기·투명도 곡선을 공유해야만 "통 튀어 떠 있다 → 휙 빨려듦"이 일관되게 보인다.
//
// 안무(코인·아이템 공통): 출발점에서 위로 흩뿌려 "튀어올라"(backOut 바운스) 잠시 체공하다,
// 도착점 반대로 살짝 당겼다(backIn anticipation) 급가속하며 빨려 들어간다. (DOTween 의 DOPunchPosition
// (elastic) + DOMove(InBack) 표준 기법을 Motion 내장 backOut/backIn 으로 옮긴 것)
//
// 회전은 없다 — 코인·아이템 모두 회전 없이 튀어올라 체공 후 곧장 빨려든다(위치·크기·투명도 곡선만 공유).
//
// 무엇이 나는지(코인 PNG·ItemIcon)는 children 으로 주입받는다(프레젠테이션 슬롯). 흩뿌림 각도·
// 체공·방출 지연은 spec(CoinSpec)으로 결정한다(코인은 makeCoins 로 다발, 아이템은 1개 spec).
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
  // 튀어오름 정점(출발점 위쪽). 정점에서 옆으로 분산·가라앉으며 잠시 체공한 뒤 도착점으로 흡수.
  const apexX = source.x + Math.cos(spec.angle) * spec.rise
  const apexY = source.y + Math.sin(spec.angle) * spec.rise // sin<0 → 위쪽
  const hoverX = apexX + spec.drift
  const hoverY = apexY + spec.settle

  return (
    <motion.div
      className="absolute left-0 top-0"
      initial={{ x: source.x, y: source.y, scale: 0, opacity: 0 }}
      animate={{
        x: [source.x, apexX, hoverX, target.x],
        y: [source.y, apexY, hoverY, target.y],
        scale: [0.3, 1.18, 1.05, 0.16], // 통 튀고 → 체공 → 휙 흡수되며 작아짐
        opacity: [0, 1, 1, 0], // 빨려드는 끝에서야 사라짐(체공 동안은 또렷)
      }}
      transition={{
        delay: spec.stagger,
        duration: COIN_FLIGHT_SEC,
        // 튀어오름(0~15%, backOut 바운스) → 체공(~hold, 칩마다 다름) → 당겼다 급가속 흡수(backIn).
        times: [0, 0.15, spec.hold, 1],
        ease: ['backOut', 'easeInOut', 'backIn'],
      }}
      onAnimationComplete={onComplete}
    >
      {/* transform 원점(motion.div 의 x/y)이 콘텐츠 중심이 되도록 중앙 정렬 박스로 감싼다. */}
      <div className="-translate-x-1/2 -translate-y-1/2">{children}</div>
    </motion.div>
  )
}

// 비행 출발 순간의 황금 분출 섬광(요소 1개, 가볍다) — 코인 다발(CoinFlight)과 아이콘 1장(ItemFlight)이
// 같은 번쩍임을 쓰도록 칩과 함께 이 모듈에 둔다(두 곳에 재구현하면 크기·곡선이 어긋난다).
export function LaunchFlare({ at }: { at: Point }) {
  return (
    <motion.span
      className="absolute rounded-full"
      style={{
        left: at.x,
        top: at.y,
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
  )
}
