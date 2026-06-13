import { memo, useContext, useEffect, useRef, type ReactNode } from 'react'
import { DotParticleSystem } from './dotParticles'
import {
  ParticleEmitContext,
  type ParticleEmit,
  type ParticleEmitSpec,
} from './particleEmit'

// 파티클 풀(프레젠테이션 전용) — 성공/실패 버스트의 모든 도트 파티클을 캔버스 한 장에 그린다. 예전엔 고정 개수의
// motion.span 노드(132개 도트 + decor)를 앱 수명 동안 상시 마운트·재사용했지만(DOM 풀링), 모바일에서 ① 상시
// DOM 노드·motion 구독, ② 버스트당 ~44개 setState 팬아웃, ③ 동시 수십~132개 motion JS 애니메이션(메인 스레드),
// ④ boxShadow 글로우 레이어 합성이 누적돼 연사 중 프레임을 떨궜다. 이제 그 비용을 모두 캔버스로 흡수한다 —
// 살아 있는 입자가 있을 때만 rAF 를 돌고 끝나면 비운다(평소 0 비용). 그리기·물리·색 해석은 DotParticleSystem 이
// 소유하고(비-컴포넌트 모듈 dotParticles.ts), 이 컴포넌트는 캔버스를 띄우고 emit 을 컨텍스트에 등록하기만 한다.
//
// (Hit 불꽃은 여전히 별개다 — HitSparkCanvas. 둘 다 검 박스 정중앙(left-1/2 top-1/2) 같은 좌표 공간을 쓴다.)
//
// emit 인터페이스(ParticleEmitSpec/useParticleEmit)는 그대로라 소비자(ShakeBurstEffect → SuccessEffect/DestructionEffect)는
// 변하지 않는다. 타이밍은 호출 측이 소유한다(버스트는 "떨림이 끝난 순간"에 emit). emit 컨텍스트·훅·타입은
// particleEmit.ts(비-컴포넌트 모듈)가 소유한다.

// Provider — 풀(ParticlePool)이 emit 을 등록하고 소비자가 읽는 같은 ref 를 자식 트리에 내려 준다.
// GameScreen 이 검 스테이지(풀·소비자 모두 포함)를 이걸로 감싼다.
export function ParticleEmitProvider({ children }: { children: ReactNode }) {
  const emitRef = useRef<ParticleEmit | null>(null)
  return (
    <ParticleEmitContext.Provider value={emitRef}>
      {children}
    </ParticleEmitContext.Provider>
  )
}

// memo: props 가 없어 부모(GameScreen)가 강화마다(연사 중 초당 수십 회) 리렌더돼도 이 컴포넌트는 bail-out 한다.
// 그리기는 캔버스 시스템(명령형 rAF)이 소유하므로 리렌더 없이도 완전하다.
export const ParticlePool = memo(function ParticlePool() {
  const emitRef = useContext(ParticleEmitContext)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // 시스템은 마운트 1회 생성(캔버스당 하나) — warmup 으로 backing store 할당을 마운트로 옮겨 첫 버스트가 프레임을
  // 떨구지 않게 한다. emit 을 컨텍스트 ref 에 등록해 소비자가 useParticleEmit 으로 호출한다. 언마운트 시 정리.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const sys = new DotParticleSystem(canvas)
    sys.warmup()
    const emit: ParticleEmit = (spec: ParticleEmitSpec) => sys.emit(spec)
    if (emitRef) emitRef.current = emit
    return () => {
      if (emitRef && emitRef.current === emit) emitRef.current = null
      sys.dispose()
    }
  }, [emitRef])

  // 검 박스 정중앙에서 방출(left-1/2 top-1/2) — HitSparkCanvas 와 같은 좌표 공간. 크기는 rem 이라 데스크탑
  // 스케일을 따라가고, 도트 좌표(makeParticles, raw px)가 그 안에서 사방으로 퍼진다(최대 반경 ~190px < 240px).
  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-1/2"
      style={{
        width: '30rem',
        height: '26rem',
        marginLeft: '-15rem',
        marginTop: '-13rem',
      }}
    />
  )
})
