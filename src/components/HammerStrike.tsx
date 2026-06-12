import { useEffect, useRef } from 'react'
import { motion, useAnimationControls } from 'motion/react'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { itemSpriteUrl } from '../lib/sprites'
import { computeHammerMotion, type HammerShape } from './hammerTiming'

// 강화 "내려치기" 연출(프레젠테이션 전용) — 강화 시도마다(성공·파괴·방지 무관) 호라드릭 망치가
// 오른쪽 위로 치켜들었다가 빠르게 휘둘러 내리꽂고, 그 자리에서 바로 사라진다(회수 없음). 게임 로직과
// 분리되어 'hammerStrike' 이벤트(재생 id)에만 반응한다 — 결과가 무엇이었는지는 모른 채 "내려치는 동작"만
// 그린다(성공·파괴·방지 공통). 타이밍은 Effect 시스템(durationMs)이 소유한다.
//
// 단일 인스턴스 재사용 — 다른 1회성 연출(OneShotOverlay+AnimatePresence)과 달리, 망치는 항상 마운트된
// motion.img 한 개를 두고 새 이벤트 id 가 올 때 같은 노드의 애니메이션을 처음부터 재시작한다
// (useAnimationControls). 키 교체로 새 노드를 마운트하면 연사(꾹 누름) 중 옛 망치와 새 망치가 한 프레임
// 겹쳐 좌우로 쓸려 보이므로, 노드를 재사용해 "동시에 망치는 항상 1개"를 보장한다(하드 컷). 대기(연출 전후)
// 엔 INITIAL(opacity 0)에 머물러 보이지 않는다.
//
// 쾌감(immediacy)을 위해 "느린 활강"이 아니라 "치켜듦 → 빠른 스냅 → 강타"로 친다: 등장 즉시 오른쪽
// 위에 치켜든 자세로 나타나(클릭 피드백) 잠깐 윈드업한 뒤, 임팩트 직전(holdUntil→impactSec)에 짧고
// 빠르게(easeIn 가속) 휘둘러 내리꽂아 강타한다. 임팩트 시각(impactMs)은 데이터(animation.json)에서
// 오며, 바로 그 순간 무기 떨림·Hit 불꽃·'캉' 타격음이 시작된다(GameScreen 이 같은 impactMs 로 셋을 맞춘다).
//
// SwordStage 의 spriteOverlay 슬롯에 얹어 검 박스 위 전면에 그린다 — 그 슬롯은 떨림 레이어 밖 형제라
// (SwordStage 주석 참고) 망치는 검과 함께 흔들리지 않는다. overflow-visible 라 박스 밖(오른쪽 위)으로 나가도
// 잘리지 않는다(파티클 오버레이와 동일). 자세는 스프라이트 자연 방향 그대로 머리=위·손잡이=아래.

const HAMMER_SPRITE = itemSpriteUrl('horadric_hammer.png')

// ── 모션 튜닝 상수(브라우저에서 눈으로 맞추는 값) ─────────────────────────────────
// x·y(px): 검 박스 "중심"(0,0) 기준 망치 중심의 위치. x 양수 = 오른쪽, y 음수 = 위.
// 머리=위·손잡이=아래라, 임팩트에서 망치를 검 위(중심 살짝 위)에 겹쳐 머리가 검 윗날 근처에 오게 둔다.
const START = { x: 178, y: -140 } // 등장 즉시 치켜든 자세(오른쪽 위) — overflow-visible 라 박스 밖이어도 안 잘린다
const HOLD = { x: 196, y: -156 } // 살짝 더 당겨 든 윈드업(앤티시페이션) — 곧 휘둘러 내리꽂을 준비
// 임팩트 자세를 더 꺾으면(FOLLOW_TILT↑) 회전 중심 기준으로 머리가 좌하로 이동한다 — 그만큼 IMPACT 를
// 우상으로 보정해 머리가 계속 마법진 정중앙에 닿게 한다(휘두르는 궤적이라 START 가 오른쪽 위로 멀다).
const IMPACT = { x: 24, y: -3 } // 내리꽂은 순간 — 망치 머리가 마법진(검 박스) 정중앙에 닿는다(더 꺾인 자세 보정)
const BASE_ROTATE = 0 // 임팩트 기준 자세(머리=위, 손잡이=아래). 키프레임의 +는 윈드업(뒤로 젖힘), -는 따라넘김
const WINDUP_TILT = 56 // 치켜들 때 머리를 오른쪽으로 젖힌 정도(스윙 윈드업) — 클수록 크게 휘두름
const FOLLOW_TILT = 56 // 임팩트에서 휘둘러 따라넘긴 정도(반대 방향 기울임) — 클수록 더 꺾인 타격 자세

