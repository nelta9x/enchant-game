import { memo, useContext, useEffect, useRef, type ReactNode } from 'react'
import { dataManager } from '../data/DataManager'
import { DotParticleSystem } from './dotParticles'
import { EffectCanvasHost } from './effectCanvasHost'
import { HitSparkSystem } from './hitSparks'
import { EffectCanvasContext, type EffectCanvasApi } from './particleEmit'
import { PARTICLE_REACH_PX } from './particles'

// 효과 캔버스(프레젠테이션 전용) — 성공/파괴 도트 버스트(DotParticleSystem)와 망치 임팩트 불꽃(HitSparkSystem)을
// 캔버스 한 장·rAF 루프 하나(EffectCanvasHost)에 그린다. 예전엔 각각 캔버스 한 장(30rem×26rem, DPR 2)과 루프를
// 가졌다 — 합쳐서 clear·합성 레이어·프레임 콜백을 절반으로, backing store 를 DPR 1 로 채움 픽셀을 1/4 로 줄였다.
// 살아 있는 입자가 있을 때만 루프가 돌고 끝나면 비운다(평소 0 비용). 그리기·물리·색 해석은 각 시스템이 소유하고,
// 이 컴포넌트는 캔버스를 띄우고 방출 API 를 컨텍스트에 등록하기만 한다(particleEmit.ts).
//
// 크기: 도트 도달 반경(PARTICLE_REACH_PX, px 상수)과 rem 스케일(30rem) 중 큰 쪽 — 세로 폰(rem≈10px)에서 30rem 이
// 도달 반경보다 작아 바깥 링 도트가 잘리던 버그를 막는다. 불꽃 크기는 캔버스 폭이 아니라 rem 으로 스케일한다
// (hitSparks 의 k) — 캔버스 크기 규칙이 바뀌어도 연출 크기는 그대로.
const CANVAS_MIN_PX = PARTICLE_REACH_PX * 2

// Provider — 캔버스(EffectCanvas)가 API 를 등록하고 소비자가 읽는 같은 ref 를 자식 트리에 내려 준다.
export function EffectCanvasProvider({ children }: { children: ReactNode }) {
  const apiRef = useRef<EffectCanvasApi | null>(null)
  return (
    <EffectCanvasContext.Provider value={apiRef}>
      {children}
    </EffectCanvasContext.Provider>
  )
}

// memo: props 가 없어 부모가 강화마다 리렌더돼도 bail-out 한다. 그리기는 호스트(명령형 rAF)가 소유한다.
export const EffectCanvas = memo(function EffectCanvas() {
  const apiRef = useContext(EffectCanvasContext)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // 호스트·시스템은 마운트 1회 생성. warmup 으로 풀 슬롯·텍스처 굽기를 마운트로 옮겨 첫 버스트가 프레임을 떨구지
  // 않게 한다. 언마운트 시 정리.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const host = new EffectCanvasHost(canvas)
    const reserve = dataManager.getAnimation().particlePoolReserve
    const dots = new DotParticleSystem(host)
    dots.warmup(reserve.dots)
    const sparks = new HitSparkSystem(host)
    sparks.warmup(reserve.hitLicks)
    // 그리기 순서 = 등록 순서: 불꽃(임팩트) 위에 도트(버스트)가 얹힌다.
    host.add(sparks)
    host.add(dots)
    const api: EffectCanvasApi = {
      emit: (spec) => dots.emit(spec),
      burst: (origin) => sparks.burst(origin),
    }
    if (apiRef) apiRef.current = api
    return () => {
      if (apiRef && apiRef.current === api) apiRef.current = null
      host.dispose()
    }
  }, [apiRef])

  // 검 박스 정중앙에 얹는다(캔버스 중심 = 좌표 원점). 크기는 max(rem 스케일, 도달 반경) — 위 주석.
  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-1/2"
      style={{
        width: `max(30rem, ${CANVAS_MIN_PX}px)`,
        height: `max(26rem, ${CANVAS_MIN_PX}px)`,
        transform: 'translate(-50%, -50%)',
      }}
    />
  )
})
