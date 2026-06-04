import { AnimatePresence, motion } from 'motion/react'
import type { DestructionEvent } from './destruction'
import { SHAKE_KEYFRAMES, SHAKE_SEC, SHAKE_TRANSITION } from './shake'
import { ParticleBurst } from './ParticleBurst'
import { PARTICLE_DUR } from './particles'
import { useOneShot } from './useOneShot'

export type { DestructionEvent } from './destruction'

// 파괴 연출(프레젠테이션 전용). 게임 로직과 완전히 분리되어 있으며 'destruction' 이벤트
// (재생 id + 터진 검 스프라이트 + 파티클 수)에만 반응한다 — 상태를 바꾸지 않고 그리기만 한다.
//
// 연출:  1) 무기가 덜덜 떨리다가  →  2) 붉은 파티클이 무기에서 사방으로 터져 나온다.  총 ~1초.
//
// 스토어는 파괴 즉시 검을 +0(또는 인벤토리 검)으로 교체하므로(로직 지연 없음) 무대의 "새 검"은
// 이미 이 잔상 뒤에 마운트된다. 검 스프라이트는 배경이 투명해 그냥 두면 떨림 구간에 새 검이
// 잔상의 빈 영역으로 비쳐 "검 두 개"처럼 보인다 → GameScreen 이 연출 중에는 SwordStage 의 등장
// 애니메이션을 SHAKE_SEC 만큼 지연(entranceDelay)시켜 떨림 동안 새 검을 감춘다.
// 떨림이 끝나고 붉은 폭발이 중앙을 덮는 순간 새 검이 폭발에서 드러나듯 등장한다.
// 잔상을 실제 <img>(클래스·그림자)와 동일하게 그리는 것은 겹침·소멸 시 어긋나 보이지 않게 하기 위함.

// 떨림은 0 부터 BURST_AT 까지(공유 SHAKE), 그 시점에 파티클·잔상이 터진다.
const BURST_AT = SHAKE_SEC
const TOTAL_MS = (BURST_AT + PARTICLE_DUR) * 1000 + 60 // 연출 전체 길이(여유 60ms)

// 파괴 연출의 전체 길이(ms). Effect 시스템이 'destruction' 효과의 durationMs(진행 길이)로 쓴다
// — 연출 시간의 단일 출처. useOneShot 백스톱도 같은 값을 쓴다.
export const DESTRUCTION_DURATION_MS = TOTAL_MS

export function DestructionEffect({
  event,
}: {
  event: DestructionEvent | null
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

            {/* 붉은 파티클 분출 — 떨림(BURST_AT) 후. 개수는 단계에 비례(공유 ParticleBurst). */}
            <ParticleBurst
              count={active.particleCount}
              coreVar="var(--color-danger-glow)"
              edgeVar="var(--color-danger)"
              delaySec={BURST_AT}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
