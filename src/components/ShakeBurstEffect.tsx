import { useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { SHAKE_KEYFRAMES, makeShakeTransition } from './shake'
import { makeParticles } from './particles'
import { useParticleEmit } from './particleEmit'
import { useOneShot } from './useOneShot'

// "떨림 후 분출" 연출의 공유 안무(프레젠테이션 전용). 파괴(적색·검 소멸)와 성공(금색·상위 검 등장)이
// 색만 달리해 같은 시퀀스를 쓴다 — 게임 로직과 분리되어 이벤트(재생 id + 잔상 스프라이트 + 파티클 수 +
// 임팩트/떨림 타이밍)에만 반응하며 상태를 바꾸지 않고 그리기만 한다.
//
// 연출(t=0 = 강화 시점):
//   [0, impact)        잔상(강화 전 검)이 가만히 있는다 — 망치는 아직 윈드업 중.
//   [impact, burstAt)  망치가 닿은 순간부터 잔상이 덜덜 떤다(무작위 떨림 시간 shakeMs).
//   burstAt            떨림 끝 → 잔상이 팝업·소멸하고, 파티클이 풀에서 사방으로 터진다(성공=금/파괴=적).
//
// 떨림이 "망치가 닿는 시점"에 시작하도록 한 것이 이번 리워크의 핵심 — 기존엔 클릭 즉시(윈드업 중) 떨려
// 망치 임팩트와 어긋났다. 파티클은 더 이상 이 컴포넌트가 직접 mount/unmount 하지 않고, burstAt 에 풀로
// emit 한다(풀이 노드를 재사용 — 요구사항). 잔상만 이 컴포넌트가 그린다(떨림·팝업·소멸).
//
// 스토어는 결과 즉시 검을 교체하므로 무대의 "새 검"은 이미 이 잔상 뒤에 마운트돼 있다. GameScreen 이
// 그 등장을 burstAt 까지 지연(entranceDelay = suppress)시켜, 떨림 동안 새 검이 잔상 뒤로 비쳐 "검 두 개"로
// 보이지 않게 한다(강화 전/후 검 동시 노출 방지). burstAt 에 잔상이 소멸하는 순간 새 검이 드러나듯 등장한다 —
// 잔상 소멸과 새 검 등장이 같은 burstAt(타임라인 단일 출처)을 쓰므로 정확히 교대된다(crossover).

export type ShakeBurstEvent = {
  id: number
  spriteUrl: string
  particleCount: number
  impactMs: number // 망치가 닿는 시각(떨림 시작) — 데이터 기반 고정값
  shakeMs: number // 이번 강화의 떨림 길이(무작위) — burstAt = impact + shake
}

export function ShakeBurstEffect({
  event,
  coreVar,
  edgeVar,
}: {
  event: ShakeBurstEvent | null
  coreVar: string // 밝은 코어 색(예: 'var(--color-danger-glow)' / 'var(--color-gold-glow)')
  edgeVar: string // 가장자리 색(예: 'var(--color-danger)' / 'var(--color-gold)')
}) {
  const emit = useParticleEmit()
  // useOneShot 수명은 잔상 팝업(burstAt + ~0.22s)까지 덮으면 된다 — 파티클은 풀(항상 마운트)이 그리므로
  // 이 컴포넌트 수명과 무관하다. 효과의 실제 수명(durationMs)은 Effect 시스템이 소유하고 이는 백스톱이다.
  const lifetime = event ? event.impactMs + event.shakeMs + 400 : 0
  const active = useOneShot(event, lifetime)

  // burstAt 에 파티클을 풀로 1회 emit 한다. 같은 id 인스턴스는 부모(GameScreen)의 key=id 로 안정적이라
  // 마운트 1회 스케줄로 충분하다. id 에만 의존해 무관한 running 변경(이벤트 객체 정체성 churn)으로 두 번
  // 터지지 않게 한다. cleanup 이 이전 타이머를 지워 StrictMode 이중 마운트도 1회로 수렴.
  const burstId = event?.id ?? null
  const burstAtMs = event ? event.impactMs + event.shakeMs : 0
  useEffect(() => {
    if (burstId === null || !event) return
    const particleCount = event.particleCount
    const tid = setTimeout(() => {
      emit({
        particles: makeParticles(particleCount),
        coreVar,
        edgeVar,
      })
    }, burstAtMs)
    return () => clearTimeout(tid)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [burstId, burstAtMs, coreVar, edgeVar, emit])

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-visible"
      aria-hidden
    >
      <AnimatePresence>
        {active && (
          <motion.div
            key={active.id}
            className="absolute inset-0 flex items-center justify-center"
            // 연출 도중 새 시도로 교체되면 끊기지 않게 부드럽게 사라진다.
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
          >
            {/* 떨림 레이어 — 망치가 닿는 순간(impact)부터 무작위 길이(shakeMs)만큼 떤다. delay 로 윈드업
                동안은 가만히 있는다(방지 시 실제 검과 동일한 공유 SHAKE 모양). */}
            <motion.div
              className="flex items-center justify-center"
              animate={SHAKE_KEYFRAMES}
              transition={makeShakeTransition(
                active.shakeMs / 1000,
                active.impactMs / 1000,
              )}
            >
              {/* 잔상 — 실제 스프라이트(SwordStage <img>)와 클래스·그림자까지 같게 그려, burstAt 에 팝업 후
                  소멸한다(동일해야 소멸→새 검 노출이 튀지 않는다). 떨림 끝까지 opacity 1 로 가만히 있는다. */}
              <motion.img
                src={active.spriteUrl}
                alt=""
                draggable={false}
                className="h-36 w-36 object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.25)] sm:h-40 sm:w-40"
                style={{ imageRendering: 'pixelated' }}
                initial={{ scale: 1, opacity: 1 }}
                animate={{ scale: [1, 1.18, 0.5], opacity: [1, 1, 0] }}
                transition={{
                  delay: (active.impactMs + active.shakeMs) / 1000, // 떨림 끝(burstAt)까지 가만, 이후 팝업+소멸
                  duration: 0.22,
                  times: [0, 0.45, 1],
                  ease: 'easeOut',
                }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
