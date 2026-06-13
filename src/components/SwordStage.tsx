import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
  type Ref,
} from 'react'
import { motion, useAnimationControls } from 'motion/react'
import { useI18nStore, useT } from '../i18n'
import type { SwordData } from '../data/types'
import { formatAmount, formatGold } from '../lib/format'
import { drawSpriteContain, spriteStore } from '../lib/spriteStore'
import { SHAKE_KEYFRAMES, makeShakeTransition } from './shake'
import { ProtectionWard, type ProtectionWardProps } from './ProtectionWard'
import { SuccessRateSigil } from './SuccessRateSigil'
import { HammerStation } from './HammerStation'
import { Coin } from './Coin'

// 중앙 검 스테이지: 글로우 + 마법진(결계) + 스프라이트 + 레벨 뱃지 + 이름 배너 + 스탯 바.
// 파괴보호장치는 검을 감싸는 "보호 결계"로 표현한다 — 발동(armed) 시 마법진이 강화색으로 점등하고
// 실드 돔이 검을 덮으며, 결계 뱃지(ProtectionWard)가 필요/보유·상태를 검 하단에 드러낸다.
type SwordStageProps = {
  sword: SwordData | undefined
  level: number | null
  // 이름 배너·판매가·성공률에 "공개된(reveal)" 검을 쓴다 — 강화 결과는 망치가 검을 내려친 뒤
  // (스프라이트가 떨림 뒤에서 등장하는 박자)에 드러나야 하므로, 호출 측이 결과를 그 시점까지 지연
  // 반영한 검을 준다. 스프라이트(sword/level)는 결과 즉시 새 검으로 교체돼 떨림 동안 숨었다가
  // 등장하지만, 이름·스탯은 이 displaySword 로 떨림 동안 강화 전 값을 유지한다(연출 전 결과 누설 방지).
  // 미지정이면 sword/level 을 그대로 써 지연이 없다(보관·장착·판매 등 즉시 반영 경로).
  displaySword?: SwordData | undefined
  displayLevel?: number | null
  // 보호 결계(필요/보유·발동 상태 + 토글/상점/플레어). 순수 상태 계산은 protection.ts 가 맡는다.
  protection: ProtectionWardProps
  // 스프라이트 자리 위에 겹쳐 그릴 오버레이 슬롯(파괴 연출 등). SwordStage 는 내용·타이밍을
  // 모른 채 자리만 내어 준다 → 연출 컴포넌트를 주입해 뷰/연출 결합을 피한다.
  spriteOverlay?: ReactNode
  // 검 스프라이트 등장(fade-in) 시작 지연(초). 파괴 연출 중 새 검이 떨림 위로 비쳐 보이지
  // 않도록 호출 측이 연출 길이만큼 지연시킨다(기본 0 = 즉시 등장).
  entranceDelay?: number
  // 파괴보호장치로 살아남았을 때 "떨림만" 재생하는 트리거. 값이 바뀔 때마다 실제 검 스프라이트가
  // 한 번 덜덜 떤다(파괴 잔상과 같은 공유 SHAKE). 파괴 시에는 올리지 않는다(이중 떨림 방지).
  shakeKey?: number
  // 방지 떨림의 시작 지연(망치 임팩트까지 대기)·길이(이번 강화의 무작위 떨림 시간), 초 단위. 망치가
  // 닿는 순간부터 떨도록 GameScreen 이 타임라인에서 도출해 넘긴다(성공/파괴 잔상 떨림과 같은 박자).
  shakeImpactSec?: number
  shakeDurationSec?: number
  // 검 스프라이트 박스에 대한 ref — 판매 코인 연출이 "코인이 뿜어져 나올 출발점"을 측정하는 데 쓴다.
  swordBoxRef?: Ref<HTMLDivElement>
  // 판매가 강조(pop) 트리거. shakeKey 와 같은 idiom — 값이 바뀔 때마다 가격 표시가 한 번 통 튄다.
  // 강화 성공으로 가격이 오른 순간에만 호출 측이 올린다(보관·장착·판매로 가격이 바뀔 땐 올리지 않음).
  pricePopKey?: number
}

// 양피지 위에 얹는 가로 육각형 배너 클립.
const HEX =
  'polygon(0% 50%, 16px 0%, calc(100% - 16px) 0%, 100% 50%, calc(100% - 16px) 100%, 16px 100%)'

