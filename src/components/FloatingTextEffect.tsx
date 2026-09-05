import { useLayoutEffect, useRef, useState } from 'react'
import { useT } from '../i18n'
import type { TranslationKey } from '../i18n/locales/ko'
import { playFx } from '../lib/fx'
import {
  FLOAT_ANIM_SEC,
  floatingTextMs,
  FT_WOBBLE_DEG,
  pickSpawn,
} from './floatingText'
import { OneShotOverlay } from './OneShotOverlay'

// 강화 결과 플로팅 텍스트("아이구!…" 등) — 검 중상단 임의 지점에서 팝업 → 체공 → 상승·페이드. 등장 시각(delaySec)은
// 떨림이 끝나는 burstAt 에 맞춘다(GameScreen 이 타임라인에서 도출). 표시 문구는 i18n 키(데이터 기반)로 받는다.
export type FloatingTextEvent = {
  id: number
  textKey: TranslationKey
  delaySec: number
}

export function FloatingTextEffect({
  event,
}: {
  event: FloatingTextEvent | null
}) {
  return (
    <OneShotOverlay
      event={event}
      lifetimeMs={event ? floatingTextMs(event.delaySec) : 0}
      className="z-50 flex items-center justify-center"
    >
      {(active) => (
        <FloatingTextBurst
          key={active.id}
          textKey={active.textKey}
          delaySec={active.delaySec}
        />
      )}
    </OneShotOverlay>
  )
}

// 이동·팝업·페이드(바깥 span)와 흔들림 회전(안쪽 span)은 타임라인이 달라 요소를 나눠 각각 WAAPI 로 건다 — 두 연출
// 모두 컴포지터 전용(transform·opacity)이라 체공 내내 메인 스레드 비용이 없다. 스폰 위치·흐름·흔들림 방향은 마운트 1회 추첨.
function FloatingTextBurst({
  textKey,
  delaySec,
}: {
  textKey: TranslationKey
  delaySec: number
}) {
  const t = useT()
  const [spawn] = useState(() => pickSpawn())
  const outerRef = useRef<HTMLSpanElement>(null)
  const innerRef = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const tilt = spawn.wobble * FT_WOBBLE_DEG // 흔들림 시작 각도(부호=방향)
    playFx(outerRef.current, {
      channels: {
        x: [
          spawn.x,
          spawn.x + spawn.driftX * 0.5,
          spawn.x + spawn.driftX * 0.85,
          spawn.x + spawn.driftX,
        ],
        y: [spawn.y, spawn.y - 6, spawn.y - 22, spawn.y - 44],
        scale: [0.5, 1.12, 1, 1],
        opacity: [0, 1, 1, 0],
      },
      durationSec: FLOAT_ANIM_SEC,
      delaySec,
      times: [0, 0.18, 0.7, 1], // ~체공 후 페이드(쾌감·인지)
      ease: ['backOut', 'easeOut', 'easeIn'],
    })
    // 흔들림 — 감쇠하며 0 으로 수렴(앞 절반 동안), 뒤 절반은 정지.
    playFx(innerRef.current, {
      channels: { rotate: [tilt, -tilt * 0.65, tilt * 0.4, -tilt * 0.2, 0] },
      durationSec: FLOAT_ANIM_SEC / 2, // 회전은 전체의 앞 절반 동안만 — 뒤 절반은 0 에 머문다(fill both)
      delaySec,
      times: [0, 0.24, 0.48, 0.72, 1],
      ease: 'easeOut',
    })
  }, [spawn, delaySec])
  return (
    <span
      ref={outerRef}
      className="fx-layer block whitespace-nowrap text-2xl font-extrabold"
      style={{ color: 'var(--color-floating-text)', opacity: 0 }}
    >
      <span ref={innerRef} className="fx-layer block">
        {t(textKey)}
      </span>
    </span>
  )
}
