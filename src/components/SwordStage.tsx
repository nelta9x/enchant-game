import { useEffect, type ReactNode, type Ref } from 'react'
import { motion, useAnimationControls } from 'motion/react'
import { useT } from '../i18n'
import type { SwordData } from '../data/types'
import { formatRate } from '../lib/format'
import { swordSpriteUrl } from '../lib/sprites'
import { SHAKE_KEYFRAMES, SHAKE_TRANSITION } from './shake'
import { ProtectionWard, type ProtectionWardProps } from './ProtectionWard'

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
}: SwordStageProps) {
  const t = useT()
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

  // 성공률 스탯 — 외곽(테두리·배경) 없이 텍스트만 둔다. 같은 내용을 두 위치에 쓴다(반응형):
  // 좁은 화면·모바일은 이름 아래 흐름에, lg+ 에선 검 오른쪽 빈 공간으로. 동시에 보이지 않으므로
  // (한쪽은 invisible/hidden) 접근성 트리에도 한 번만 노출된다.
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

        {/* lg+ 전용: 성공률(외곽 없는 텍스트)을 검 오른쪽 하단의 빈 공간으로 옮긴다. 검 박스를 기준으로
            배치해 검과 함께 움직이고, 좁은 폭(~lg 미만)에선 갭이 없어 강화 버튼과 겹치므로 숨긴다
            (그 구간은 아래 흐름상 스탯을 쓴다). */}
        <div className="absolute bottom-0 left-full hidden lg:block">
          {successStat}
        </div>
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

      {/* 성공률(외곽 없는 텍스트). lg+ 에선 검 오른쪽으로 옮기되, 여기서는 invisible 로 공간만
          유지해 컬럼 높이가 그대로라 세로 중앙정렬된 검 위치가 흔들리지 않는다(흐름에서 빼면 검이 재중앙됨). */}
      <div className="lg:invisible">{successStat}</div>
    </div>
  )
}

// 성공률 텍스트(외곽 없음) — 라벨 + 값만. 값 색은 신호등 분기를 valueClassName 으로 주입받는다.
// py 패딩은 흐름상(invisible) 인스턴스의 높이를 유지해 lg 에서 검 위치가 흔들리지 않게 하는
// 용도로 남긴다(외곽만 사라지고 차지하는 공간은 동일).
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
      <span className="whitespace-nowrap text-[11px] font-medium text-ink-soft">
        {label}
      </span>
      <span className={`text-base font-bold tabular-nums ${valueClassName}`}>
        {value}
      </span>
    </div>
  )
}
