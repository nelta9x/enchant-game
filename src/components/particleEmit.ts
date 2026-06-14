import { createContext, useCallback, useContext, type RefObject } from 'react'

// Hit 불꽃 emit 컨텍스트(비-컴포넌트 모듈) — 캔버스(HitSparkCanvas)가 자신의 emit(불꽃 1회 폭발)을 ref 에
// 등록하고, 소비자(성공/파괴 버스트 경로 → BurstEmitter)는 useParticleEmit 으로 그 ref 를 통해 호출한다.
// 컨텍스트·훅·타입을 컴포넌트 파일에서 분리해 둔다(react-refresh: 컴포넌트 파일은 컴포넌트만 export).
//
// (옛 도트 버스트 풀은 제거됐다 — 성공/파괴 분출은 이제 결과 색으로 물든 Hit 불꽃 한 방으로 통합된다.)

// 불꽃 1회 폭발 명세 — 결과(성공/파괴)에 따라 불티·화구·불혀의 화염색을 달리한다.
// coreVar(밝은 코어)·edgeVar(가장자리)는 식어가는 화염 그라데이션의 중간 두 stop 에 꽂힌다
// (백열 머리·잿불 꼬리는 공통 hit 토큰 — hitSparks.ts).
export type ParticleEmitSpec = {
  coreVar: string // 밝은 코어 색(CSS var 또는 색 문자열, 예: 'var(--color-gold-glow)')
  edgeVar: string // 가장자리 색(예: 'var(--color-gold)')
}

export type ParticleEmit = (spec: ParticleEmitSpec) => void

// 캔버스가 emit 을 등록하고 소비자가 읽는 ref. Provider 가 만들어 캔버스·소비자에게 같은 ref 를 내려 준다.
export const ParticleEmitContext =
  createContext<RefObject<ParticleEmit | null> | null>(null)

// 연출 컴포넌트가 호출하는 emit 핸들. 캔버스가 아직 등록 전이면(이론상 없음 — 캔버스는 앱 시작에 마운트) no-op.
export function useParticleEmit(): ParticleEmit {
  const ref = useContext(ParticleEmitContext)
  return useCallback(
    (spec: ParticleEmitSpec) => {
      ref?.current?.(spec)
    },
    [ref],
  )
}
