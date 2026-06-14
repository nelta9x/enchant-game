import { useLayoutEffect, useRef } from 'react'
import { motion, useAnimationControls } from 'motion/react'
import { drawSpriteContain } from '../lib/spriteStore'
import { swordSpriteUrl } from '../lib/sprites'
import { SHAKE_KEYFRAMES, makeShakeTransition } from './shake'

// "떨림 후 결과" 연출(프레젠테이션 전용) — 파괴와 성공이 떨림까지는 같은 시퀀스를 쓰고, 떨림이 끝나는
// 순간(burstAt) 결과별로 잔상(강화 전 검)을 정리한다. 게임 로직과 분리되어 이벤트(재생 id + 잔상 스프라이트
// + 결과 + 임팩트/떨림 타이밍)에만 반응하며 상태를 바꾸지 않고 그리기만 한다.
//
// 연출(t=0 = 강화 시점):
//   [0, impact)        잔상(강화 전 검)이 가만히 있는다 — 망치는 아직 윈드업 중.
//   [impact, burstAt)  망치가 닿은 순간부터 잔상이 덜덜 떤다(무작위 떨림 시간 shakeMs).
//   burstAt            떨림 끝 → 잔상 정리:
//                        · 성공: 잔상이 팝업·소멸하고, 그 자리를 새(상위) 검이 백열로 잇는다(SwordStage).
//                        · 파괴: 잔상이 아래에서 위로 재가 되어 흩어지듯 디졸브 소멸한다(파티클 없이 마스크 침식).
//
// ShakeAfterimage 는 SwordStage·HammerStrike 와 같은 **영속 단일 노드**다 — 항상 마운트된 캔버스 한 장을
// 가장 최근 버스트 id 마다 처음부터 재생한다(연사 시 최신으로 하드 컷). 강화마다 노드를 새로 마운트/언마운트하면
// 매번 합성 레이어를 만들어 모바일 교체 프레임에서 끊김을 유발하므로 영속으로 둔다. 캔버스는 spriteStore 의 GPU
// 상주 ImageBitmap 을 블릿한다(디코드·재업로드 없음 — 교체는 그리기만).

export type ShakeBurstEvent = {
  id: number
  sprite: string // 잔상으로 그릴 검 스프라이트 파일명(spriteStore 풀에 이미 적재됨 — get 으로 블릿)
  outcome: 'success' | 'destruction' // 떨림 끝의 잔상 정리 방식(성공=팝업 소멸 / 파괴=디졸브 소멸)
  impactMs: number // 망치가 닿는 시각(떨림 시작) — 데이터 기반 고정값
  shakeMs: number // 이번 강화의 떨림 길이(무작위) — burstAt = impact + shake
}

// 디졸브 마스크 — 아래(0%=하단)에서 위로 침식한다. --dissolve 가 커질수록 transparent 영역(지워진 부분)이
// 하단에서 위로 자란다. 미설정 폴백(-40%)은 침식 0(전체 보임)이라 성공 잔상에도 안전하게 공유한다.
const DISSOLVE_MASK =
  'linear-gradient(to top, transparent var(--dissolve, -55%), #000 calc(var(--dissolve, -55%) + 55%))'

