import { AnimatePresence, motion } from 'motion/react'
import { itemSpriteUrl } from '../lib/sprites'
import { SHAKE_SEC } from './shake'
import { useOneShot } from './useOneShot'

// 강화 "내려치기" 연출(프레젠테이션 전용) — 강화 시도마다(성공·파괴·방지 무관) 호라드릭 망치가
// 오른쪽 위에 치켜들렸다가 빠르게 검으로 내리꽂고, 살짝 반동했다가 다시 오른쪽 위로 들어올려지며
// 사라진다. 게임 로직과 분리되어 'hammerStrike' 이벤트(재생 id)에만 반응한다 — 결과가 무엇이었는지는
// 모른 채 "내려치는 동작"만 그린다(성공·파괴·방지 공통). 타이밍/생명주기는 Effect 시스템(durationMs)이
// 소유하고, useOneShot 이 혹시 남는 이벤트를 만료시킨다(백스톱 — 다른 연출과 동일 관례).
//
// 쾌감(immediacy)을 위해 "느린 활강"이 아니라 "치켜듦 → 빠른 스냅 → 강타"로 친다: 등장 즉시 오른쪽
// 위에 치켜든 자세로 나타나(클릭 피드백) 잠깐 윈드업한 뒤, 분출 직전(HOLD_UNTIL→IMPACT_AT)에 짧고
// 빠르게(easeIn 가속) 내리꽂아 강타한다. 임팩트를 결과 분출 "직전"(IMPACT_AT = SHAKE_SEC - α)에 둬
// "친다 → (한 박자 뒤) 터진다"로 읽히게 한다(ShakeBurstEffect 분출은 BURST_AT = SHAKE_SEC). GameScreen 이
// 'enhance' "캉!" 사운드도 HAMMER_IMPACT_MS 로 미뤄 타격음이 바로 이 임팩트에 맞는다.
//
// SwordStage 의 spriteOverlay 슬롯에 얹어 검 박스 위 전면에 그린다 — 그 슬롯은 떨림 레이어 밖 형제라
// (SwordStage 주석 참고) 망치는 검과 함께 흔들리지 않는다. overflow-visible 라 박스 밖(오른쪽 위)으로
// 나가도 잘리지 않는다(ParticleBurst 와 동일). 자세는 스프라이트 자연 방향 그대로 머리=위·손잡이=아래.

const HAMMER_SPRITE = itemSpriteUrl('horadric_hammer.png')

// ── 모션 튜닝 상수(브라우저에서 눈으로 맞추는 값) ─────────────────────────────────
// x·y(px): 검 박스 "중심"(0,0) 기준 망치 중심의 위치. x 양수 = 오른쪽, y 음수 = 위.
// 머리=위·손잡이=아래라, 임팩트에서 망치를 검 위(중심 살짝 위)에 겹쳐 머리가 검 윗날 근처에 오게 둔다.
const START = { x: 178, y: -140 } // 등장 즉시 치켜든 자세(오른쪽 위) — overflow-visible 라 박스 밖이어도 안 잘린다
const HOLD = { x: 196, y: -156 } // 살짝 더 당겨 든 윈드업(앤티시페이션) — 곧 내리꽂을 준비
const IMPACT = { x: 30, y: -28 } // 내리꽂은 순간 — 망치가 검 위에 겹쳐 머리가 검 윗날 근처
const RECOIL = { x: 56, y: -64 } // 임팩트 후 오른쪽 위로 살짝 튕겨 오름(반동)
const SETTLE = { x: 36, y: -34 } // 반동 후 임팩트 부근으로 정착
const LIFT = { x: 186, y: -150 } // 다시 오른쪽 위로 들어올려 사라짐
const BASE_ROTATE = 0 // 임팩트 기준 자세(머리=위, 손잡이=아래). 키프레임의 +는 윈드업(뒤로 젖힘), -는 따라넘김
const WINDUP_TILT = 56 // 치켜들 때 머리를 오른쪽으로 젖힌 정도(스윙 윈드업) — 클수록 크게 휘두름
const FOLLOW_TILT = 22 // 임팩트에서 휘둘러 따라넘긴 정도(반대 방향 기울임)

// ── 타임라인(초, t=0 = 강화 시점) ───────────────────────────────────────────────
// 핵심: 0→HOLD_UNTIL 은 치켜든 채 대기(윈드업)하고, HOLD_UNTIL→IMPACT_AT 에 짧고 빠르게 내리꽂는다
// (스냅 = 쾌감). 임팩트는 결과 분출(BURST_AT = SHAKE_SEC) "직전"에 둬 친다 → 한 박자 뒤 터진다.
const IMPACT_AT = SHAKE_SEC - 0.04 // 망치가 닿는 순간(분출 직전). 더 동시면 +α, 더 떨어뜨리려면 -α
const HOLD_UNTIL = IMPACT_AT - 0.14 // 여기까지 치켜든 채 대기 → 이후 0.14s 동안 빠르게 내리꽂는다(스냅)
const RECOIL_AT = IMPACT_AT + 0.09 // 반동 정점
const SETTLE_AT = IMPACT_AT + 0.16 // 정착
const MOTION_SEC = IMPACT_AT + 0.4 // 임팩트 후 반동+들어올림까지 포함한 전체 모션 길이
const TAIL_MS = 60 // 모션 종료 후 효과가 running 에서 빠질 때까지 여유(ShakeBurst 의 +60 관례)

