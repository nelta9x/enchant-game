import { useMemo } from 'react'
import { motion } from 'motion/react'
import { makeParticles, PARTICLE_DUR } from './particles'

// 중심에서 사방으로 터지는 파티클 + 충격파 링 + 섬광. 색·개수·시작 지연을 받아
// 파괴(적색·떨림 후 분출)와 성공(금색·즉시 분출)이 공용으로 쓴다.
// 부모의 정중앙(left-1/2 top-1/2)에서 방출되도록 절대 배치한다.
type ParticleBurstProps = {
  count: number // 파티클 수(강화 단계에 비례)
  coreVar: string // 밝은 코어 색(예: 'var(--color-danger-glow)')
  edgeVar: string // 가장자리 색(예: 'var(--color-danger)')
  delaySec: number // 분출 시작 지연(파괴=떨림 길이, 성공=0)
}

export function ParticleBurst({
  count,
  coreVar,
  edgeVar,
  delaySec,
}: ParticleBurstProps) {
  const particles = useMemo(() => makeParticles(count), [count])

  return (
    <div className="absolute left-1/2 top-1/2">
      {/* 섬광(터지는 순간 짧게) */}
      <motion.span
        className="absolute h-32 w-32 rounded-full"
        style={{
          marginLeft: '-4rem',
          marginTop: '-4rem',
          background: `radial-gradient(circle, color-mix(in srgb, ${coreVar} 75%, transparent), transparent 70%)`,
        }}
        initial={{ scale: 0.3, opacity: 0 }}
        animate={{ scale: 1.1, opacity: [0, 0.85, 0] }}
        transition={{ delay: delaySec, duration: 0.45, ease: 'easeOut' }}
      />

      {/* 충격파 링 */}
      <motion.span
        className="absolute h-40 w-40 rounded-full border-2"
        style={{
          marginLeft: '-5rem',
          marginTop: '-5rem',
          borderColor: edgeVar,
        }}
        initial={{ scale: 0.1, opacity: 0.7 }}
        animate={{ scale: 1, opacity: 0 }}
        transition={{ delay: delaySec, duration: 0.5, ease: 'easeOut' }}
      />

      {/* 파티클 — 사방으로 분출 */}
      {particles.map((p, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full"
          style={{
            width: p.size,
            height: p.size,
            marginLeft: -p.size / 2,
            marginTop: -p.size / 2,
            background: `radial-gradient(circle, ${coreVar}, ${edgeVar})`,
            boxShadow: `0 0 6px ${coreVar}`,
          }}
          initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
          animate={{
            x: p.x,
            y: p.y,
            opacity: [0, 1, 1, 0],
            scale: [0.4, 1, 0.9, 0.45],
          }}
          transition={{
            delay: delaySec + p.stagger,
            duration: PARTICLE_DUR,
            times: [0, 0.15, 0.6, 1],
            ease: 'easeOut',
          }}
        />
      ))}
    </div>
  )
}
