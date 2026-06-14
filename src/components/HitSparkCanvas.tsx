import { useContext, useEffect, useRef, type ReactNode } from 'react'
import { dataManager } from '../data/DataManager'
import { HitSparkSystem } from './hitSparks'
import {
  ParticleEmitContext,
  type ParticleEmit,
  type ParticleEmitSpec,
} from './particleEmit'

// 강화 분출 불꽃 캔버스(프레젠테이션 전용) — 떨림이 끝나는 순간(burstAt = 결과 공개)에 불티·잉걸불·화구·
// 불혀를 캔버스 한 장에 폭발시킨다. 옛 "도트 버스트"(성공=금/파괴=적)를 이 불꽃이 대체하므로, 발사 시점도
// 임팩트가 아니라 버스트로 옮겼고 색도 결과(성공/파괴)에 따라 달라진다(coreVar/edgeVar). 게임 로직과
// 분리되어 emit(BurstEmitter 가 burstAt 에 호출) 에만 반응하며 상태를 바꾸지 않고 그리기만 한다.
//
// 풀(ParticlePool)을 대신해 이 캔버스가 emit 컨텍스트의 등록자(렌더러)가 된다 — BurstEmitter 가 결과 색쌍을
// 담아 emit 하면 그 색으로 한 방 터뜨린다. 캔버스가 새 emit 마다 이전 불꽃을 교체(replace)하므로 연사로
// 버스트가 겹쳐도 화면엔 늘 최신 한 벌만 보인다. 검 박스 정중앙에 얹어(left-1/2 top-1/2) 같은 좌표 공간을 쓴다.
// pointer-events 없음·aria-hidden. 살아 있는 불티가 있을 때만 rAF 를 돌고 끝나면 비운다(평소 0 비용).

// Provider — 캔버스(HitSparkCanvas)가 emit 을 등록하고 소비자(BurstEmitter)가 읽는 같은 ref 를 자식 트리에
// 내려 준다. GameScreen 이 검 스테이지(캔버스·소비자 모두 포함)를 이걸로 감싼다.
export function ParticleEmitProvider({ children }: { children: ReactNode }) {
  const emitRef = useRef<ParticleEmit | null>(null)
  return (
    <ParticleEmitContext.Provider value={emitRef}>
      {children}
    </ParticleEmitContext.Provider>
  )
}

export function HitSparkCanvas() {
  const emitRef = useContext(ParticleEmitContext)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // 시스템은 마운트 1회 생성(캔버스당 하나) — warmup 으로 첫 버스트의 일회성 비용(버퍼 할당·팔레트·글로우
  // 스프라이트·풀 슬롯)을 마운트로 옮겨 첫 폭발이 프레임을 떨구지 않게 한다. emit 을 컨텍스트 ref 에 등록해
  // 소비자(BurstEmitter)가 useParticleEmit 으로 호출한다. 폭발 원점은 검 박스 정중앙({0,0}). 언마운트 시 정리.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const sys = new HitSparkSystem(canvas)
    const reserve = dataManager.getAnimation().particlePoolReserve
    sys.warmup(reserve.hitSparks, reserve.hitLicks)
    const emit: ParticleEmit = (spec: ParticleEmitSpec) =>
      sys.burst({ x: 0, y: 0 }, spec)
    if (emitRef) emitRef.current = emit
    return () => {
      if (emitRef && emitRef.current === emit) emitRef.current = null
      sys.dispose()
    }
  }, [emitRef])

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
}
