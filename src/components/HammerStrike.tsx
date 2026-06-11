import { AnimatePresence, motion } from 'motion/react'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { itemSpriteUrl } from '../lib/sprites'
import {
  computeHammerMotion,
  hammerStrikeMs,
  type HammerShape,
} from './hammerTiming'
import { useOneShot } from './useOneShot'

// 강화 "내려치기" 연출(프레젠테이션 전용) — 강화 시도마다(성공·파괴·방지 무관) 호라드릭 망치가
// 오른쪽 위에 치켜들렸다가 빠르게 검으로 내리꽂고, 그 자리에서 바로 사라진다(회수 없음). 게임 로직과 분리되어 'hammerStrike' 이벤트(재생 id)에만 반응한다 — 결과가 무엇이었는지는
// 모른 채 "내려치는 동작"만 그린다(성공·파괴·방지 공통). 타이밍/생명주기는 Effect 시스템(durationMs)이
// 소유하고, useOneShot 이 혹시 남는 이벤트를 만료시킨다(백스톱 — 다른 연출과 동일 관례).
//
// 쾌감(immediacy)을 위해 "느린 활강"이 아니라 "치켜듦 → 빠른 스냅 → 강타"로 친다: 등장 즉시 오른쪽
// 위에 치켜든 자세로 나타나(클릭 피드백) 잠깐 윈드업한 뒤, 임팩트 직전(HOLD_UNTIL→impactSec)에 짧고
// 빠르게(easeIn 가속) 내리꽂아 강타한다. 임팩트 시각(impactMs)은 데이터(animation.json)에서 오며, 바로 그
// 순간 무기 떨림·Hit 불꽃·'캉' 타격음이 시작된다(GameScreen 이 같은 impactMs 로 셋을 맞춘다 — 단일 출처).
// 이전엔 임팩트를 떨림 길이(SHAKE_SEC)에서 파생했지만, 이제 떨림은 임팩트 "뒤"에 시작하므로 임팩트가 앵커다.
//
// SwordStage 의 spriteOverlay 슬롯에 얹어 검 박스 위 전면에 그린다 — 그 슬롯은 떨림 레이어 밖 형제라
// (SwordStage 주석 참고) 망치는 검과 함께 흔들리지 않는다. overflow-visible 라 박스 밖(오른쪽 위)으로
// 나가도 잘리지 않는다(파티클 오버레이와 동일). 자세는 스프라이트 자연 방향 그대로 머리=위·손잡이=아래.

const HAMMER_SPRITE = itemSpriteUrl('horadric_hammer.png')

// ── 모션 튜닝 상수(브라우저에서 눈으로 맞추는 값) ─────────────────────────────────
// x·y(px): 검 박스 "중심"(0,0) 기준 망치 중심의 위치. x 양수 = 오른쪽, y 음수 = 위.
// 머리=위·손잡이=아래라, 임팩트에서 망치를 검 위(중심 살짝 위)에 겹쳐 머리가 검 윗날 근처에 오게 둔다.
const START = { x: 178, y: -140 } // 등장 즉시 치켜든 자세(오른쪽 위) — overflow-visible 라 박스 밖이어도 안 잘린다
const HOLD = { x: 196, y: -156 } // 살짝 더 당겨 든 윈드업(앤티시페이션) — 곧 내리꽂을 준비
// 임팩트 자세를 더 꺾으면(FOLLOW_TILT↑) 회전 중심 기준으로 머리가 좌하로 이동한다 — 그만큼 IMPACT 를
// 우상으로 보정해 머리가 계속 마법진 정중앙에 닿게 한다(RECOIL·SETTLE 도 같은 델타로 이동).
const IMPACT = { x: 24, y: -3 } // 내리꽂은 순간 — 망치 머리가 마법진(검 박스) 정중앙에 닿는다(더 꺾인 자세 보정)
const BASE_ROTATE = 0 // 임팩트 기준 자세(머리=위, 손잡이=아래). 키프레임의 +는 윈드업(뒤로 젖힘), -는 따라넘김
const WINDUP_TILT = 56 // 치켜들 때 머리를 오른쪽으로 젖힌 정도(스윙 윈드업) — 클수록 크게 휘두름
const FOLLOW_TILT = 56 // 임팩트에서 휘둘러 따라넘긴 정도(반대 방향 기울임) — 클수록 더 꺾인 타격 자세

