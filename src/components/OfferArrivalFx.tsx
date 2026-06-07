import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useT } from '../i18n'
import { useOfferFxStore } from '../store/offerFxStore'

// 거래 제안 "도착 연출" — CommissionBar 의 가운데 카드 컨테이너(relative) 위에 깔리는 오버레이.
// offerFxStore.nonce 가 바뀔 때(새 제안 도착) 글로우 펄스 + 토스트를 동시에 1회 재생한다.
// pointer-events-none·aria-hidden 오버레이라 카드 클릭/납품을 막지 않는다(연출 전용).

const VISIBLE_MS = 2600 // 연출이 떠 있는 창(내부 애니메이션은 이 안에서 끝난다)

export function OfferArrivalFx() {
  const t = useT()
  const nonce = useOfferFxStore((s) => s.nonce)
  // 마지막으로 해제(VISIBLE_MS 경과)한 nonce. playing 은 렌더 중 파생 — 효과 본체에서 setState 하지 않는다.
  const [dismissed, setDismissed] = useState(0)
  // 화면에 떠 있는 "재생 인스턴스". nonce 가 곧 React key 라 재발화 시 처음부터 다시 그린다.
  const playing = nonce > 0 && nonce !== dismissed ? nonce : null

  useEffect(() => {
    if (nonce === 0 || nonce === dismissed) return
    // setState 는 타이머 콜백(비동기) 안에서만 — 효과 본체는 예약만 한다(cascading render 회피).
    const id = setTimeout(() => setDismissed(nonce), VISIBLE_MS)
    return () => clearTimeout(id)
  }, [nonce, dismissed])

  return (
    <div
      className="pointer-events-none absolute inset-0 z-20 overflow-visible"
      aria-hidden
    >
      <AnimatePresence>
        {playing !== null && (
          <ToastGlowFx key={playing} label={t('commission.arrived')} />
        )}
      </AnimatePresence>
    </div>
  )
}

// 토스트 + 글로우 펄스 합성. 카드 영역이 황금빛으로 숨 쉬고, 동시에 상단에서 종과 함께 토스트가 내려온다.
function ToastGlowFx({ label }: { label: string }) {
  return (
    <>
      <GlowFx />
      <ToastFx label={label} />
    </>
  )
}

// 글로우 펄스 — 카드 영역을 감싸는 황금 글로우가 두 번 숨 쉬듯 부풀었다 사라진다 + 테두리 링.
function GlowFx() {
  return (
    <>
      <motion.div
        className="absolute inset-0 rounded-lg"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--color-gold) 55%, transparent) 0%, transparent 70%)',
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.9, 0.3, 0.8, 0] }}
        exit={{ opacity: 0 }}
        transition={{ duration: 2.2, ease: 'easeInOut', times: [0, 0.2, 0.5, 0.7, 1] }}
      />
      <motion.div
        className="absolute inset-0 rounded-lg ring-2 ring-gold"
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: [0, 1, 0], scale: [0.98, 1.01, 1.04] }}
        exit={{ opacity: 0 }}
        transition={{ duration: 1, ease: 'easeOut' }}
      />
    </>
  )
}

// 토스트 — 바 상단 중앙에서 종 아이콘과 함께 미끄러져 내려왔다 다시 올라가 사라진다.
function ToastFx({ label }: { label: string }) {
  return (
    <motion.div
      className="absolute left-1/2 top-0 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-gold/60 bg-panel px-3 py-1 text-xs font-bold text-gold shadow-[0_4px_16px_-4px_var(--color-gold)]"
      initial={{ opacity: 0, y: -28, scale: 0.9 }}
      animate={{ opacity: [0, 1, 1, 0], y: [-28, -10, -10, -28], scale: [0.9, 1, 1, 0.95] }}
      exit={{ opacity: 0 }}
      transition={{ duration: 2.4, ease: 'easeOut', times: [0, 0.15, 0.8, 1] }}
    >
      <motion.span
        animate={{ rotate: [0, -18, 14, -10, 8, 0] }}
        transition={{ duration: 0.7, ease: 'easeInOut', delay: 0.15 }}
        style={{ originY: 0 }}
      >
        <BellIcon />
      </motion.span>
      {label}
    </motion.div>
  )
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
      <path d="M12 2a2 2 0 0 0-2 2v.6A6 6 0 0 0 6 10v3l-1.4 2.1A1 1 0 0 0 5.4 17h13.2a1 1 0 0 0 .8-1.9L18 13v-3a6 6 0 0 0-4-5.4V4a2 2 0 0 0-2-2Zm0 20a3 3 0 0 0 2.8-2H9.2A3 3 0 0 0 12 22Z" />
    </svg>
  )
}
