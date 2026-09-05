import { useEffect, useRef } from 'react'
import { motion, useAnimationControls } from 'motion/react'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { itemSpriteUrl } from '../lib/sprites'
import {
  computeHammerMotion,
  strikeTarget,
  type HammerShape,
} from './hammerTiming'
import { swingKeyframes } from './hammerSwing'
import { TRAIL_BLUR_PX } from './hammerTrail'
import { HammerSmearSystem } from './hammerSmear'

// 강화 "내려치기" 연출(프레젠테이션 전용) — 강화 시도마다(성공·파괴·방지 무관) 호라드릭 망치가
// 오른쪽 위로 치켜들었다가 빠르게 휘둘러 내리꽂고, 그 자리에서 바로 사라진다(회수 없음). 게임 로직과
// 분리되어 'hammerStrike' 이벤트(재생 id)에만 반응한다 — 결과가 무엇이었는지는 모른 채 "내려치는 동작"만
// 그린다(성공·파괴·방지 공통). 타이밍은 Effect 시스템(durationMs)이 소유한다.
//
// 단일 인스턴스 재사용 — 다른 1회성 연출(OneShotOverlay+AnimatePresence)과 달리, 망치는 항상 마운트된
// 고정 노드 한 벌(본체 motion.img + 스미어 캔버스)을 두고 새 이벤트 id 가 올 때 같은 노드의 애니메이션을
// 처음부터 재시작한다(useAnimationControls). 키 교체로 새 노드를 마운트하면 연사(꾹 누름) 중 옛 망치와 새
// 망치가 한 프레임 겹쳐 좌우로 쓸려 보이므로, 노드를 재사용해 "동시에 망치는 항상 1세트"를 보장한다(하드 컷).
// 대기(연출 전후)엔 INITIAL(opacity 0)에 머물러 보이지 않는다.
//
// 머리 잔상(스프라이트 모션 블러)은 본체 뒤에 깔린 캔버스 한 장 — 본체 motion.img 가 매 프레임 실제로
// 그린 포즈(onUpdate)를 그대로 받아, 물감을 찍고 끌듯 궤적 위에 실루엣 자국을 연속으로 찍는다. 자국은
// 나이로 옅어져(머리=진함→꼬리=옅음) 하나의 스미어가 되고, 빠른 스냅에서만 생긴다(속도 게이트 —
// 느린 윈드업에선 자연히 안 보임). 계산은 hammerTrail.ts(순수)·그리기는 hammerSmear.ts 참고.
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

// 좁은(세로) 화면 보정의 분기점 — 폭이 좁으면 치켜든 자세가 화면 밖으로 넘쳐 가로 스크롤/줌을
// 만들므로, 호의 x 를 안쪽으로 압축한다(계산은 hammerSwing.ts 의 narrow 분기 — 임팩트 x 는 불변).
// 기준폭(sm=640px)은 눈으로 맞추는 튜닝값. (가로 넘침 자체는 루트의 overflow-x 가 한 번 더 막는다
// — GameScreen 최상위 컨테이너.)
const NARROW_RAISE_QUERY = '(max-width: 640px)'

// 궤적(피벗 호 + 손목 스냅 모델·튜닝 상수)은 hammerSwing.ts, 타임라인(모션 시각 도출)·키프레임 타깃
// 조립은 hammerTiming.ts — 둘 다 순수 모듈이다. 임팩트 시각만 데이터에서 오고, 임팩트 "포즈"는
// hammerSwing 의 앵커 상수다(떨림·불꽃·타격음과 동기화되는 지점이라 튜닝해도 변하지 않는다).

export type HammerStrikeEvent = { id: number }

