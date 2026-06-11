import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { motion, useAnimationControls } from 'motion/react'
import { dataManager } from '../data/DataManager'
import { PARTICLE_DUR, particleCount, type Particle } from './particles'
import {
  ParticleEmitContext,
  type ParticleEmit,
  type ParticleEmitSpec,
} from './particleEmit'

// 파티클 풀(프레젠테이션 전용) — 성공/실패 버스트의 모든 파티클을 "고정 개수의 영속 노드를 재사용"해
// 그린다(요구사항: 풀링). 기존엔 버스트마다 motion.span 들을 mount/unmount 했지만, 여기선 풀이 앱 수명
// 동안 N개의 파티클 노드를 항상 띄워 두고(평소 opacity 0·투명), emit() 때 비어 있는 슬롯을 골라 색·크기를
// 입히고 명령형(useAnimationControls)으로 한 번 재생시킨 뒤 다시 idle 로 되돌린다. 노드를 새로 만들거나
// 버리지 않으므로(키=인덱스 고정) 재사용이 성립한다.
//
// (Hit 불꽃은 별개다 — 가는 불티 다수가 작은 스테이지에서 DOM 으론 묻혀 캔버스로 그린다. HitSparkCanvas 참고.)
//
// 구조:
//  - dot 슬롯(POOL_SIZE개): 중심에서 사방으로 튀는 작은 파티클. 데이터에서 최대 단계의 버스트 파티클 수
//    × 동시성으로 크기를 도출한다(매직 넘버 대신).
//  - decor 슬롯(DECOR_SIZE개): 버스트의 섬광(flash)+충격파 링. 버스트 1회당 1세트라 작은 링버퍼로 충분하다.
//  - emit(spec): decor 1세트 + 파티클 N개를 idle 우선으로 배정해 재생한다. 모두 바쁘면 가장 오래된 슬롯을
//    라운드로빈으로 재사용한다(넉넉히 잡아 평소엔 발생하지 않음 — 발생 시 약간의 튐만).
//
// 타이밍은 호출 측(연출 컴포넌트)이 소유한다 — 버스트는 "떨림이 끝난 순간"에 emit() 한다. 그래서 풀은
// "지금 이 파티클들을 재생하라"만 알면 되고, delaySec 은 파티클 간 미세 stagger 용이다. emit 컨텍스트·훅·
// 타입(ParticleEmitSpec/ParticleEmit)은 particleEmit.ts(비-컴포넌트 모듈)가 소유한다.

// 동시에 떠 있을 수 있는 버스트 수(빠른 재강화 시 옛 버스트가 끝나기 전 새 버스트가 겹친다) — 풀 크기 산정용.
const CONCURRENCY = 3
// decor(섬광+링) 슬롯 수 — 버스트 1회당 1세트라 동시성의 2배면 넉넉하다.
const DECOR_SIZE = CONCURRENCY * 2

// ── decor 재생 시간(초) — 인라인 매직 넘버 대신 named 상수 ───────────────────────
// 버스트: 부드럽게 부푸는 섬광 + 퍼지는 충격파 링(성공/파괴 공용).
const BURST_FLASH_DUR = 0.45
const BURST_RING_DUR = 0.5

// 풀 dot 슬롯 수를 데이터에서 도출한다(매직 넘버 금지). 최대 단계 버스트 파티클이 시도끼리 CONCURRENCY 만큼 겹친다.
function computePoolSize(): number {
  return particleCount(dataManager.getMaxSwordLevel()) * CONCURRENCY
}

// Provider — 풀(ParticlePool)이 emit 을 등록하고 소비자가 읽는 같은 ref 를 자식 트리에 내려 준다.
// GameScreen 이 검 스테이지(풀·소비자 모두 포함)를 이걸로 감싼다.
export function ParticleEmitProvider({ children }: { children: ReactNode }) {
  const emitRef = useRef<ParticleEmit | null>(null)
  return (
    <ParticleEmitContext.Provider value={emitRef}>
      {children}
    </ParticleEmitContext.Provider>
  )
}