// 좁은(세로) 화면 보정 — 치켜든 자세(START·HOLD)의 +x 가 검 박스 중심에서 오른쪽으로 멀리 나가면 폭이
// 좁을 때 화면 밖으로 넘쳐 가로 스크롤/줌(확대처럼 보임)을 만든다. 그 raised 위치의 x 만 안쪽으로 줄여
// (임팩트 부근 위치는 그대로) 화면 안에서 시작하게 한다. 임팩트는 검 근처라 영향 없음.
// 값(0.6)·기준폭(sm=640px)은 눈으로 맞추는 튜닝값 — 거슬리면 조정. (가로 넘침 자체는 루트의 overflow-x 가
// 한 번 더 막는다 — GameScreen 최상위 컨테이너.)
const NARROW_RAISE_QUERY = '(max-width: 640px)'
const NARROW_RAISE_X_SCALE = 0.6

// 타임라인(망치 모션의 시각 도출)은 hammerTiming.ts(순수 모듈)가 소유한다 — 임팩트 앵커만 데이터에서
// 오고, 윈드업·정지·페이드아웃은 그 임팩트 기준 상대 오프셋이다. 컴포넌트는 그 결과(키프레임 times)만 쓴다.

export type HammerStrikeEvent = { id: number }

export function HammerStrike({
  event,
  impactMs,
  shape,
}: {
  event: HammerStrikeEvent | null
  impactMs: number // 망치가 검에 닿기까지(데이터 hammerImpactMs) — 떨림·불꽃·타격음의 공통 앵커
  shape: HammerShape // 모션 모양(윈드업·정지·페이드아웃) — GameScreen 이 데이터에서 조립해 넘긴다
}) {
  const m = computeHammerMotion(impactMs / 1000, shape)

  // 좁은(세로) 화면이면 치켜든 위치의 x 를 안쪽으로 줄여 화면 밖에서 시작하지 않게 한다(위 주석 참고).
  const narrowRaise = useMediaQuery(NARROW_RAISE_QUERY)
  const raiseX = (v: number) => (narrowRaise ? v * NARROW_RAISE_X_SCALE : v)

  // 단일 인스턴스 — 항상 마운트된 motion.img 한 개를 useAnimationControls 로 명령형 재생한다. motion 이
  // transform/opacity 를 단독 소유하므로(React 인라인 style 과 충돌 없음) 평범한 <img>+useAnimate 처럼 재렌더가
  // 애니메이션을 끊지 않는다. 새 이벤트마다 같은 노드를 재시작 → 동시에 망치 항상 1개·겹침 없음.
  const controls = useAnimationControls()

  // 휴면(연출 전후) 포즈 — opacity 0 으로 안 보임. 매 재생은 여기서 시작해 키프레임을 처음부터 튼다.
  const initial = {
    x: raiseX(START.x),
    y: START.y,
    rotate: BASE_ROTATE + WINDUP_TILT,
    scale: 0.9,
    opacity: 0,
  }

  // 1회 재생: 같은 노드를 INITIAL 로 하드 리셋한 뒤 키프레임을 처음부터 튼다(연사·재강화에도 겹침 없이 재시작).
  // 끝 키프레임이 opacity 0 이라 끝나면 알아서 사라진다.
  const play = () => {
    controls.set(initial)
    controls.start({
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
      transition: {
        duration: m.motionSec,
        // 대기(0→holdUntil) → 스냅(→impact, easeIn 가속) → 제자리 페이드아웃.
        times: [0, m.holdUntil / m.motionSec, m.impactSec / m.motionSec, 1],
        ease: ['easeInOut', 'easeIn', 'linear'],
        // opacity 는 위치 곡선과 분리한다 — 치켜든 동안에도 또렷이 보이도록 초반에 빠르게 켜고,
        // 정지 구간 동안 유지했다가 페이드아웃. 페이드인 지점(0.12)은 임팩트보다 늦으면 times 가
        // 비단조가 돼(motion 거부) — 임팩트 비율로 클램프한다(위치 times 는 holdUntil≤impact≤motion 이라 안전).
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
      },
    })
  }

  // 아래 재생 effect 가 이벤트 id 변화에만 반응하도록(impactMs·shape·narrowRaise 를 deps 에 넣으면 매
  // 렌더/연출 중 재시작돼 끊긴다) 최신 재생 클로저를 ref 로 넘긴다 — render 중 ref 쓰기는 금지라 effect 에서
  // 갱신한다(이 effect 가 아래 재생 effect 보다 먼저 선언돼, 같은 커밋에서 먼저 실행돼 항상 최신을 가리킨다).
  const playRef = useRef(play)
  useEffect(() => {
    playRef.current = play
  })

  // 새 이벤트 id 가 올 때마다 같은 인스턴스에서 1회 재생. id 가 그대로면(같은 강화의 리렌더) 재시작하지
  // 않는다 — event 객체는 매번 새로 만들어지므로 id(원시값)만 본다.
  const playId = event?.id
  useEffect(() => {
    if (playId !== undefined) playRef.current()
  }, [playId])

  return (
    <div
      className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-visible"
      aria-hidden
    >
      <motion.img
        src={HAMMER_SPRITE}
        alt=""
        draggable={false}
        className="h-24 w-24 object-contain drop-shadow-[0_6px_10px_rgba(0,0,0,0.35)] sm:h-28 sm:w-28"
        style={{ imageRendering: 'pixelated' }}
        initial={initial}
        animate={controls}
      />
    </div>
  )
}
