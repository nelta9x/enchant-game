import { useEffect, type ReactNode } from 'react'
import { motion, useAnimationControls } from 'motion/react'
import { useT } from '../i18n'
import type { SwordData } from '../data/types'
import { swordSpriteUrl } from '../lib/sprites'
import { SHAKE_KEYFRAMES, SHAKE_TRANSITION } from './shake'

// 중앙 검 스테이지: 글로우 + 마법진 + 스프라이트 + 레벨 뱃지 + 이름 배너 + 스탯 바.
// 방지권 스탯은 보유·단계 조건이 맞을 때(canArm) 사용(armed) 토글 버튼으로 동작한다.
type SwordStageProps = {
  sword: SwordData | undefined
  level: number | null
  ownedTickets: number
  armed: boolean
  canArm: boolean
  onToggleProtection: () => void
  // 스프라이트 자리 위에 겹쳐 그릴 오버레이 슬롯(파괴 연출 등). SwordStage 는 내용·타이밍을
  // 모른 채 자리만 내어 준다 → 연출 컴포넌트를 주입해 뷰/연출 결합을 피한다.
  spriteOverlay?: ReactNode
  // 검 스프라이트 등장(fade-in) 시작 지연(초). 파괴 연출 중 새 검이 떨림 위로 비쳐 보이지
  // 않도록 호출 측이 연출 길이만큼 지연시킨다(기본 0 = 즉시 등장).
  entranceDelay?: number
  // 방지권으로 살아남았을 때 "떨림만" 재생하는 트리거. 값이 바뀔 때마다 실제 검 스프라이트가
  // 한 번 덜덜 떤다(파괴 잔상과 같은 공유 SHAKE). 파괴 시에는 올리지 않는다(이중 떨림 방지).
  shakeKey?: number
}

// 양피지 위에 얹는 가로 육각형 배너 클립.
const HEX =
  'polygon(0% 50%, 16px 0%, calc(100% - 16px) 0%, 100% 50%, calc(100% - 16px) 100%, 16px 100%)'

export function SwordStage({
  sword,
  level,
  ownedTickets,
  armed,
  canArm,
  onToggleProtection,
  spriteOverlay,
  entranceDelay = 0,
  shakeKey = 0,
}: SwordStageProps) {
  const t = useT()
  const hasSword = sword !== undefined && level !== null

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
      ? `${Math.round(sword.successRate * 100)}%`
      : t('sword.maxLevel')

  return (
    <div className="flex flex-col items-center gap-5">
      {/* 검 + 글로우 + 마법진 */}
      <div className="relative flex h-52 w-52 items-center justify-center sm:h-60 sm:w-60">
        {/* 따뜻한 골드 글로우 */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(circle, color-mix(in srgb, var(--color-gold) 60%, transparent) 0%, transparent 62%)',
          }}
        />
        {/* 천천히 도는 마법진 */}
        <motion.div
          className="pointer-events-none absolute inset-3 rounded-full border border-frame/25"
          animate={{ rotate: 360 }}
          transition={{ duration: 48, repeat: Infinity, ease: 'linear' }}
        >
          <div className="absolute inset-2 rounded-full border border-dashed border-frame/20" />
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
      </div>

      {/* 레벨 뱃지(다이아몬드) */}
      {hasSword && (
        <div className="relative flex h-9 w-14 items-center justify-center">
          <span className="absolute inset-x-3 inset-y-0 rotate-45 rounded-[5px] border border-frame/60 bg-panel" />
          <span className="relative text-sm font-bold tabular-nums text-on-dark">
            +{level}
          </span>
        </div>
      )}

      {/* 이름 배너 */}
      <div className="bg-frame/70 p-[1.5px]" style={{ clipPath: HEX }}>
        <div
          className="flex min-w-56 items-center justify-center bg-panel px-10 py-2.5"
          style={{ clipPath: HEX }}
        >
          <span className="text-center text-2xl font-extrabold tracking-tight text-on-dark">
            {hasSword ? t(sword.nameKey) : t('sword.none')}
          </span>
        </div>
      </div>

      {/* 스탯 바: 방지권(토글) | 성공률 */}
      <div className="flex items-stretch overflow-hidden rounded-lg border border-parchment-line bg-parchment/85">
        <ProtectionStat
          count={ownedTickets}
          armed={armed}
          canArm={canArm}
          onToggle={onToggleProtection}
          label={t('stat.protection')}
          armedLabel={t('protection.on')}
          toggleLabel={t('protection.toggle')}
        />
        <div className="w-px self-stretch bg-parchment-line" />
        <Stat
          icon={<TargetIcon />}
          label={t('stat.successRate')}
          value={hasSword ? successText : '—'}
        />
      </div>
    </div>
  )
}

function ProtectionStat({
  count,
  armed,
  canArm,
  onToggle,
  label,
  armedLabel,
  toggleLabel,
}: {
  count: number
  armed: boolean
  canArm: boolean
  onToggle: () => void
  label: string
  armedLabel: string
  toggleLabel: string
}) {
  const body = (
    <>
      <ShieldIcon active={armed} />
      <div className="flex flex-col items-start leading-tight">
        <span className="text-[11px] font-medium text-ink-soft">{label}</span>
        <span className="text-base font-bold tabular-nums text-ink">
          {count}
        </span>
      </div>
      {armed && (
        <span className="ml-1 rounded bg-enhance/15 px-1.5 py-0.5 text-[10px] font-semibold text-enhance">
          {armedLabel}
        </span>
      )}
    </>
  )

  if (!canArm) {
    return <div className="flex items-center gap-2 px-4 py-2.5">{body}</div>
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={armed}
      aria-label={toggleLabel}
      className={`flex items-center gap-2 px-4 py-2.5 transition-colors ${
        armed ? 'bg-enhance/10' : 'hover:bg-parchment-line/40'
      }`}
    >
      {body}
    </button>
  )
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-2 px-4 py-2.5">
      {icon}
      <div className="flex flex-col items-start leading-tight">
        <span className="text-[11px] font-medium text-ink-soft">{label}</span>
        <span className="text-base font-bold tabular-nums text-ink">
          {value}
        </span>
      </div>
    </div>
  )
}

function ShieldIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-6 w-6 ${active ? 'text-enhance' : 'text-ink-soft'}`}
      fill="currentColor"
      aria-hidden
    >
      <path d="M12 2 4 5v6c0 5 3.4 8.5 8 11 4.6-2.5 8-6 8-11V5l-8-3Z" />
    </svg>
  )
}

function TargetIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6 text-ink-soft"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="0.6" fill="currentColor" />
    </svg>
  )
}