// 내부 계산 → 아래 export 는 식별자 참조로 노출한다(react-refresh: 컴포넌트 파일에서 비-컴포넌트
// export 의 최상위가 함수 호출이면 경고하므로, ShakeBurst 의 TOTAL_MS 관례처럼 const 로 받아 내보낸다).
const IMPACT_MS = Math.round(IMPACT_AT * 1000)
const TOTAL_MS = Math.round(MOTION_SEC * 1000) + TAIL_MS

// 망치가 검에 닿는 시각(ms) — GameScreen 이 'enhance'("캉!") 사운드를 이만큼 미뤄 타격음을 임팩트에 맞춘다.
export const HAMMER_IMPACT_MS = IMPACT_MS
// 연출 전체 길이(ms) — Effect 'hammerStrike' 의 durationMs + useOneShot 수명. 단일 출처.
export const HAMMER_STRIKE_MS = TOTAL_MS

export type HammerStrikeEvent = { id: number }

export function HammerStrike({ event }: { event: HammerStrikeEvent | null }) {
  const active = useOneShot(event, HAMMER_STRIKE_MS)

  return (
    <div
      className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-visible"
      aria-hidden
    >
      <AnimatePresence>
        {active && (
          <motion.img
            key={active.id}
            src={HAMMER_SPRITE}
            alt=""
            draggable={false}
            className="h-24 w-24 object-contain drop-shadow-[0_6px_10px_rgba(0,0,0,0.35)] sm:h-28 sm:w-28"
            style={{ imageRendering: 'pixelated' }}
            initial={{
              x: START.x,
              y: START.y,
              rotate: BASE_ROTATE + WINDUP_TILT,
              scale: 0.9,
              opacity: 0,
            }}
            animate={{
              // 치켜듦(START)→윈드업(HOLD) 대기 → 빠른 스냅으로 내리꽂아 따라넘김(-FOLLOW_TILT)·확대로
              // 강타(IMPACT) → 반동(RECOIL) → 정착(SETTLE) → 다시 오른쪽 위로 젖히며 사라짐(LIFT).
              x: [START.x, HOLD.x, IMPACT.x, RECOIL.x, SETTLE.x, LIFT.x],
              y: [START.y, HOLD.y, IMPACT.y, RECOIL.y, SETTLE.y, LIFT.y],
              rotate: [
                BASE_ROTATE + WINDUP_TILT,
                BASE_ROTATE + WINDUP_TILT + 8,
                BASE_ROTATE - FOLLOW_TILT,
                BASE_ROTATE - 4,
                BASE_ROTATE + 2,
                BASE_ROTATE + WINDUP_TILT - 10,
              ],
              scale: [0.9, 0.95, 1.08, 1.0, 1.0, 0.9],
              opacity: [0, 1, 1, 1, 1, 0],
            }}
            transition={{
              duration: MOTION_SEC,
              // 대기(0→HOLD_UNTIL) → 스냅(→IMPACT_AT, easeIn 가속) → 반동 → 정착 → 들어올림.
              times: [
                0,
                HOLD_UNTIL / MOTION_SEC,
                IMPACT_AT / MOTION_SEC,
                RECOIL_AT / MOTION_SEC,
                SETTLE_AT / MOTION_SEC,
                1,
              ],
              ease: ['easeInOut', 'easeIn', 'easeOut', 'easeOut', 'easeIn'],
              // opacity 는 위치 곡선과 분리한다 — 치켜든 동안에도 또렷이 보이도록 초반에 빠르게 켜고,
              // 마지막 들어올림 구간에서만 끈다.
              opacity: {
                duration: MOTION_SEC,
                times: [0, 0.12, 0.3, 0.5, SETTLE_AT / MOTION_SEC, 1],
                ease: 'easeOut',
              },
            }}
            // 연출 중 다시 강화하면(망치 위에 망치) 옛 망치를 즉시 지우고 새 타격을 처음부터 튼다 —
            // exit 페이드를 두지 않아 AnimatePresence 가 키 교체 시 옛 노드를 곧장 제거한다(교차 페이드
            // 겹침 없는 하드 컷). 자연 종료 시엔 이미 마지막 키프레임이 opacity 0 이라 사라짐에 차이 없다.
          />
        )}
      </AnimatePresence>
    </div>
  )
}
