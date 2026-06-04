import { AnimatePresence, motion } from 'motion/react'
import { ParticleBurst } from './ParticleBurst'
import { useOneShot } from './useOneShot'
import { PARTICLE_DUR } from './particles'

// 강화 성공 연출(프레젠테이션 전용). 'successBurst' 이벤트(id + 파티클 수)에만 반응해
// 황금빛 파티클이 검에서 즉시 사방으로 터진다(떨림·잔상 없음). 파티클 수는 단계에 비례.
export type SuccessEvent = { id: number; particleCount: number }

// 성공 연출 길이(ms). 파티클이 즉시(delay 0) 분출하므로 PARTICLE_DUR 가 곧 길이(+여유).
export const SUCCESS_DURATION_MS = PARTICLE_DUR * 1000 + 60

export function SuccessEffect({ event }: { event: SuccessEvent | null }) {
  const active = useOneShot(event, SUCCESS_DURATION_MS)

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-visible"
      aria-hidden
    >
      <AnimatePresence>
        {active && (
          <motion.div
            key={active.id}
            className="absolute inset-0"
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
          >
            <ParticleBurst
              count={active.particleCount}
              coreVar="var(--color-gold-glow)"
              edgeVar="var(--color-gold)"
              delaySec={0}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
