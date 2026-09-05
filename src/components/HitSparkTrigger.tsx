import { useEffect, useRef } from 'react'
import { useHitSparkBurst } from './particleEmit'

// 망치 임팩트 불꽃 트리거(렌더 없음) — 강화 시도(hammerStrike 효과)마다 망치가 검에 "닿는 순간"(impactMs) 효과 캔버스에
// 화구·충격파·불혀를 터뜨린다. 결과가 무엇이었는지는 모른 채 "닿았다"는 사실만 그린다(성공·파괴·방지 공통). 그리기는
// EffectCanvas(HitSparkSystem)가 소유하고 여기선 타이밍만 건다. 대기 중 타이머는 새 id 가 와도 취소하지 않는다
// (BurstEmitter 와 같은 규약 — 효과 store 가 kind 별 최신만 발행하므로 겹침 보존은 타이머 집합이 책임진다).
type HitSparkEvent = { id: number }

export function HitSparkTrigger({
  event,
  impactMs,
}: {
  event: HitSparkEvent | null
  impactMs: number // 망치가 검에 닿기까지(데이터 hammerImpactMs) — 떨림·타격음과 동일 앵커
}) {
  const burst = useHitSparkBurst()
  const eventId = event?.id ?? null
  const pending = useRef(new Set<ReturnType<typeof setTimeout>>())
  useEffect(() => {
    if (eventId === null) return
    const timers = pending.current
    // 폭발 원점 = 검 박스 정중앙(=강화 마법진 중앙). origin 은 박스 중심 기준 px 라 {0,0} 이 한가운데.
    const tid = setTimeout(() => {
      timers.delete(tid)
      burst({ x: 0, y: 0 })
    }, impactMs)
    timers.add(tid)
    // impactMs 는 데이터 상수 — 트리거는 id 뿐.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])
  useEffect(() => {
    const timers = pending.current
    return () => {
      for (const t of timers) clearTimeout(t)
      timers.clear()
    }
  }, [])
  return null
}
