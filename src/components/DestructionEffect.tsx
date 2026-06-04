import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { DestructionEvent } from './destruction'
import { SHAKE_KEYFRAMES, SHAKE_SEC, SHAKE_TRANSITION } from './shake'

export type { DestructionEvent } from './destruction'

// 파괴 연출(프레젠테이션 전용). 게임 로직과 완전히 분리되어 있으며 'destroyed' 이벤트
// (재생 id + 터진 검 스프라이트)에만 반응한다 — 상태를 바꾸지 않고 그리기만 한다.
//
// 연출:  1) 무기가 덜덜 떨리다가  →  2) 붉은 파티클이 무기에서 사방으로 터져 나온다.  총 ~1초.
//
// 스토어는 파괴 즉시 검을 +0(또는 인벤토리 검)으로 교체하므로(로직 지연 없음) 무대의 "새 검"은
// 이미 이 잔상 뒤에 마운트된다. 검 스프라이트는 배경이 투명해 그냥 두면 떨림 구간에 새 검이
// 잔상의 빈 영역으로 비쳐 "검 두 개"처럼 보인다 → GameScreen 이 연출 중에는 SwordStage 의 등장
// 애니메이션을 SHAKE_SEC 만큼 지연(entranceDelay)시켜 떨림 동안 새 검을 감춘다.
// 떨림이 끝나고 붉은 폭발이 중앙을 덮는 순간 새 검이 폭발에서 드러나듯 등장한다.
// 잔상을 실제 <img>(클래스·그림자)와 동일하게 그리는 것은 겹침·소멸 시 어긋나 보이지 않게 하기 위함.

// ── 연출 파라미터(시각 튜닝용 — feel 은 localhost 에서 확인) ─────────────────────
// 떨림은 0 부터 시작해 BURST_AT 까지 이어지고(공유 SHAKE), 그 시점에 파티클·잔상이 터진다.
const BURST_AT = SHAKE_SEC // 파티클·잔상 터짐 시작(초) = 떨림 길이(공유 상수)
const PARTICLE_DUR = 0.6 // 파티클 비행 시간(초)
const TOTAL_MS = (BURST_AT + PARTICLE_DUR) * 1000 + 60 // 오버레이 자체 수명(여유 60ms)
const PARTICLE_COUNT = 14

// 파괴 연출의 전체 길이(ms). Effect 시스템이 'destruction' 효과의 durationMs(진행 길이)로 쓴다
// — 연출 시간의 단일 출처. 자체 expiredId 타이머는 백스톱으로 남는다.
export const DESTRUCTION_DURATION_MS = TOTAL_MS

// 파티클 분포는 모듈 로드 시 결정한다(렌더 비의존). 균등 분포 + 교번 지터로 자연스럽게 흩는다.
const PARTICLES = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
  const angle = (i / PARTICLE_COUNT) * Math.PI * 2 + (i % 2 ? 0.22 : -0.2)
  const dist = 60 + (i % 3) * 26 // 60 / 86 / 112 px
  const size = 6 + (i % 4) * 2 // 6 / 8 / 10 / 12 px
  return {
    x: Math.cos(angle) * dist,
    y: Math.sin(angle) * dist,
    size,
    stagger: (i % 5) * 0.015,
  }
})

