import { createContext, useCallback, useContext, type RefObject } from 'react'
import type { Particle } from './particles'

// 파티클 풀의 emit 컨텍스트(비-컴포넌트 모듈) — 풀(ParticlePool)이 자신의 emit 을 ref 에 등록하고, 소비자
// (성공/파괴 버스트 경로)는 useParticleEmit 으로 그 ref 를 통해 호출한다. 컨텍스트·훅·타입을 컴포넌트
// 파일에서 분리해 둔다(react-refresh: 컴포넌트 파일은 컴포넌트만 export).

// 한 번에 그릴 파티클 1개 묶음 — particles.ts 의 순수 좌표(Particle)를 그대로 쓴다.
// (성공/파괴 버스트 전용 — Hit 불꽃은 캔버스(HitSparkCanvas)로 분리돼 이 풀을 쓰지 않는다.)
export type ParticleEmitSpec = {
  particles: Particle[] // 중심에서 사방으로 튀는 좌표(makeParticles)
  coreVar: string // 밝은 코어 색(CSS var 또는 색 문자열)
  edgeVar: string // 가장자리 색
}

export type ParticleEmit = (spec: ParticleEmitSpec) => void

// 풀이 emit 을 등록하고 소비자가 읽는 ref. Provider 가 만들어 풀·소비자에게 같은 ref 를 내려 준다.
export const ParticleEmitContext =
  createContext<RefObject<ParticleEmit | null> | null>(null)

// 연출 컴포넌트가 호출하는 emit 핸들. 풀이 아직 등록 전이면(이론상 없음 — 풀은 앱 시작에 마운트) no-op.
export function useParticleEmit(): ParticleEmit {
  const ref = useContext(ParticleEmitContext)
  return useCallback(
    (spec: ParticleEmitSpec) => {
      ref?.current?.(spec)
    },
    [ref],
  )
}
