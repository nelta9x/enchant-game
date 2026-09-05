import { useLayoutEffect, useRef, type RefObject } from 'react'
import { playFx, type FxSpec } from '../lib/fx'
import { formatGoldGain } from '../lib/format'
import { GOLD_GAIN_MS, goldTextSize, hasGoldGlow } from './goldGain'
import { OneShotOverlay } from './OneShotOverlay'
import { useRelativeCenter } from './useRelativeCenter'

// 텍스트가 검 박스 중심에서 위로 얼마나 떨어져 시작하는지(px) — 스프라이트 위쪽 여백에 뜬다.
const LIFT_PX = 104

// 골드 획득 플로팅 텍스트("+금액") — 판매·의뢰 완료가 공유한다. 검 박스 위 황금색으로 떠오르며, 글자 크기는 획득
// 골드에 비례(goldTextSize), 100만+ 는 뒤에 금색 광채를 함께 띄운다(hasGoldGlow). id 단조 증가로 연타도 재생.
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

// 무리 전체의 떠오름·페이드(바깥)와 글로우·텍스트의 팝업 스케일(안쪽 둘)을 같은 타임라인(RISE)으로 WAAPI 재생한다.
function GoldGainBurst({
  amount,
  anchorRef,
}: {
  amount: number
  anchorRef: RefObject<HTMLDivElement | null>
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const origin = useRelativeCenter(rootRef, anchorRef)
  const size = goldTextSize(amount)
  const glow = hasGoldGlow(amount) // 100만+ 큰 획득은 텍스트 뒤 금색 광채를 함께 띄운다
  const riseRef = useRef<HTMLDivElement>(null)
  const glowRef = useRef<HTMLSpanElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    if (!origin) return
    const rise = (channels: FxSpec['channels']): FxSpec => ({
      channels,
      durationSec: GOLD_GAIN_MS / 1000,
      times: [0, 0.16, 0.72, 1], // ~0.21s~0.94s 동안 또렷이 머문 뒤 페이드(쾌감·인지)
      ease: ['backOut', 'easeOut', 'easeIn'],
    })
    playFx(riseRef.current, rise({ opacity: [0, 1, 1, 0], y: [10, -8, -26, -58] }))
    playFx(glowRef.current, rise({ scale: [0.7, 1.12, 1.05, 1] }))
    playFx(textRef.current, rise({ scale: [0.5, 1.15, 1, 1] }))
  }, [origin])
  return (
    <div ref={rootRef} className="absolute inset-0 overflow-visible">
      {origin && (
        <div
          className="absolute"
          style={{
            left: origin.x,
            top: origin.y - LIFT_PX,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <div
            ref={riseRef}
            className="fx-layer relative flex items-center justify-center"
            style={{ opacity: 0 }}
          >
            {/* 금색 광채(100만+) — 텍스트 뒤에서 타원형으로 번지며 살짝 맥동한다(텍스트보다 먼저 그려 뒤로 깔림). */}
            {glow && (
              <span
                ref={glowRef}
                aria-hidden
                className="fx-layer pointer-events-none absolute rounded-full"
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
              />
            )}
            <span
              ref={textRef}
              className="fx-layer relative block whitespace-nowrap font-extrabold tabular-nums"
              style={{
                fontSize: size,
                color: 'var(--color-gold)',
                textShadow: glow
                  ? '0 2px 6px rgba(0,0,0,0.5), 0 0 14px var(--color-gold-glow), 0 0 28px var(--color-gold-glow), 0 0 48px color-mix(in srgb, var(--color-gold) 60%, transparent)'
                  : '0 2px 6px rgba(0,0,0,0.45), 0 0 16px var(--color-gold-glow)',
              }}
            >
              {formatGoldGain(amount)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
