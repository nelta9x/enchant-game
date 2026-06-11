import {
  animate,
  motion,
  useMotionTemplate,
  useMotionValue,
  useTransform,
} from 'motion/react'
import { useEffect } from 'react'
import type { Material } from '../data/types'
import { useHoldRepeat } from '../hooks/useHoldRepeat'
import { useI18nStore, useT } from '../i18n'
import { formatAmount, formatGold } from '../lib/format'
import { itemDisplayName } from '../lib/items'
import { Coin } from './Coin'
import { ItemIcon } from './ItemIcon'

// 강화 버튼 — 둥근 카드형(황금빛 글로우). 카드 안에 "강화" 라벨 + 강화 조건(비용/재료)을 아이콘+수량으로 보여 준다.
//  - 골드 비용: 금화 아이콘 + 금액 / 아이템(재료검·잡템) 비용: 아이템 아이콘 + ×수량 / 무료·최종 단계: 칩 없이 라벨만.
//  - 비용 칩은 시각적으로 아이콘+수량만 보여 주되, aria-label 로 스크린리더에 비용을 설명한다(접근성 보존).
// 상태별 표현:
//  - 가능(ready = 강화 가능 && 쿨다운 아님): 금색 글로우 + 펄스 링. 클릭 가능.
//  - 쿨다운(charging): 게임 스킬 아이콘처럼 검은 원형 오버레이가 버튼을 덮고 시계방향으로 걷히며 "충전 중"을
//    보여 준다. 더 이상 흐리게(disabled) 만들지 않는다 — 풀 밝기 유지, 클릭은 무시(GameScreen 의 잠금 가드).
//  - 진짜 비활성(검 없음/비용 부족/최종): 흐리게(opacity-40) — 아예 누를 수 없음을 명확히.
// aria-keyshortcuts="Space"로 데스크탑 단축키를 알린다(ARIA 키 토큰이라 로케일 무관 — i18n 대상 아님.
// 실제 처리는 useEnhanceHotkey).
//  - charging: 강화 쿨다운(입력 잠금) 중인지. 쿨다운 오버레이 표시·걷힘 타이밍에 쓴다.
//  - chargeMs: 쿨다운 길이(= 직전 강화의 타임라인 lockMs = 떨림 끝 + 재강화 가드). 오버레이가 한 바퀴 걷히는 시간 기준.
type EnhanceButtonProps = {
  disabled: boolean
  charging: boolean
  chargeMs: number
  onEnhance: () => void
  enchantCost: Material | null
}

