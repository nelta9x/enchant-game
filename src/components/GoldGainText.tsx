import { useRef, type RefObject } from 'react'
import { motion, type Transition } from 'motion/react'
import { formatGoldGain } from '../lib/format'
import { GOLD_GAIN_MS, goldTextSize, hasGoldGlow } from './goldGain'
import { OneShotOverlay } from './OneShotOverlay'
import { useRelativeCenter } from './useRelativeCenter'

// 골드 획득 플로팅 텍스트(프레젠테이션 전용). 게임 로직과 분리돼 'goldGain' 이벤트(재생 id + 획득 금액)
// 에만 반응한다. 장착 무기(검 박스) 위치에서 살짝 위로 "+금액"이 떠올라 살짝 커졌다 페이드아웃한다.
// 색은 황금색(--color-gold), 글자 크기는 획득 골드가 많을수록 커진다(goldTextSize — 순수 매핑).
//
// 좌표: CoinFlight 와 같은 방식 — 이 오버레이(absolute inset-0) 자신의 rect 를 origin 으로
// 검 박스 중심을 측정한다(카드 padding/border 만큼 어긋나지 않게).
//
// 'gold-gain' 은 판매·의뢰완료가 공유하는 단일 연출이라 출발점은 항상 검 박스(anchorRef)다 —
// 의뢰 완료는 코인이 의뢰 카드에서 날아오지만, 텍스트는 "장착 무기가 있던 위치"에 고정한다.

// 검 박스 중심에서 텍스트를 띄울 높이(px). 박스(h-52/h-60)는 스프라이트(h-36/h-40)보다 커서
// 박스 top 바로 위는 스프라이트에서 꽤 떨어진다 → 중심 기준으로 스프라이트 윗변 살짝 위에 오도록 끌어올린다.
const LIFT_PX = 104

export type GoldGainEvent = { id: number; amount: number }

export function GoldGainText({
  event,
  anchorRef,
}: {
  event: GoldGainEvent | null
  anchorRef: RefObject<HTMLDivElement | null>
}) {
  return (
    <OneShotOverlay event={event} lifetimeMs={GOLD_GAIN_MS}>
      {(active) => (
        <GoldGainBurst
          key={active.id}
          amount={active.amount}
          anchorRef={anchorRef}
        />
      )}
    </OneShotOverlay>
  )
}

// 한 번의 떠오름. key=event.id 로 마운트되며, 마운트 시점에 검 박스 중심을 "자신의 rect" 기준으로
// 1회 측정해 잡아둔다(useRelativeCenter — 이후 새 획득이 와도 이 인스턴스의 좌표는 고정 — 교체 중 튀지 않음).
function GoldGainBurst({
  amount,
  anchorRef,
}: {
  amount: number
  anchorRef: RefObject<HTMLDivElement | null>
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  // 좌표 확정 전엔 그리지 않아(null 가드) 원점 플래시가 없다.
  const origin = useRelativeCenter(rootRef, anchorRef)

  const size = goldTextSize(amount)
  const glow = hasGoldGlow(amount) // 100만+ 큰 획득은 텍스트 뒤 금색 광채를 함께 띄운다

  // 떠오름·페이드 타이밍 — 무리(글로우+텍스트)가 한 몸으로 움직이도록 공유한다.
  const RISE: Transition = {
    duration: GOLD_GAIN_MS / 1000,
    times: [0, 0.16, 0.72, 1], // ~0.21s~0.94s 동안 또렷이 머문 뒤 페이드(쾌감·인지)
    ease: ['backOut', 'easeOut', 'easeIn'],
  }

  return (
    <div ref={rootRef} className="absolute inset-0 overflow-visible">
      {origin && (
        // 정적 위치(검 박스 중심 위 LIFT_PX, 가로 중앙)는 바깥 div 가, 떠오름·페이드는 안쪽 motion 이 맡는다
        // (motion 이 transform 을 점유하므로 정적 translate 와 애니메이션 transform 을 레이어로 분리).
        <div
          className="absolute"
          style={{
            left: origin.x,
            top: origin.y - LIFT_PX,
            transform: 'translate(-50%, -50%)',
          }}
        >
          {/* 무리 전체의 떠오름(y) + 페이드(opacity) — 글로우와 텍스트가 함께 솟았다 사라진다. */}
          <motion.div
            className="relative flex items-center justify-center"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: [0, 1, 1, 0], y: [10, -8, -26, -58] }}
            transition={RISE}
          >
            {/* 금색 광채(100만+) — 텍스트 뒤에서 타원형으로 번지며 살짝 맥동한다(텍스트보다 먼저 그려 뒤로 깔림). */}
            {glow && (
              <motion.span
                aria-hidden
                className="pointer-events-none absolute rounded-full"
                style={{
                  left: '50%',
                  top: '50%',
                  width: size * 5,
                  height: size * 2.8,
                  marginLeft: -(size * 5) / 2,
                  marginTop: -(size * 2.8) / 2,
                  background:
                    'radial-gradient(ellipse, color-mix(in srgb, var(--color-gold-glow) 65%, transparent), transparent 70%)',
                }}
                initial={{ scale: 0.7 }}
                animate={{ scale: [0.7, 1.12, 1.05, 1] }}
                transition={RISE}
              />
            )}
            <motion.span
              className="relative block whitespace-nowrap font-extrabold tabular-nums"
              style={{
                fontSize: size,
                color: 'var(--color-gold)',
                // 어두운 그림자 + 황금 글로우 — 따뜻한 배경 위에서도 또렷하게. 100만+는 금색 광휘를 더 짙게 덧입힌다.
                textShadow: glow
                  ? '0 2px 6px rgba(0,0,0,0.5), 0 0 14px var(--color-gold-glow), 0 0 28px var(--color-gold-glow), 0 0 48px color-mix(in srgb, var(--color-gold) 60%, transparent)'
                  : '0 2px 6px rgba(0,0,0,0.45), 0 0 16px var(--color-gold-glow)',
              }}
              initial={{ scale: 0.5 }}
              animate={{ scale: [0.5, 1.15, 1, 1] }}
              transition={RISE}
            >
              {formatGoldGain(amount)}
            </motion.span>
          </motion.div>
        </div>
      )}
    </div>
  )
}