export function DestructionEffect({
  event,
}: {
  event: DestructionEvent | null
}) {
  // 토스트 수명(1.4s)과 무관한 자체 수명: 재생이 끝난 id 를 만료 처리해 스스로 사라진다.
  // (만료는 타이머 콜백에서만 set → effect 동기 setState 회피.)
  const [expiredId, setExpiredId] = useState<number | null>(null)

  useEffect(() => {
    if (!event) return
    const { id } = event
    const tid = setTimeout(() => setExpiredId(id), TOTAL_MS)
    return () => clearTimeout(tid)
  }, [event])

  // 현재 이벤트가 아직 만료되지 않았을 때만 그린다. event 가 먼저 사라지면(상위에서 교체)
  // AnimatePresence 가 자연스럽게 exit 한다.
  const active = event && event.id !== expiredId ? event : null

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
            // 연출 도중 새 시도로 교체되면(예: 파괴 직후 +0 강화 성공) 끊기지 않게 부드럽게 사라진다.
            // opacity exit 는 하위(잔상·파티클)에 함께 적용된다. 정상 종료 시엔 이미 모두 투명해 무영향.
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
          >
            {/* 떨림 레이어 — 방지 시 실제 검과 "동일한" 공유 SHAKE 를 쓴다(파티클·링은 형제라 안 흔들림).
                안의 잔상은 실제 스프라이트(SwordStage <img>)와 클래스·그림자까지 같게 그려, BURST_AT 에
                팝업 후 소멸한다(동일해야 소멸→새 검 노출이 튀지 않는다). */}
            <motion.div
              className="flex items-center justify-center"
              animate={SHAKE_KEYFRAMES}
              transition={SHAKE_TRANSITION}
            >
              <motion.img
                src={active.spriteUrl}
                alt=""
                draggable={false}
                className="h-36 w-36 object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.25)] sm:h-40 sm:w-40"
                style={{ imageRendering: 'pixelated' }}
                initial={{ scale: 1, opacity: 1 }}
                animate={{ scale: [1, 1.18, 0.5], opacity: [1, 1, 0] }}
                transition={{
                  delay: BURST_AT, // 떨림 끝까지 가만(opacity 1), 이후 팝업+소멸
                  duration: 0.22,
                  times: [0, 0.45, 1],
                  ease: 'easeOut',
                }}
              />
            </motion.div>

            {/* 중심점 — 파티클·충격파·섬광이 무기 자리에서 방출되도록 정중앙에 둔다. */}
            <div className="absolute left-1/2 top-1/2">
              {/* 붉은 섬광(터지는 순간 짧게) */}
              <motion.span
                className="absolute h-32 w-32 rounded-full"
                style={{
                  marginLeft: '-4rem',
                  marginTop: '-4rem',
                  background:
                    'radial-gradient(circle, color-mix(in srgb, var(--color-danger-glow) 75%, transparent), transparent 70%)',
                }}
                initial={{ scale: 0.3, opacity: 0 }}
                animate={{ scale: 1.1, opacity: [0, 0.85, 0] }}
                transition={{
                  delay: BURST_AT,
                  duration: 0.45,
                  ease: 'easeOut',
                }}
              />

              {/* 충격파 링 */}
              <motion.span
                className="absolute h-40 w-40 rounded-full border-2"
                style={{
                  marginLeft: '-5rem',
                  marginTop: '-5rem',
                  borderColor: 'var(--color-danger)',
                }}
                initial={{ scale: 0.1, opacity: 0.7 }}
                animate={{ scale: 1, opacity: 0 }}
                transition={{ delay: BURST_AT, duration: 0.5, ease: 'easeOut' }}
              />

              {/* 붉은 파티클 — 무기에서 사방으로 분출 */}
              {PARTICLES.map((p, i) => (
                <motion.span
                  key={i}
                  className="absolute rounded-full"
                  style={{
                    width: p.size,
                    height: p.size,
                    marginLeft: -p.size / 2,
                    marginTop: -p.size / 2,
                    background:
                      'radial-gradient(circle, var(--color-danger-glow), var(--color-danger))',
                    boxShadow: '0 0 6px var(--color-danger-glow)',
                  }}
                  initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
                  animate={{
                    x: p.x,
                    y: p.y,
                    opacity: [0, 1, 1, 0],
                    scale: [0.4, 1, 0.9, 0.45],
                  }}
                  transition={{
                    delay: BURST_AT + p.stagger,
                    duration: PARTICLE_DUR,
                    times: [0, 0.15, 0.6, 1],
                    ease: 'easeOut',
                  }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
