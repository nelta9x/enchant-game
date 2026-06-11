import { useEffect } from 'react'
import { HIT_SPARK_COUNT, makeHitSparks } from './particles'
import { useParticleEmit } from './particleEmit'

// Hit 불꽃 연출(프레젠테이션 전용·DOM 없음) — 망치가 검에 "닿는 순간" 충돌 불티를 풀에서 1회 분출시킨다.
// 성공/실패 버스트와는 다른 느낌(위로 튀어 중력으로 떨어지는 달궈진 쇠 불티 — particles.makeHitSparks +
// ParticlePool 의 'hit' 모션). 게임 로직과 분리되어 강화 시도(망치 내려치기)에만 반응하며, 결과가
// 무엇이었는지는 모른 채 "닿았다"는 사실만 그린다(성공·파괴·방지 공통).
//
// 임팩트 시각은 고정(데이터 hammerImpactMs) — 윈드업은 매회 같고, 무작위는 임팩트 "이후"(떨림 길이)뿐이다.
// 그래서 망치 내려치기 이벤트가 뜨면 impactMs 뒤에 한 번 emit 한다. 풀이 노드를 재사용하므로 별도 mount 없음.

export type HitSparkEvent = { id: number }

export function HitSparkEffect({
  event,
  impactMs,
}: {
  event: HitSparkEvent | null
  impactMs: number
}) {
  const emit = useParticleEmit()
  // 같은 시도 내에서 running 이 바뀌어 event 객체 정체성이 흔들려도 재실행되지 않도록 "숫자 id"에만 의존한다
  // (객체 정체성에 의존하면 무관한 running 변경마다 타이머가 재설정돼 불티가 두 번 튈 수 있다). id 가 바뀔
  // 때(=새 강화 시도)만 임팩트 시점에 한 번 분출. cleanup 이 이전 타이머를 지워 StrictMode 이중 마운트도 1회로 수렴.
  const eventId = event?.id ?? null
  useEffect(() => {
    if (eventId === null) return
    const tid = setTimeout(() => {
      emit({
        particles: makeHitSparks(HIT_SPARK_COUNT),
        coreVar: 'var(--color-hit-core)',
        edgeVar: 'var(--color-hit-edge)',
        kind: 'hit',
      })
    }, impactMs)
    return () => clearTimeout(tid)
  }, [eventId, impactMs, emit])

  return null
}