// ── 슬롯 핸들(자식이 부모에 등록하는 명령형 인터페이스) ──────────────────────────
type DotHandle = {
  isBusy: () => boolean
  play: (p: Particle, spec: ParticleEmitSpec) => void
}
type DecorHandle = {
  isBusy: () => boolean
  play: (spec: ParticleEmitSpec) => void
}

// idle(비어 있는) 슬롯을 라운드로빈 시작점부터 우선 고르고, 모두 바쁘면 가장 오래된 슬롯을 재사용한다.
function pickSlot<T extends { isBusy: () => boolean }>(
  slots: (T | null)[],
  rr: { current: number },
): T | null {
  const n = slots.length
  if (n === 0) return null
  for (let k = 0; k < n; k++) {
    const idx = (rr.current + k) % n
    const s = slots[idx]
    if (s && !s.isBusy()) {
      rr.current = (idx + 1) % n
      return s
    }
  }
  const idx = rr.current % n
  rr.current = (idx + 1) % n
  return slots[idx] ?? null
}

export function ParticlePool() {
  const emitRef = useContext(ParticleEmitContext)
  // 풀 크기는 앱 수명 동안 고정(데이터 불변) — 초기화 1회로 잡아 렌더마다 슬롯 수가 흔들리지 않게 한다(훅 규칙).
  const [poolSize] = useState(computePoolSize)

  const dotSlots = useRef<(DotHandle | null)[]>([])
  const decorSlots = useRef<(DecorHandle | null)[]>([])
  const dotRR = useRef(0)
  const decorRR = useRef(0)

  const registerDot = useCallback((i: number, h: DotHandle) => {
    dotSlots.current[i] = h
  }, [])
  const registerDecor = useCallback((i: number, h: DecorHandle) => {
    decorSlots.current[i] = h
  }, [])

  const emit = useCallback((spec: ParticleEmitSpec) => {
    const decor = pickSlot(decorSlots.current, decorRR)
    decor?.play(spec)
    for (const p of spec.particles) {
      const slot = pickSlot(dotSlots.current, dotRR)
      slot?.play(p, spec)
    }
  }, [])

  // 풀의 emit 을 컨텍스트 ref 에 등록 — 소비자가 useParticleEmit 으로 호출한다. emit 은 stable(useCallback []).
  useEffect(() => {
    if (emitRef) emitRef.current = emit
    return () => {
      if (emitRef && emitRef.current === emit) emitRef.current = null
    }
  }, [emitRef, emit])

  // dot/decor 슬롯 인덱스 배열은 poolSize 고정이라 한 번만 만든다(렌더마다 새 배열로 자식이 재마운트되지 않게).
  const dotIndexes = useMemo(
    () => Array.from({ length: poolSize }, (_, i) => i),
    [poolSize],
  )
  const decorIndexes = useMemo(
    () => Array.from({ length: DECOR_SIZE }, (_, i) => i),
    [],
  )

  // 검 박스 정중앙(left-1/2 top-1/2)에서 방출 — 검 스프라이트 오버레이와 같은 좌표 공간.
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2" aria-hidden>
      {decorIndexes.map((i) => (
        <DecorSlot key={i} index={i} register={registerDecor} />
      ))}
      {dotIndexes.map((i) => (
        <DotSlot key={i} index={i} register={registerDot} />
      ))}
    </div>
  )
}

