import { useEffect, useRef } from 'react'
import { HitSparkSystem } from './hitSparks'

// Hit 불꽃 캔버스(프레젠테이션 전용·DOM 파티클 없음) — 망치가 검에 "닿는 순간"(impactMs) 불티·잉걸불·
// 화구·불혀를 캔버스 한 장에 폭발시킨다. 게임 로직과 분리되어 강화 시도(망치 내려치기)에만 반응하며, 결과가
// 무엇이었는지는 모른 채 "닿았다"는 사실만 그린다(성공·파괴·방지 공통). 성공/실패 버스트는 별개(DOM 풀).
//
// 검 박스 정중앙에 얹어(left-1/2 top-1/2) ParticlePool 과 같은 좌표 공간을 쓴다. 폭발 원점은 그 정중앙
// (=강화 마법진 중앙, 좌표계 원점)이라 burst({0,0}) 으로 검·마법진 한가운데서 피어난다. 캔버스 크기는 rem
// 이라 데스크탑 스케일을 따라가고, 시스템이 실제 픽셀 폭으로 모든 px 를 스케일한다(hitSparks 의 k).
// pointer-events 없음·aria-hidden. 살아 있는 불티가 있을 때만 rAF 를 돌고 끝나면 캔버스를 비운다(평소 0 비용).

export type HitSparkEvent = { id: number }

export function HitSparkCanvas({
  event,
  impactMs,
}: {
  event: HitSparkEvent | null
  impactMs: number // 망치가 검에 닿기까지(데이터 hammerImpactMs) — 떨림·타격음과 동일 앵커
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sysRef = useRef<HitSparkSystem | null>(null)

  // 시스템은 마운트 1회 생성(캔버스당 하나) — 언마운트 시 rAF 정리. warmup 으로 첫 타격의 일회성 비용
  // (버퍼 할당·팔레트·글로우 스프라이트)을 마운트로 옮겨 첫 burst 가 프레임을 떨구지 않게 한다.
  useEffect(() => {
    if (canvasRef.current && !sysRef.current) {
      sysRef.current = new HitSparkSystem(canvasRef.current)
      sysRef.current.warmup()
    }
    return () => {
      sysRef.current?.dispose()
      sysRef.current = null
    }
  }, [])

  // 같은 시도 내 running 변화로 event 객체 정체성이 흔들려도 재실행되지 않도록 "숫자 id"에만 의존한다
  // (객체 정체성에 의존하면 무관한 running 변경마다 타이머가 재설정돼 불티가 두 번 튈 수 있다). id 가 바뀔
  // 때(=새 강화 시도)만 impactMs 뒤에 한 번 burst. cleanup 이 이전 타이머를 지워 StrictMode 이중 마운트도 1회로.
  const eventId = event?.id ?? null
  useEffect(() => {
    if (eventId === null) return
    // 폭발 원점 = 검 박스 정중앙(=강화 마법진 중앙). burst 의 origin 은 박스 중심 기준 px 라 {0,0} 이 한가운데.
    const tid = setTimeout(
      () => sysRef.current?.burst({ x: 0, y: 0 }),
      impactMs,
    )
    return () => clearTimeout(tid)
  }, [eventId, impactMs])

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
