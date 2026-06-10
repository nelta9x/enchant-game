import { motion } from 'motion/react'

// 회전하는 마법진 룬 — 바깥 링(시계방향, 8방향 눈금)과 안쪽 점선/원(반시계)이 엇갈려 도는 결계.
// 색은 currentColor 로 받는다(부모가 상태색으로 물들인다) → 보호 결계(ProtectionWard)와 강화 성공률
// 결계(SuccessRateSigil)가 같은 마법진을 공유한다. 64x64 viewBox 기준(부모 박스 크기에 맞춰 스케일).
export function SigilRunes() {
  return (
    <>
      <motion.div
        aria-hidden
        className="absolute inset-0"
        animate={{ rotate: 360 }}
        transition={{ duration: 26, repeat: Infinity, ease: 'linear' }}
      >
        <svg
          viewBox="0 0 64 64"
          className="h-full w-full"
          fill="none"
          stroke="currentColor"
        >
          <circle cx="32" cy="32" r="29" strokeWidth="1.4" opacity="0.85" />
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i * Math.PI) / 4
            return (
              <line
                key={i}
                x1={32 + 25 * Math.cos(a)}
                y1={32 + 25 * Math.sin(a)}
                x2={32 + 29 * Math.cos(a)}
                y2={32 + 29 * Math.sin(a)}
                strokeWidth="1.4"
              />
            )
          })}
        </svg>
      </motion.div>
      <motion.div
        aria-hidden
        className="absolute inset-0"
        animate={{ rotate: -360 }}
        transition={{ duration: 19, repeat: Infinity, ease: 'linear' }}
      >
        <svg
          viewBox="0 0 64 64"
          className="h-full w-full"
          fill="none"
          stroke="currentColor"
        >
          <circle
            cx="32"
            cy="32"
            r="22"
            strokeWidth="1"
            strokeDasharray="3 3"
            opacity="0.7"
          />
          <circle cx="32" cy="32" r="15" strokeWidth="0.8" opacity="0.5" />
        </svg>
      </motion.div>
    </>
  )
}