// 파티클 1개(영속 노드) — 평소 투명, play 때 색·크기를 입고 한 번 튀었다가 다시 투명으로 돌아온다(재사용).
function DotSlot({
  index,
  register,
}: {
  index: number
  register: (i: number, h: DotHandle) => void
}) {
  const controls = useAnimationControls()
  // 색·크기는 emit 마다 달라 상태로 둔다(투명일 땐 null). 위치/투명도/스케일은 controls 가 명령형으로 몬다.
  const [style, setStyle] = useState<{
    image: string
    shadow: string
    size: number
  } | null>(null)
  const busyRef = useRef(false)
  const genRef = useRef(0) // 재생 세대 — 선점되면 옛 재생의 완료 콜백이 busy 를 잘못 풀지 않게 한다.

  useEffect(() => {
    register(index, {
      isBusy: () => busyRef.current,
      play: (p, spec) => {
        const gen = ++genRef.current
        busyRef.current = true
        setStyle({
          image: `radial-gradient(circle, ${spec.coreVar}, ${spec.edgeVar})`,
          shadow: `0 0 6px ${spec.coreVar}`,
          size: p.size,
        })
        // 재사용 직전 상태(옛 재생의 끝값)를 원점으로 즉시 리셋한 뒤 재생 — 항상 검 중심에서 출발한다.
        controls.set({ x: 0, y: 0, opacity: 0, scale: 0.4 })
        controls
          .start(
            {
              // 중심에서 사방으로 뻗어 나가며 페이드(방사형 성공/파괴 분출).
              x: p.x,
              y: p.y,
              opacity: [0, 1, 1, 0],
              scale: [0.4, 1, 0.9, 0.45],
            },
            {
              delay: (spec.delaySec ?? 0) + p.stagger,
              duration: PARTICLE_DUR,
              times: [0, 0.15, 0.6, 1],
              ease: 'easeOut',
            },
          )
          .then(() => {
            if (genRef.current === gen) busyRef.current = false
          })
      },
    })
    // register/index 는 stable, controls 도 stable — 마운트 1회 등록이면 충분하다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <motion.span
      className="absolute rounded-full"
      style={
        style
          ? {
              width: style.size,
              height: style.size,
              marginLeft: -style.size / 2,
              marginTop: -style.size / 2,
              backgroundImage: style.image,
              boxShadow: style.shadow,
            }
          : { width: 0, height: 0 }
      }
      initial={{ opacity: 0, scale: 0 }}
      animate={controls}
    />
  )
}

// 섬광(flash) + 충격파 링(영속 노드 1세트) — 버스트마다 1세트 재생.
function DecorSlot({
  index,
  register,
}: {
  index: number
  register: (i: number, h: DecorHandle) => void
}) {
  const flash = useAnimationControls()
  const ring = useAnimationControls()
  const [flashBg, setFlashBg] = useState<string | null>(null)
  const [ringColor, setRingColor] = useState<string | null>(null)
  const busyRef = useRef(false)
  const genRef = useRef(0)

  useEffect(() => {
    register(index, {
      isBusy: () => busyRef.current,
      play: (spec) => {
        const gen = ++genRef.current
        busyRef.current = true
        const delay = spec.delaySec ?? 0
        const release = () => {
          if (genRef.current === gen) busyRef.current = false
        }
        // 부드럽게 부푸는 코어 섬광 + 퍼지는 충격파 링(성공/파괴 공용).
        setFlashBg(
          `radial-gradient(circle, color-mix(in srgb, ${spec.coreVar} 75%, transparent), transparent 70%)`,
        )
        flash.set({ scale: 0.3, opacity: 0 })
        const flashDone = flash.start(
          { scale: 1.1, opacity: [0, 0.85, 0] },
          { delay, duration: BURST_FLASH_DUR, ease: 'easeOut' },
        )
        setRingColor(spec.edgeVar)
        ring.set({ scale: 0.1, opacity: 0.7 })
        const ringDone = ring.start(
          { scale: 1, opacity: 0 },
          { delay, duration: BURST_RING_DUR, ease: 'easeOut' },
        )
        Promise.all([flashDone, ringDone]).then(release)
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      {/* 섬광 — 터지는 순간 짧게 부푼다(버스트 코어 플래시). */}
      <motion.span
        className="absolute h-32 w-32 rounded-full"
        style={{
          marginLeft: '-4rem',
          marginTop: '-4rem',
          background: flashBg ?? 'transparent',
        }}
        initial={{ opacity: 0, scale: 0.3 }}
        animate={flash}
      />
      {/* 충격파 링 — 색 미지정이면 투명 테두리로 숨는다. */}
      <motion.span
        className="absolute h-40 w-40 rounded-full border-2"
        style={{
          marginLeft: '-5rem',
          marginTop: '-5rem',
          borderColor: ringColor ?? 'transparent',
        }}
        initial={{ opacity: 0, scale: 0.1 }}
        animate={ring}
      />
    </>
  )
}