export function EnhanceButton({
  disabled,
  charging,
  chargeMs,
  onEnhance,
  enchantCost,
}: EnhanceButtonProps) {
  const t = useT()
  const lang = useI18nStore((s) => s.lang)

  // 강화 가능 상태 = 강화 가능(검·비용 OK) && 쿨다운 아님. 평소 활성 연출(금색 글로우·펄스)의 기준.
  const ready = !disabled && !charging

  // 마우스로 꾹 누르면 강화 → 쿨다운 → 강화 … 가 이어지도록 press-and-hold 연사(스페이스 단축키와 같은 박자).
  // 발사 게이트 disabled = !ready(불가·쿨다운). 터치/펜은 탭=1회, 키보드 Enter 는 합성 click 으로 1회
  // (스페이스는 전역 단축키 useEnhanceHotkey 가 전담). onEnhance 의 잠금 가드가 쿨다운 중 발사를 무효화한다.
  const hold = useHoldRepeat<HTMLButtonElement>({
    disabled: !ready,
    onFire: onEnhance,
  })

  // 쿨다운 오버레이(게임 스킬 아이콘의 "쿨타임 스윕") — 검은 원뿔(conic) 마스크가 버튼을 덮고, 시계방향으로
  // 투명 영역이 자라며 걷힌다. sweep: 0 = 가득 덮임(쿨다운 시작), 1 = 완전히 드러남(쿨다운 끝).
  // 자바스크립트(Motion)가 매 프레임 sweep 을 갱신 → conic-gradient 의 각도가 매끄럽게 회전한다.
  const sweep = useMotionValue(0)
  const sweepAngle = useTransform(sweep, (v) => `${v * 360}deg`)
  // 12시 방향(0deg)에서 시작해 시계방향으로: 0~각도 = 투명(드러남), 각도~360 = 검정(덮임). 같은 각도에
  // 하드 스톱을 둬 경계가 또렷한 파이 조각이 된다. rgba 검정 0.55 = 게임 쿨타임 특유의 반투명 어둠.
  const cooldownMask = useMotionTemplate`conic-gradient(from 0deg, transparent ${sweepAngle}, rgba(0,0,0,0.55) ${sweepAngle})`
  const overlayOpacity = useMotionValue(0)
  useEffect(() => {
    if (charging) {
      // 쿨다운 시작: 즉시 가득 덮고(게임처럼 바로 어두워짐) 한 바퀴 걷히도록 일정 속도로 회전.
      sweep.set(0)
      overlayOpacity.set(1)
      const controls = animate(sweep, 1, {
        duration: Math.max(chargeMs, 0) / 1000,
        ease: 'linear',
      })
      return () => controls.stop()
    }
    // 쿨다운 종료: 남은 오버레이를 빠르게 거둬 평소 상태로 넘긴다.
    const controls = animate(overlayOpacity, 0, {
      duration: 0.15,
      ease: 'easeOut',
    })
    return () => controls.stop()
  }, [charging, chargeMs, sweep, overlayOpacity])

  // 강화 조건 칩 — 골드/아이템만 표시(무료·최종 단계는 null). 아이콘+수량만 시각화하고 aria-label 로 설명.
  const renderCost = () => {
    if (enchantCost === null || enchantCost.kind === 'free') return null
    const { icon, qty, label } =
      enchantCost.kind === 'gold'
        ? {
            icon: <Coin className="h-5 w-5" />,
            // 금화 아이콘이 통화를 대신하므로 단위 없이 금액만 표시. aria-label 엔 단위 포함(formatGold).
            qty: formatAmount(enchantCost.amount),
            label: formatGold(enchantCost.amount, lang),
          }
        : {
            icon: <ItemIcon itemId={enchantCost.itemId} className="h-5 w-5" />,
            qty: `×${enchantCost.count}`,
            label: `${itemDisplayName(enchantCost.itemId, t)} ×${enchantCost.count}`,
          }
    return (
      <>
        <span className="relative h-px w-14 bg-on-dark-soft/30" aria-hidden />
        <span
          className="relative flex items-center justify-center gap-1.5 text-sm font-bold tabular-nums text-on-dark"
          aria-label={`${t('cost.enhance')}: ${label}`}
        >
          {icon}
          {/* 금액/수량 슬롯 고정(min-w) — 비용이 바뀌어도 칩 폭이 변하지 않게 자리를 미리 잡는다. */}
          <span className="min-w-[4.5rem] whitespace-nowrap text-center">
            {qty}
          </span>
        </span>
      </>
    )
  }

  return (
    <motion.button
      type="button"
      onPointerDown={hold.onPointerDown}
      onClick={hold.onClick}
      disabled={disabled}
      aria-keyshortcuts="Space"
      aria-disabled={charging || undefined}
      whileTap={{ scale: 0.95 }}
      className={`relative flex w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border bg-gradient-to-b from-panel-soft to-panel px-3 py-5 transition-opacity ${
        ready
          ? 'cursor-pointer border-gold/60 shadow-[0_0_28px_-4px_var(--color-gold)]' // 가능 — 금색 글로우 + 펄스
          : charging
            ? 'cursor-wait border-gold/40' // 쿨다운 — 검은 스윕 오버레이가 덮음(흐리지 않게 풀 밝기)
            : 'cursor-not-allowed border-panel-edge opacity-40 saturate-50' // 진짜 비활성 — 흐림
      }`}
    >
      {/* 활성 시 천천히 번지는 펄스 링(카드 외곽) — 쿨다운·불가에는 끈다. */}
      {ready && (
        <motion.span
          className="pointer-events-none absolute inset-0 rounded-2xl border border-gold-glow"
          animate={{ scale: [1, 1.04], opacity: [0.5, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
        />
      )}
      {/* "강화" 라벨은 강화 수치(검 +레벨 등)에 쓰는 UI 금색(text-gold)으로 통일해 일관된 느낌을 준다.
          진짜 비활성일 때만 흐린 색으로 둔다(쿨다운 중엔 켜진 금색 유지 — 곧 다시 가능하다는 인상). */}
      <span
        className={`relative text-2xl font-extrabold tracking-wide ${
          !ready && !charging ? 'text-on-dark-soft' : 'text-gold'
        }`}
      >
        {t('action.enhance')}
      </span>
      {renderCost()}
      {/* 쿨다운 스윕 오버레이 — 라벨/비용 위(z-10)에 얹어 게임 스킬 아이콘처럼 버튼 전체를 덮는다.
          charging 동안에만 보이며(overlayOpacity), conic 마스크가 시계방향으로 걷힌다(sweep).
          overflow-hidden + rounded-2xl 가 버튼 모양대로 잘라 준다. */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 rounded-2xl"
        style={{ background: cooldownMask, opacity: overlayOpacity }}
      />
    </motion.button>
  )
}