export function SwordStage({
  sword,
  level,
  displaySword = sword,
  displayLevel = level,
  protection,
  spriteOverlay,
  entranceDelay = 0,
  shakeKey = 0,
  shakeImpactSec = 0,
  shakeDurationSec = 0.4,
  swordBoxRef,
  pricePopKey = 0,
}: SwordStageProps) {
  const t = useT()
  const lang = useI18nStore((s) => s.lang)
  // hasSword 는 스프라이트(즉시 교체되는 live 검)용, hasDisplaySword 는 이름·스탯(지연 공개되는 검)용.
  const hasSword = sword !== undefined && level !== null
  const hasDisplaySword = displaySword !== undefined && displayLevel !== null
  // 결계 발동(armed) 여부 — 배경 마법진 점등·실드 돔을 켜는 단일 플래그(순수 상태에서 유도).
  const armed = protection.state.kind === 'armed'

  // 떨림은 remount 없이 명령형으로 제어한다 — key 를 바꿔 재마운트하면 등장 애니메이션이 다시
  // 재생돼 검이 "재생성"되는 인상을 준다. shakeKey 가 바뀔 때마다 한 번 떤다(초기 0 은 무시).
  const shakeControls = useAnimationControls()
  useEffect(() => {
    if (shakeKey > 0) {
      // 망치가 닿는 순간(shakeImpactSec)부터 무작위 길이(shakeDurationSec)만큼 떤다 — 성공/파괴 잔상의
      // 떨림과 동일한 박자(makeShakeTransition). 윈드업 동안은 delay 로 가만히 있는다.
      shakeControls.start({
        ...SHAKE_KEYFRAMES,
        transition: makeShakeTransition(shakeDurationSec, shakeImpactSec),
      })
    }
    // shakeImpactSec/shakeDurationSec 은 트리거(shakeKey)가 바뀔 때의 최신값을 쓰면 충분하다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shakeKey, shakeControls])

  // 판매가 강조(pop) — 강화 성공으로 가격이 오를 때 pricePopKey 가 바뀌며 한 번 "커졌다 원래대로" 튄다
  // (shakeControls 와 동일 idiom — RecordGauge 의 통 튀는 연출 미러). 첫 마운트(0)엔 조용.
  const priceControls = useAnimationControls()
  useEffect(() => {
    if (pricePopKey > 0) {
      priceControls.start({
        scale: [1, 1.35, 1], // 원래 크기 → 커졌다가 → 원래 크기
        transition: { duration: 0.4, ease: 'easeOut', times: [0, 0.45, 1] },
      })
    }
  }, [pricePopKey, priceControls])

  // ── 검 스프라이트 표시(canvas) ───────────────────────────────────────────────────
  // <img> 대신 <canvas>로 SpriteStore 의 GPU 상주 ImageBitmap 을 그린다 — 강화 교체 프레임이 디코드·
  // 업로드 없이 블릿만 하게 해 모바일 끊김을 없앤다. 캔버스는 영속(remount 없음) — key 재마운트는 매 교체마다
  // 새 합성 레이어를 만들어(레이어 churn) 그 자체로 끊김을 유발하므로, 등장 애니메이션은 명령형으로 다시 튼다.
  const spriteCanvasRef = useRef<HTMLCanvasElement>(null)
  const entranceControls = useAnimationControls()
  const spriteName = hasSword ? sword.sprite : null

  // 캔버스에 sprite 를 그린다 — 블릿(DPR backing·object-contain·픽셀아트·default.png 폴백)은 공유 헬퍼
  // drawSpriteContain 이 소유한다(잔상 ShakeBurstEffect 와 동일 구현). useCallback(stable)로 sprite 를 인자로
  // 받아 ResizeObserver 재구독을 막는다.
  const drawSprite = useCallback((sprite: string) => {
    const canvas = spriteCanvasRef.current
    if (canvas) drawSpriteContain(canvas, sprite)
  }, [])

  // 스프라이트가 바뀌면(강화·장착 등) 보이기 전에(opacity 0) 캔버스를 새로 그리고 등장 애니메이션을 다시 튼다
  // — useLayoutEffect(paint 전)라 새 검이 한 프레임 깜빡 비치지 않는다. remount 가 아니라 같은 캔버스를 재사용.
  // entranceDelay 단독 변화엔 재생하지 않도록 직전 스프라이트(prevSprite)로 가드한다(ref 쓰기는 effect 안 — 규약).
  const prevSpriteRef = useRef<string | null>(null)
  useLayoutEffect(() => {
    if (spriteName === null) {
      prevSpriteRef.current = null
      return
    }
    if (prevSpriteRef.current === spriteName) return
    prevSpriteRef.current = spriteName
    entranceControls.set({ opacity: 0, scale: 0.8 })
    drawSprite(spriteName)
    entranceControls.start({
      opacity: 1,
      scale: 1,
      transition: { duration: 0.35, ease: 'easeOut', delay: entranceDelay },
    })
    // 첫 무기 안 보임 방지 — 스프라이트가 아직 풀에 없으면(첫 페인트가 시작검 적재를 앞질렀거나, 다음 검이
    // 백그라운드 적재 중) 위 drawSprite 는 default.png 폴백을 그린다. 적재되는 즉시 한 번 더 그려 빈/폴백
    // 검이 남지 않게 한다(그 사이 검이 또 바뀌지 않았을 때만). load 는 적재 완료/캐시 히트에 resolve 하고
    // 동시 호출을 합친다(중복 디코드 없음).
    if (!spriteStore.has(spriteName)) {
      let cancelled = false
      void spriteStore.load(spriteName).then(() => {
        if (!cancelled && prevSpriteRef.current === spriteName) drawSprite(spriteName)
      })
      return () => {
        cancelled = true
      }
    }
  }, [spriteName, entranceDelay, entranceControls, drawSprite])

  // rem 반응 스케일(뷰포트 변화)로 표시 크기가 바뀌면 backing store 를 맞춰 다시 그린다(현재 스프라이트 유지).
  // 현재 스프라이트는 ref(effect 에서 갱신 — 규약)로 읽는다(ResizeObserver 콜백은 렌더 밖에서 돈다).
  const spriteNameRef = useRef(spriteName)
  useEffect(() => {
    spriteNameRef.current = spriteName
  })
  useEffect(() => {
    const canvas = spriteCanvasRef.current
    if (!canvas || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      const s = spriteNameRef.current
      if (s !== null) drawSprite(s)
    })
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [drawSprite])

  // 판매가(검의 sellPrice) 표시 여부 — 검 없음/판매 불가(null·0)면 자리만 지키고 숨긴다.
  // 이름·스탯과 함께 지연 공개되는 displaySword 기준(강화 직후 새 가격이 먼저 새지 않게).
  const hasPrice =
    !!displaySword &&
    displaySword.sellPrice !== null &&
    displaySword.sellPrice > 0

  return (
    <div className="flex flex-col items-center gap-5">
      {/* 검 + 글로우 + 마법진 */}
      <div
        ref={swordBoxRef}
        className="relative flex h-52 w-52 items-center justify-center sm:h-60 sm:w-60"
      >
        {/* 따뜻한 골드 글로우 */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(circle, color-mix(in srgb, var(--color-gold) 60%, transparent) 0%, transparent 62%)',
          }}
        />
        {/* 보호 결계 돔(발동 시) — 좌상단 결계 서클에서 흘러나온 마력이 검을 은은한 흰빛으로 감싼다.
            천천히 숨 쉬듯 맥동(은은함)해, 무기만 보고 있어도 "보호 중"임이 읽힌다(검 뒤로 깔림).
            상시 맥동이라 CSS(.fx-ward-breathe — index.css)가 소유한다(메인 스레드 0). */}
        {armed && (
          <div
            aria-hidden
            className="fx-ward-breathe pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(circle, color-mix(in srgb, white 45%, transparent) 0%, transparent 58%)',
            }}
          />
        )}
        {/* 마법진 — 발동 시 결계로 승격돼 흰빛 테두리로 점등한다. 회전 애니메이션은 제거됐다(정적) —
            이전엔 CSS(.fx-spin, 48s)가 상시 회전을 소유했다. */}
        <div
          className={`pointer-events-none absolute inset-3 rounded-full border ${
            armed ? 'border-white/80' : 'border-frame/25'
          }`}
        >
          <div
            className={`absolute inset-2 rounded-full border border-dashed ${
              armed ? 'border-white/55' : 'border-frame/20'
            }`}
          />
        </div>

        {/* 떨림 레이어(방지 시 실제 검을 흔든다) — remount 하지 않고 shakeControls 로 제어한다.
            spriteOverlay(파괴 잔상·파티클)는 이 레이어 밖 형제라 함께 흔들리지 않는다. */}
        <motion.div
          animate={shakeControls}
          className="relative flex items-center justify-center"
        >
          {/* 스프라이트 등장(스프라이트 변할 때마다 재생) — 영속 캔버스에 명령형(entranceControls)으로 다시 튼다.
              key 재마운트를 쓰지 않는 이유: 매 교체마다 새 합성 레이어를 만들어(레이어 churn) 모바일에서 끊김을
              유발한다. 파괴 연출 중에는 entranceDelay(burstAt)로 등장을 미뤄 잔상 뒤로 새 검이 비치지 않게 한다. */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={entranceControls}
            className="flex items-center justify-center"
          >
            {hasSword ? (
              // SpriteStore 의 GPU 상주 ImageBitmap 을 그리는 캔버스(영속) — 교체는 디코드·업로드 없는 블릿.
              // 크기/픽셀아트 보간은 기존 <img> 와 동일(h-36/40, pixelated). 그리기·backing store 크기는
              // drawSprite 가 소유한다(아래 useLayoutEffect·ResizeObserver).
              <canvas
                ref={spriteCanvasRef}
                role="img"
                aria-label={t(sword.nameKey)}
                className="h-36 w-36 object-contain sm:h-40 sm:w-40"
                style={{ imageRendering: 'pixelated' }}
              />
            ) : (
              <span className="text-5xl font-bold text-ink-soft/60" aria-hidden>
                ?
              </span>
            )}
          </motion.div>
        </motion.div>

        {/* 스프라이트 위 오버레이 슬롯(파괴 연출 등) — 자리만 제공, 내용은 주입받는다. */}
        {spriteOverlay}

        {/* 보호 결계 전경(하단 뱃지 + 발동 플레어) — 검 위에 그려 필요/보유·상태를 또렷이 드러낸다. */}
        <ProtectionWard {...protection} />

        {/* 강화 성공률 결계 — 검 우하단(보호 결계와 대각선). 성공률 %를 신호등 색 마법진으로 점등. */}
        <SuccessRateSigil
          successRate={displaySword?.successRate ?? null}
          hasSword={hasDisplaySword}
        />

        {/* 망치 거치대 — 검 우상단. 강화 도구(호라드릭 망치)를 상시 보여 주는 의식 코너 3종의 마지막 자리
            (좌상단 보호 결계 · 우하단 성공률 결계와 한 세트). 향후 망치 업그레이드 기능의 시각 앵커. */}
        <HammerStation />
      </div>

      {/* 판매가(외곽 없는 텍스트) — 검 바로 아래·이름 배너 위 흐름에 두어 모든 폭에서 가운데에 놓는다.
          -mt-2 로 컬럼 간격(gap-5)을 이 한 자식만 0.5rem 좁혀 위로 올린다 — 간격 토큰에서 자동 도출되지
          않는 수동 오프셋이라, gap-5 를 바꾸면 이 보정값도 함께 재조정해야 한다. */}
      <div className="-mt-2 flex flex-col items-center gap-0.5">
        {/* 판매가(코인 + 금색 숫자) — 강화 성공으로 오를 때 한 번 통 튄다(priceControls). 라벨 없이
            코인이 통화를 대신하고, 통화 맥락은 aria-label(formatGold)로 보존한다(SellButton 미러).
            판매 불가(검 없음/판매가 null·0)면 invisible 로 자리만 지켜 스테이지 높이를 고정한다. */}
        <motion.div
          animate={priceControls}
          aria-label={
            hasPrice
              ? `${t('cost.sell')}: ${formatGold(displaySword.sellPrice as number, lang)}`
              : undefined
          }
          aria-hidden={hasPrice ? undefined : true}
          className={`flex min-h-[1.75rem] items-center justify-center gap-1.5 text-xl font-bold tabular-nums text-gold ${
            hasPrice ? '' : 'invisible'
          }`}
          style={{ textShadow: '0 1px 2px rgba(0,0,0,0.35)' }}
        >
          <Coin className="h-6 w-6" />
          {/* 판매가 영역의 자리(폭·높이)를 고정해 0강(가격 없음)과 가격 표시, 자릿수 변화에도 UI가
              들썩이지 않게 한다. 코인+숫자가 가운데 정렬이라 숫자 폭이 바뀌면 행이 다시 중앙으로 맞춰지며
              코인이 좌우로 움직인다. 그래서 숫자에 고정 폭(min-w)+text-center, 행에 min-h 를 줘 가격 유무·
              자릿수와 무관하게 자리를 고정한다(SellButton 의 min-w 슬롯 관례). 없으면 invisible 로 숨긴다. */}
          <span className="min-w-[5rem] whitespace-nowrap text-center">
            {hasPrice ? formatAmount(displaySword.sellPrice as number) : ' '}
          </span>
        </motion.div>
      </div>

      {/* 이름 배너 */}
      <div className="bg-frame/70 p-[1.5px]" style={{ clipPath: HEX }}>
        <div
          className="flex w-80 items-center justify-center bg-panel px-10 py-3"
          style={{ clipPath: HEX }}
        >
          <span className="whitespace-nowrap text-center text-2xl font-extrabold tracking-tight text-on-dark">
            {hasDisplaySword ? t(displaySword.nameKey) : t('sword.none')}
          </span>
          {hasDisplaySword && (
            <span className="ml-2 text-xl font-bold tabular-nums text-gold">
              +{displayLevel}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
