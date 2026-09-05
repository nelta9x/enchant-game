import { createContext, useCallback, useContext, type RefObject } from 'react'
import type { Particle } from './particles'

// 효과 캔버스(EffectCanvas)의 방출 인터페이스 — 소비자(BurstEmitter·HitSparkTrigger)는 이 컨텍스트로 캔버스 시스템에
// "터뜨려라"만 전한다. 컨텍스트 값은 ref 라 캔버스 마운트/언마운트가 소비자를 리렌더하지 않고, 캔버스가 없으면
// (데이터 플래그 off) 호출은 자동 no-op 이다. 컴포넌트가 아닌 모듈(react-refresh 규칙).

// 성공/파괴 도트 버스트 명세 — 좌표(makeParticles)와 색(CSS var 또는 색 문자열).
export type ParticleEmitSpec = {
  particles: Particle[] // 중심에서 사방으로 튀는 좌표(makeParticles)
  coreVar: string // 밝은 코어 색(CSS var 또는 색 문자열)
  edgeVar: string // 가장자리 색
}

export type ParticleEmit = (spec: ParticleEmitSpec) => void
// 망치 임팩트 불꽃 — 원점은 검 박스 중심 기준 px.
export type HitSparkBurst = (origin: { x: number; y: number }) => void

export type EffectCanvasApi = { emit: ParticleEmit; burst: HitSparkBurst }

export const EffectCanvasContext =
  createContext<RefObject<EffectCanvasApi | null> | null>(null)

// 도트 버스트 방출기(안정 참조) — 캔버스 미마운트면 no-op.
export function useParticleEmit(): ParticleEmit {
  const ref = useContext(EffectCanvasContext)
  return useCallback(
    (spec: ParticleEmitSpec) => {
      ref?.current?.emit(spec)
    },
    [ref],
  )
}

// 임팩트 불꽃 방출기(안정 참조) — 캔버스 미마운트면 no-op.
export function useHitSparkBurst(): HitSparkBurst {
  const ref = useContext(EffectCanvasContext)
  return useCallback(
    (origin: { x: number; y: number }) => {
      ref?.current?.burst(origin)
    },
    [ref],
  )
}