export function HammerStrike({
  event,
  impactMs,
  shape,
  smearEnabled,
}: {
  event: HammerStrikeEvent | null
  impactMs: number // 망치가 검에 닿기까지(데이터 hammerImpactMs) — 떨림·불꽃·타격음의 공통 앵커
  shape: HammerShape // 모션 모양(윈드업·정지·페이드아웃) — GameScreen 이 데이터에서 조립해 넘긴다
  smearEnabled: boolean // 모션 블러 스미어 on/off(데이터 hammerSmearEnabled) — false 면 캔버스·시스템·push 전부 생략
}) {
  const m = computeHammerMotion(impactMs / 1000, shape)

  // 좁은(세로) 화면이면 호의 x 를 안쪽으로 압축해 화면 밖에서 시작하지 않게 한다(위 주석 참고).
  const narrowRaise = useMediaQuery(NARROW_RAISE_QUERY)
  // 스윙 전체 키프레임(피벗 호 샘플) — 등장 포즈(initial)와 재생 타깃이 같은 배열을 본다.
  const kf = swingKeyframes(m, narrowRaise)

  // 본체(또렷한 컬러 망치) — 항상 마운트된 motion.img 를 useAnimationControls 로 명령형 재생한다. motion 이
  // transform/opacity 를 단독 소유하므로(React 인라인 style 과 충돌 없음) 평범한 <img>+useAnimate 처럼 재렌더가
  // 애니메이션을 끊지 않는다. 새 이벤트마다 같은 노드를 재시작 → 동시에 본체 항상 1개·겹침 없음.
  const controls = useAnimationControls()

  // 머리 스프라이트 모션 블러(흰 스미어) — 본체 뒤 캔버스 한 장 + 시스템(마운트 1회 생성, 언마운트 시
  // rAF 정리). 본체 img 의 실측 크기로 자국 크기를 맞추려 본체에도 ref 를 단다.
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bodyRef = useRef<HTMLImageElement>(null)
  const smearRef = useRef<HammerSmearSystem | null>(null)
  useEffect(() => {
    // 스미어가 데이터 플래그로 꺼져 있으면 캔버스가 렌더되지 않아(아래 조건부) 시스템도 만들지 않는다 —
    // 이후 begin/push 는 옵셔널 체이닝으로 자동 no-op(궤적 계산 비용 0).
    if (!smearEnabled) return
    if (canvasRef.current && !smearRef.current) {
      smearRef.current = new HammerSmearSystem(canvasRef.current, HAMMER_SPRITE)
      smearRef.current.warmup()
      // blur 는 실루엣에 1회 베이크된다(hammerSmear) — 대형 캔버스 레이어에 CSS filter 를 상시
      // 걸면 매 합성마다 blur 를 다시 계산해 모바일에서 비싸다. ctx.filter 미지원(구형 WebKit)
      // 환경만 기존 CSS filter 로 폴백해 같은 시각을 유지한다.
      if (smearRef.current.needsCssBlur()) {
        canvasRef.current.style.filter = `blur(${TRAIL_BLUR_PX}px)`
      }
    }
    return () => {
      smearRef.current?.dispose()
      smearRef.current = null
    }
  }, [smearEnabled])

  // 본체가 매 프레임 실제로 그린 변환을 스미어 펜에 흘린다 — 본체와 잔상이 구조적으로 같은 궤적(키프레임
  // 재구현 없음 → easing 이 바뀌어도 어긋날 수 없다). 자국을 남길지는 순수 코어의 속도 게이트가 정한다.
  const onBodyUpdate = (latest: Record<string, string | number>) => {
    smearRef.current?.push({
      x: Number(latest.x),
      y: Number(latest.y),
      rotate: Number(latest.rotate),
      scale: Number(latest.scale),
    })
  }

  // 휴면(연출 전후) 포즈 — opacity 0 으로 안 보임. 매 재생은 여기서 시작해 키프레임을 처음부터 튼다.
  const initial = {
    x: kf.x[0],
    y: kf.y[0],
    rotate: kf.rotate[0],
    scale: kf.scale[0],
    opacity: 0,
  }

  // 1회 재생: 같은 노드를 INITIAL 로 하드 리셋한 뒤 키프레임을 처음부터 튼다(연사·재강화에도 겹침 없이
  // 재시작). 끝 키프레임이 opacity 0 이라 끝나면 알아서 사라진다. 스미어도 같은 순간 하드 컷(begin) —
  // 이전 강화의 잔상을 즉시 비워 "스미어는 항상 1세트"를 본체와 같은 규약으로 지킨다.
  const play = () => {
    // 본체 img 의 실측 렌더 크기(rem 반응 스케일 반영)를 자국 크기로 — 측정 전(0)이면 자국을 안 그린다.
    smearRef.current?.begin(bodyRef.current?.clientWidth ?? 0)
    controls.set(initial)
    controls.start(strikeTarget(kf, m))
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

  // 스미어 캔버스를 먼저(밑에) 깔고 본체(또렷한 컬러)를 위에 덮는다 — 본체와 겹치는 머리 부분은 본체가
  // 가리고, 궤적 위에 남은 자국만 흰 스미어로 보인다. 캔버스는 박스 중심 정렬(중심 = 포즈 좌표 원점)이고
  // 스윙 전체(치켜든 오른쪽 위 ~ 임팩트)를 덮는 고정 크기다. 본체는 grid place-items-center 로 박스 중앙
  // 정렬(transform 중앙 정렬은 motion 의 x/y/rotate/scale 과 충돌하므로 grid 로 위치).
  return (
    <div
      className="pointer-events-none absolute inset-0 grid place-items-center overflow-visible"
      aria-hidden
    >
      {smearEnabled && (
        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute left-1/2 top-1/2"
          // blur(자국 경계를 녹여 한 덩어리 물감 스미어로)는 실루엣 베이크가 담당 — 여기 CSS filter 를
          // 걸지 않는다(위 effect 의 ctx.filter 미지원 폴백만 예외). 머리의 또렷함은 위에 덮이는 본체가 담당.
          // 크기는 스윙 호 전체(윈드업 x≈265px + 회전 스프라이트 반경)를 덮도록 ±368×±256px.
          style={{
            width: '46rem',
            height: '32rem',
            marginLeft: '-23rem',
            marginTop: '-16rem',
          }}
        />
      )}
      <motion.img
        ref={bodyRef}
        src={HAMMER_SPRITE}
        alt=""
        draggable={false}
        className="fx-layer h-24 w-24 object-contain sm:h-28 sm:w-28"
        style={{ imageRendering: 'pixelated' }}
        initial={initial}
        animate={controls}
        // 스미어가 꺼져 있으면 매 프레임 포즈 push(onUpdate) 자체를 달지 않는다 — 콜백·궤적 계산 비용 0.
        onUpdate={smearEnabled ? onBodyUpdate : undefined}
      />
    </div>
  )
}
