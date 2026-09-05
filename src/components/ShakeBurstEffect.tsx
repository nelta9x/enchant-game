import { useEffect, useLayoutEffect, useRef } from 'react'
import { SpriteCanvasBinding } from '../lib/spriteStore'
import { swordSpriteUrl } from '../lib/sprites'
import { playFx, stopFx } from '../lib/fx'
import { shakeFx } from './shake'
import { makeParticles } from './particles'
import { useParticleEmit } from './particleEmit'

// "떨림 후 분출" 연출(프레젠테이션 전용) — 파괴(적색·검 소멸)와 성공(금색·상위 검 등장)이 색만 달리해
// 같은 시퀀스를 쓴다. 게임 로직과 분리되어 이벤트(재생 id + 잔상 스프라이트 + 파티클 수 + 임팩트/떨림
// 타이밍)에만 반응하며 상태를 바꾸지 않고 그리기만 한다.
//
// 연출(t=0 = 강화 시점):
//   [0, impact)        잔상(강화 전 검)이 가만히 있는다 — 망치는 아직 윈드업 중.
//   [impact, burstAt)  망치가 닿은 순간부터 잔상이 덜덜 떤다(검 데이터 떨림 시간 shakeMs, 0 = 떨림 없음).
//   burstAt            떨림 끝 → 잔상이 팝업·소멸하고, 파티클이 풀에서 사방으로 터진다(성공=금/파괴=적).
//
// ── 두 책임을 분리한다(BurstEmitter / ShakeAfterimage) ────────────────────────────────
// 파티클 emit 과 잔상 비주얼은 수명·다중성이 다르다:
//   · 파티클 emit 은 "버스트마다" 1회 필요하다 — 연사로 버스트가 겹쳐도 각 버스트가 자기 burstAt 에 한 번씩
//     emit 되도록(유실 방지) GameScreen 이 running 의 버스트를 전부 .map 해 이벤트별 BurstEmitter 를 둔다.
//     단 파티클 풀은 새 emit 마다 이전 버스트를 교체(replace)하므로 화면엔 늘 최신 한 벌만 보인다(잔상의
//     latest 하드 컷과 같은 정책). BurstEmitter 는 DOM 을 그리지 않아(렌더 null) 다중·교체에도 레이어 churn 이 없다.
//   · 잔상 비주얼은 "현재 떠 있는 검 1장"이면 충분하고 색과 무관하다(coreVar/edgeVar 는 파티클 색일 뿐).
//     그래서 ShakeAfterimage 는 SwordStage·HammerStrike 와 같은 **영속 단일 노드**다 — 항상 마운트된 캔버스
//     한 장을 가장 최근 버스트 id 마다 처음부터 재생한다(연사 시 최신으로 하드 컷). 강화마다 노드를 새로
//     마운트/언마운트하면(과거 구조) 매번 합성 레이어를 만들어 모바일 교체 프레임에서 끊김을 유발했다.

export type ShakeBurstEvent = {
  id: number
  sprite: string // 잔상으로 그릴 검 스프라이트 파일명(spriteStore 풀에 이미 적재됨 — get 으로 블릿)
  particleCount: number
  impactMs: number // 망치가 닿는 시각(떨림 시작) — 데이터 기반 고정값
  shakeMs: number // 이번 강화의 떨림 길이(검 데이터, 0 = 떨림 없음) — burstAt = impact + shake
}

