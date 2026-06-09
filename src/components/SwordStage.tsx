import { useEffect, type ReactNode, type Ref } from 'react'
import { motion, useAnimationControls } from 'motion/react'
import { useI18nStore, useT } from '../i18n'
import type { SwordData } from '../data/types'
import { formatAmount, formatGold, formatRate } from '../lib/format'
import { swordSpriteUrl } from '../lib/sprites'
import { SHAKE_KEYFRAMES, SHAKE_TRANSITION } from './shake'
import { ProtectionWard, type ProtectionWardProps } from './ProtectionWard'
import { Coin } from './Coin'

// 중앙 검 스테이지: 글로우 + 마법진(결계) + 스프라이트 + 레벨 뱃지 + 이름 배너 + 스탯 바.
// 파괴보호장치는 검을 감싸는 "보호 결계"로 표현한다 — 발동(armed) 시 마법진이 강화색으로 점등하고
// 실드 돔이 검을 덮으며, 결계 뱃지(ProtectionWard)가 필요/보유·상태를 검 하단에 드러낸다.
type SwordStageProps = {
  sword: SwordData | undefined
  level: number | null
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
  protection,
  spriteOverlay,
  entranceDelay = 0,
  shakeKey = 0,
  swordBoxRef,
  pricePopKey = 0,
}: SwordStageProps) {
  const t = useT()
  const lang = useI18nStore((s) => s.lang)
  const hasSword = sword !== undefined && level !== null
  // 결계 발동(armed) 여부 — 배경 마법진 점등·실드 돔을 켜는 단일 플래그(순수 상태에서 유도).
  const armed = protection.state.kind === 'armed'

  // 떨림은 remount 없이 명령형으로 제어한다 — key 를 바꿔 재마운트하면 등장 애니메이션이 다시
  // 재생돼 검이 "재생성"되는 인상을 준다. shakeKey 가 바뀔 때마다 한 번 떤다(초기 0 은 무시).
  const shakeControls = useAnimationControls()
  useEffect(() => {
    if (shakeKey > 0) {
      shakeControls.start({ ...SHAKE_KEYFRAMES, transition: SHAKE_TRANSITION })
    }
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

  const successText =
    sword && sword.successRate !== null
      ? formatRate(sword.successRate)
      : t('sword.maxLevel')

  // 강화 성공률 값 색 — 신호등(80%+ 초록 / 55~80% 노랑 / 그 미만 빨강). 표시되는 %(반올림)와
  // 일치하도록 raw rate 가 아닌 반올림 퍼센트로 분기한다. 최종 단계(null)·검 없음은 기본색.
  const rateColorClass = (() => {
    if (!sword || sword.successRate === null) return 'text-ink'
    const pct = Math.round(sword.successRate * 100)
    if (pct >= 80) return 'text-rate-high'
    if (pct >= 55) return 'text-rate-mid'
    return 'text-rate-low'
  })()

  // 판매가(검의 sellPrice) 표시 여부 — 검 없음/판매 불가(null·0)면 자리만 지키고 숨긴다.
  const hasPrice =
    !!sword && sword.sellPrice !== null && sword.sellPrice > 0

  // 성공률 스탯 — 외곽(테두리·배경) 없이 텍스트만 둔다. 모든 폭에서 이름 배너 아래 흐름에 한 번만
  // 두어 검 아래 가운데(부모가 flex flex-col items-center)에 놓는다 — 라벨·값은 Stat 의 items-center 로
  // 묶음 중앙정렬된다. (이전엔 lg+ 에서 검 오른쪽으로 옮겼으나, 가운데 정렬로 통일했다.)
  const successStat = (
    <Stat
      label={t('stat.successRate')}
      value={hasSword ? successText : '—'}
      valueClassName={rateColorClass}
    />
  )

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
            천천히 숨 쉬듯 맥동(은은함)해, 무기만 보고 있어도 "보호 중"임이 읽힌다(검 뒤로 깔림). */}
        {armed && (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(circle, color-mix(in srgb, white 45%, transparent) 0%, transparent 58%)',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.5, 0.85, 0.5] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
        {/* 천천히 도는 마법진 — 발동 시 결계로 승격돼 흰빛으로 점등하고 더 또렷이 빛난다. */}
        <motion.div
          className={`pointer-events-none absolute inset-3 rounded-full border ${
            armed ? 'border-white/80' : 'border-frame/25'
          }`}
          style={
            armed
              ? {
                  boxShadow:
                    '0 0 18px color-mix(in srgb, white 60%, transparent)',
                }
              : undefined
          }
          animate={{ rotate: 360 }}
          transition={{ duration: 48, repeat: Infinity, ease: 'linear' }}
        >
          <div
            className={`absolute inset-2 rounded-full border border-dashed ${
              armed ? 'border-white/55' : 'border-frame/20'
            }`}
          />
        </motion.div>

        {/* 떨림 레이어(방지 시 실제 검을 흔든다) — remount 하지 않고 shakeControls 로 제어한다.
            spriteOverlay(파괴 잔상·파티클)는 이 레이어 밖 형제라 함께 흔들리지 않는다. */}
        <motion.div
          animate={shakeControls}
          className="relative flex items-center justify-center"
        >
          {/* 스프라이트 등장(레벨 변할 때마다 재생). 파괴 연출 중에는 entranceDelay 로 등장을
              미뤄, 떨리는 잔상 뒤로 새 검이 비쳐 보이지 않게 한다(폭발 후 드러남). */}
          <motion.div
            key={level ?? 'empty'}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              duration: 0.35,
              ease: 'easeOut',
              delay: entranceDelay,
            }}
            className="flex items-center justify-center"
          >
            {hasSword ? (
              <img
                src={swordSpriteUrl(sword.sprite)}
                alt={t(sword.nameKey)}
                className="h-36 w-36 object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.25)] sm:h-40 sm:w-40"
                style={{ imageRendering: 'pixelated' }}
                draggable={false}
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
      </div>

      {/* 성공률 + 판매가(외곽 없는 텍스트) — 검 바로 아래·이름 배너 위 흐름에 한 묶음으로 두어 모든 폭에서
          가운데에 놓는다. -mt-2 로 컬럼 간격(gap-5)을 이 한 자식만 0.5rem 좁혀 위로 올린다 — 간격 토큰에서
          자동 도출되지 않는 수동 오프셋이라, gap-5 를 바꾸면 이 보정값도 함께 재조정해야 한다. */}
      <div className="-mt-2 flex flex-col items-center gap-0.5">
        {successStat}
        {/* 판매가(코인 + 금색 숫자) — 강화 성공으로 오를 때 한 번 통 튄다(priceControls). 라벨 없이
            코인이 통화를 대신하고, 통화 맥락은 aria-label(formatGold)로 보존한다(SellButton 미러).
            판매 불가(검 없음/판매가 null·0)면 invisible 로 자리만 지켜 스테이지 높이를 고정한다. */}
        <motion.div
          animate={priceControls}
          aria-label={
            hasPrice
              ? `${t('cost.sell')}: ${formatGold(sword.sellPrice as number, lang)}`
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
            {hasPrice ? formatAmount(sword.sellPrice as number) : ' '}
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
            {hasSword ? t(sword.nameKey) : t('sword.none')}
          </span>
          {hasSword && (
            <span className="ml-2 text-xl font-bold tabular-nums text-gold">
              +{level}
            </span>
          )}
        </div>
      </div>

    </div>
  )
}

// 성공률 텍스트(외곽 없음) — 라벨 + 값만. 값 색은 신호등 분기를 valueClassName 으로 주입받는다.
// items-center 로 라벨·값을 묶음 중앙정렬한다(검 아래 가운데). px/py 패딩은 검과의 간격용.
function Stat({
  label,
  value,
  valueClassName = 'text-ink',
}: {
  label: string
  value: string
  valueClassName?: string
}) {
  return (
    <div className="flex flex-col items-center px-4 py-2.5 leading-tight">
      <span className="whitespace-nowrap text-[0.6875rem] font-medium text-ink-soft">
        {label}
      </span>
      <span className={`text-base font-bold tabular-nums ${valueClassName}`}>
        {value}
      </span>
    </div>
  )
}