// 잔상(영속 단일 노드) — 가장 최근 버스트 1개를 그린다. 떨림(SHAKE_KEYFRAMES)은 바깥 div(x/rotate),
// 결과 정리(scale·opacity·마스크 침식)는 안쪽 캔버스로 레이어를 나눈다(서로 다른 transform 키프레임이 한
// 엘리먼트에서 충돌하지 않게). 새 이벤트 id 마다 같은 노드를 처음부터 재생한다 — 마운트/언마운트(레이어 churn) 없이.
//
// 스토어는 결과 즉시 검을 교체하므로 무대의 "새 검"은 이미 이 잔상 뒤에 마운트돼 있다. GameScreen 이 그
// 등장을 burstAt 까지 지연(entranceDelay)시켜, 떨림 동안 새 검이 잔상 뒤로 비쳐 "검 두 개"로 보이지 않게
// 한다. burstAt 에 잔상이 소멸하는 순간 새 검이 드러나듯 등장한다 — 둘이 같은 burstAt(타임라인 단일
// 출처)을 쓰므로 정확히 교대된다(crossover).
export function ShakeAfterimage({ event }: { event: ShakeBurstEvent | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const shakeControls = useAnimationControls()
  const popControls = useAnimationControls()
  // 그리기·재생은 paint 전(useLayoutEffect)에 한다 — 대기 중 opacity 0 이라 깜빡임은 없지만, 연사 중
  // 이전 잔상이 떠 있을 때 새 강화가 오면 같은 프레임에 새 스프라이트로 갈아 그려 옛 잔상이 한 프레임
  // 비치지 않게 한다(하드 컷). id 만 의존해 무관한 리렌더로 재시작하지 않는다(event 객체는 매번 새로 생성).
  const evtId = event?.id ?? null
  useLayoutEffect(() => {
    if (evtId === null || !event) return
    const canvas = canvasRef.current
    if (canvas) drawSpriteContain(canvas, swordSpriteUrl(event.sprite))
    const burstAtSec = (event.impactMs + event.shakeMs) / 1000
    // 떨림 — 망치가 닿는 순간(impact)부터 무작위 길이(shakeMs)만큼. delay 동안은 가만히 있는다(윈드업).
    shakeControls.set({ x: 0, rotate: 0 })
    shakeControls.start({
      ...SHAKE_KEYFRAMES,
      transition: makeShakeTransition(
        event.shakeMs / 1000,
        event.impactMs / 1000,
      ),
    })
    // 결과 정리는 떨림 동안 opacity 1(강화 전 검 노출)로 가만히 있다가 burstAt 에 시작한다. 끝 상태가
    // opacity 0 이라 연출이 끝나면 알아서 숨는다(영속 노드 — 마운트/언마운트 없이 다음 재생 대기).
    // --dissolve 는 매 재생 시작에 -40%(전체 보임)로 되돌린다 — 직전 파괴가 남긴 140%(전부 침식)가
    // 다음 성공 잔상을 통째로 지우지 않게(영속 노드 공유 상태 초기화).
    if (event.outcome === 'destruction') {
      // 파괴 = 디졸브 소멸. 잔상이 아래에서 위로 재가 되어 흩어지듯(마스크 침식) 떠오르며 사라진다.
      popControls.set({ scale: 1, opacity: 1, y: 0, '--dissolve': '-55%' })
      popControls.start({
        '--dissolve': ['-55%', '145%'],
        y: [0, -14, -44],
        opacity: [1, 1, 0.6, 0],
        scale: [1, 1.05, 1.12],
        transition: { delay: burstAtSec, duration: 0.62, ease: 'easeIn' },
      })
    } else {
      // 성공 = 잔상이 빠르게 팝업·소멸하고, 새 검(백열)이 그 자리를 잇는다(SwordStage 의 whiteHotKey).
      popControls.set({ scale: 1, opacity: 1, y: 0, '--dissolve': '-55%' })
      popControls.start({
        scale: [1, 1.18, 0.5],
        opacity: [1, 1, 0],
        transition: {
          delay: burstAtSec,
          duration: 0.22,
          times: [0, 0.45, 1],
          ease: 'easeOut',
        },
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evtId])

  return (
    <div
      className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-visible"
      aria-hidden
    >
      {/* 떨림 레이어(x/rotate) — 대기 시 원점(initial). */}
      <motion.div
        className="flex items-center justify-center"
        initial={{ x: 0, rotate: 0 }}
        animate={shakeControls}
      >
        {/* 잔상 캔버스(scale/opacity/마스크) — 실제 검(SwordStage)과 크기·픽셀아트 보간을 같게 그린다
            (소멸→새 검 노출이 튀지 않게). 디졸브 마스크는 var(--dissolve) 로 침식 위치를 받아 파괴 때만
            애니메이트한다. 대기 시 opacity 0 으로 숨는다. */}
        <motion.canvas
          ref={canvasRef}
          aria-hidden
          className="h-36 w-36 object-contain sm:h-40 sm:w-40"
          style={{
            imageRendering: 'pixelated',
            WebkitMaskImage: DISSOLVE_MASK,
            maskImage: DISSOLVE_MASK,
          }}
          initial={{ scale: 1, opacity: 0 }}
          animate={popControls}
        />
      </motion.div>
    </div>
  )
}