// 버스트 파티클 emit 트리거(렌더 null) — burstAt 에 풀로 1회 emit 한다. 색(coreVar/edgeVar)만 달리해
// 성공(금)·파괴(적)가 각자의 인스턴스를 가진다(SuccessEffect/DestructionEffect 가 색을 바인딩). DOM 을
// 그리지 않으므로 GameScreen 이 running 의 버스트를 전부 .map(key=id) 해도 레이어 churn 이 없다.
export function BurstEmitter({
  event,
  coreVar,
  edgeVar,
}: {
  event: ShakeBurstEvent | null
  coreVar: string // 밝은 코어 색(예: 'var(--color-danger-glow)' / 'var(--color-gold-glow)')
  edgeVar: string // 가장자리 색(예: 'var(--color-danger)' / 'var(--color-gold)')
}) {
  const emit = useParticleEmit()

  // event 객체는 매 렌더 새로 만들어지므로 id(원시값)에만 의존해 무관한 리렌더로 두 번 터지지 않게 한다.
  // cleanup 이 이전 타이머를 지워 StrictMode 이중 마운트도 1회로 수렴한다.
  // 새 id(새 강화)마다 burstAt 에 emit 타이머를 건다. 대기 중 타이머는 다음 id 가 와도 취소하지 않는다(겹친 옛
  // 버스트 유실 방지 — 효과 store 가 kind 별 최신만 발행하므로 겹침 보존은 여기 타이머 집합이 책임진다). 언마운트에만 정리.
  const burstId = event?.id ?? null
  const burstAtMs = event ? event.impactMs + event.shakeMs : 0
  const pending = useRef(new Set<ReturnType<typeof setTimeout>>())
  useEffect(() => {
    if (burstId === null || !event) return
    const particleCount = event.particleCount
    const timers = pending.current
    const tid = setTimeout(() => {
      timers.delete(tid)
      emit({
        particles: makeParticles(particleCount),
        coreVar,
        edgeVar,
      })
    }, burstAtMs)
    timers.add(tid)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [burstId])
  useEffect(() => {
    const timers = pending.current
    return () => {
      for (const t of timers) clearTimeout(t)
      timers.clear()
    }
  }, [])

  return null
}

// 잔상(영속 단일 노드) — 가장 최근 버스트 1개를 그린다. 떨림(SHAKE_KEYFRAMES)은 바깥 div(x/rotate),
// 팝업·소멸(scale·opacity)은 안쪽 캔버스로 레이어를 나눈다(서로 다른 transform 키프레임이 한 엘리먼트에서
// 충돌하지 않게). 새 이벤트 id 마다 같은 노드를 처음부터 재생한다 — 마운트/언마운트(레이어 churn) 없이.
// 캔버스는 spriteStore 의 GPU 상주 ImageBitmap 을 블릿하므로(디코드·재업로드 없음) 교체는 그리기만 한다.
// drop-shadow CSS 필터는 걸지 않는다 — 0.22s 팝업 잔상엔 그림자가 사실상 안 보이는데, 필터+transform 을
// 같은 엘리먼트에 거는 건 iOS WebKit 에서 매 프레임 필터 재래스터를 유발한다(교체 프레임 끊김의 잔여 원인).
//
// 스토어는 결과 즉시 검을 교체하므로 무대의 "새 검"은 이미 이 잔상 뒤에 마운트돼 있다. GameScreen 이 그
// 등장을 burstAt 까지 지연(entranceDelay)시켜, 떨림 동안 새 검이 잔상 뒤로 비쳐 "검 두 개"로 보이지 않게
// 한다. burstAt 에 잔상이 소멸하는 순간 새 검이 드러나듯 등장한다 — 둘이 같은 burstAt(타임라인 단일
// 출처)을 쓰므로 정확히 교대된다(crossover).
export function ShakeAfterimage({ event }: { event: ShakeBurstEvent | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const shakeRef = useRef<HTMLDivElement>(null)
  // 잔상 캔버스 바인딩(마운트 1회) — 크기 측정(ResizeObserver)·블릿·자가 치유는 SpriteCanvasBinding 이 소유한다
  // (검 본체·아이콘과 공유). 여기선 이벤트 시점에 스프라이트만 정한다(강제 레이아웃 없음).
  const bindingRef = useRef<SpriteCanvasBinding | null>(null)
  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const binding = new SpriteCanvasBinding(canvas)
    bindingRef.current = binding
    return () => {
      binding.dispose()
      bindingRef.current = null
    }
  }, [])
  // 그리기·재생은 paint 전(useLayoutEffect)에 한다 — 대기 중 opacity 0 이라 깜빡임은 없지만, 연사 중
  // 이전 잔상이 떠 있을 때 새 강화가 오면 같은 프레임에 새 스프라이트로 갈아 그려 옛 잔상이 한 프레임
  // 비치지 않게 한다(하드 컷). id 만 의존해 무관한 리렌더로 재시작하지 않는다(event 객체는 매번 새로 생성).
  const evtId = event?.id ?? null
  useLayoutEffect(() => {
    if (evtId === null || !event) return
    bindingRef.current?.setSprite(swordSpriteUrl(event.sprite))
    // 떨림 — 망치가 닿는 순간(impact)부터 검 데이터 떨림 시간(shakeMs)만큼. delay 동안은 가만히 있는다(윈드업).
    // shakeMs 0 이하면 떨림 없음 → 원점만 두고 재생은 건너뛴다(잔상은 burstAt=impact 에 그대로 팝업·소멸).
    if (event.shakeMs > 0) {
      playFx(shakeRef.current, shakeFx(event.shakeMs / 1000, event.impactMs / 1000))
    } else {
      stopFx(shakeRef.current)
    }
    // 팝업·소멸 — 떨림 동안 opacity 1(강화 전 검 노출)로 가만히 있다가(delay 동안 첫 키프레임 유지) burstAt 에
    // 팝업 후 소멸(opacity 0). 끝 상태가 opacity 0 이라 연출이 끝나면 알아서 숨는다(영속 노드 — 다음 재생 대기).
    playFx(canvasRef.current, {
      channels: { scale: [1, 1.18, 0.5], opacity: [1, 1, 0] },
      durationSec: 0.22,
      delaySec: (event.impactMs + event.shakeMs) / 1000,
      times: [0, 0.45, 1],
      ease: 'easeOut',
    })
  }, [evtId])

  return (
    <div
      className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-visible"
      aria-hidden
    >
      {/* 떨림 레이어(x/rotate) — 대기 시 원점(initial). */}
      <div ref={shakeRef} className="fx-layer flex items-center justify-center">
        {/* 잔상 캔버스(scale/opacity) — 실제 검(SwordStage)과 크기·픽셀아트 보간을 같게 그린다(소멸→새 검
            노출이 튀지 않게). drop-shadow 는 걸지 않는다(위 주석). 대기 시 opacity 0 으로 숨는다. */}
        <canvas
          ref={canvasRef}
          aria-hidden
          className="fx-layer h-36 w-36 object-contain sm:h-40 sm:w-40"
          style={{ imageRendering: 'pixelated', opacity: 0 }}
        />
      </div>
    </div>
  )
}