// 좁은(세로) 화면 보정 — 치켜든 자세(START·HOLD·LIFT)의 +x 가 검 박스 중심에서 오른쪽으로 멀리 나가, 폭이
// 좁으면 화면 밖으로 넘쳐 가로 스크롤/줌(확대처럼 보임)을 만든다. 그 raised 위치의 x 만 안쪽으로 줄여
// (임팩트 부근 위치는 그대로) 화면 안에서 시작하게 한다. 임팩트/반동/정착은 검 근처라 영향 없음.
// 값(0.6)·기준폭(sm=640px)은 눈으로 맞추는 튜닝값 — 거슬리면 조정. (가로 넘침 자체는 루트의 overflow-x 가
// 한 번 더 막는다 — GameScreen 최상위 컨테이너.)
const NARROW_RAISE_QUERY = '(max-width: 640px)'
const NARROW_RAISE_X_SCALE = 0.6

// 타임라인(망치 모션의 시각 도출)은 hammerTiming.ts(순수 모듈)가 소유한다 — 임팩트 앵커만 데이터에서
// 오고, 윈드업·반동·정착·들어올림은 그 임팩트 기준 상대 오프셋이다. 컴포넌트는 그 결과(키프레임 times)만 쓴다.

export type HammerStrikeEvent = { id: number }

export function HammerStrike({
  event,
  impactMs,
  shape,
}: {
  event: HammerStrikeEvent | null
  impactMs: number // 망치가 검에 닿기까지(데이터 hammerImpactMs) — 떨림·불꽃·타격음의 공통 앵커
  shape?: HammerShape // 모션 모양(윈드업·정지·페이드아웃) — 미지정 시 hammerTiming 기본값
}) {
  const m = computeHammerMotion(impactMs / 1000, shape)
  const active = useOneShot(event, hammerStrikeMs(impactMs, shape))

  // 좁은(세로) 화면이면 치켜든 위치의 x 를 안쪽으로 줄여 화면 밖에서 시작하지 않게 한다(위 주석 참고).
  const narrowRaise = useMediaQuery(NARROW_RAISE_QUERY)
  const raiseX = (v: number) => (narrowRaise ? v * NARROW_RAISE_X_SCALE : v)

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
              x: raiseX(START.x),
              y: START.y,
              rotate: BASE_ROTATE + WINDUP_TILT,
              scale: 0.9,
              opacity: 0,
            }}
            animate={{
              // 치켜듦(START)→윈드업(HOLD) 대기 → 빠른 스냅으로 내리꽂아 따라넘김(-FOLLOW_TILT)·확대로
              // 강타(IMPACT) → 그 자리에서 페이드아웃(회수 없음).
              x: [raiseX(START.x), raiseX(HOLD.x), IMPACT.x, IMPACT.x],
              y: [START.y, HOLD.y, IMPACT.y, IMPACT.y],
              rotate: [
                BASE_ROTATE + WINDUP_TILT,
                BASE_ROTATE + WINDUP_TILT + 8,
                BASE_ROTATE - FOLLOW_TILT,
                BASE_ROTATE - FOLLOW_TILT,
              ],
              scale: [0.9, 0.95, 1.08, 1.08],
              opacity: [0, 1, 1, 1, 0],
            }}
            transition={{
              duration: m.motionSec,
              // 대기(0→holdUntil) → 스냅(→impact, easeIn 가속) → 제자리 페이드아웃.
              times: [
                0,
                m.holdUntil / m.motionSec,
                m.impactSec / m.motionSec,
                1,
              ],
              ease: ['easeInOut', 'easeIn', 'linear'],
              // opacity 는 위치 곡선과 분리한다 — 치켜든 동안에도 또렷이 보이도록 초반에 빠르게 켜고,
              // 정지 구간 동안 유지했다가 페이드아웃. 페이드인 지점(0.12)은 임팩트보다 늦으면 times 가
              // 비단조가 돼(motion 거부) — DEV 튜닝으로 임팩트를 짧게/정지·페이드를 길게 끌면 발생하므로
              // 임팩트 비율로 클램프한다(위치 times 는 holdUntil≤impact≤motion 이라 이미 안전, opacity 만 보정).
              opacity: {
                duration: m.motionSec,
                times: [
                  0,
                  Math.min(0.12, m.impactSec / m.motionSec),
                  m.impactSec / m.motionSec,
                  m.holdAfterEnd / m.motionSec,
                  1,
                ],
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
