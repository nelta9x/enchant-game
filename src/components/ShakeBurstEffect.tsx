import { AnimatePresence, motion } from 'motion/react'
import { SHAKE_KEYFRAMES, SHAKE_SEC, SHAKE_TRANSITION } from './shake'
import { ParticleBurst } from './ParticleBurst'
import { PARTICLE_DUR } from './particles'
import { useOneShot } from './useOneShot'

// "떨림 후 분출" 연출의 공유 안무(프레젠테이션 전용). 파괴(적색·검 소멸)와 성공(금색·상위 검 등장)이
// 색만 달리해 같은 시퀀스를 쓴다 — 게임 로직과 분리되어 이벤트(재생 id + 잔상 스프라이트 + 파티클 수)에만
// 반응하며 상태를 바꾸지 않고 그리기만 한다.
//
// 연출:  1) 무기가 덜덜 떨리다가  →  2) BURST_AT 에 잔상이 팝업·소멸하며 파티클이 사방으로 터진다.  총 ~1초.
//
// 스토어는 결과 즉시 검을 교체하므로(로직 지연 없음) 무대의 "새 검"은 이미 이 잔상 뒤에 마운트된다.
// 검 스프라이트는 배경이 투명해 그냥 두면 떨림 구간에 새 검이 잔상의 빈 영역으로 비쳐 "검 두 개"처럼
// 보인다 → GameScreen 이 연출 중에는 SwordStage 의 등장 애니메이션을 SHAKE_SEC 만큼 지연(entranceDelay)
// 시켜 떨림 동안 새 검을 감춘다. 떨림이 끝나고 분출이 중앙을 덮는 순간 새 검이 드러나듯 등장한다.
// 잔상을 실제 <img>(클래스·그림자)와 동일하게 그리는 것은 겹침·소멸 시 어긋나 보이지 않게 하기 위함.

export type ShakeBurstEvent = {
  id: number
  spriteUrl: string
  particleCount: number
}

// 떨림은 0 부터 BURST_AT 까지(공유 SHAKE), 그 시점에 파티클·잔상이 터진다.
const BURST_AT = SHAKE_SEC
const TOTAL_MS = (BURST_AT + PARTICLE_DUR) * 1000 + 60 // 연출 전체 길이(여유 60ms)

// 연출 전체 길이(ms). Effect 시스템이 효과의 durationMs(진행 길이)로 쓰는 연출 시간의 단일 출처
// — 파괴·성공 래퍼가 그대로 노출한다. useOneShot 백스톱도 같은 값을 쓴다.
export const SHAKE_BURST_DURATION_MS = TOTAL_MS

export function ShakeBurstEffect({
  event,
  coreVar,
  edgeVar,
}: {
  event: ShakeBurstEvent | null
  coreVar: string // 밝은 코어 색(예: 'var(--color-danger-glow)' / 'var(--color-gold-glow)')
  edgeVar: string // 가장자리 색(예: 'var(--color-danger)' / 'var(--color-gold)')
}) {
  const active = useOneShot(event, TOTAL_MS)

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
            // 연출 도중 새 시도로 교체되면 끊기지 않게 부드럽게 사라진다(하위에 함께 적용).
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
          >
            {/* 떨림 레이어 — 방지 시 실제 검과 "동일한" 공유 SHAKE 를 쓴다(파티클은 형제라 안 흔들림).
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

            {/* 파티클 분출 — 떨림(BURST_AT) 후. 색은 호출 측이 주입, 개수는 단계에 비례(공유 ParticleBurst). */}
            <ParticleBurst
              count={active.particleCount}
              coreVar={coreVar}
              edgeVar={edgeVar}
              delaySec={BURST_AT}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
