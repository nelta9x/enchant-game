import { memo, type ReactNode, useState } from 'react'
import type { ItemCost, Material } from '../data/types'
import { useHoldRepeat } from '../hooks/useHoldRepeat'
import { useEffectStore } from '../store/effectStore'
import { useI18nStore, useT } from '../i18n'
import { formatAmount, formatGold } from '../lib/format'
import { itemDisplayName } from '../lib/items'
import { Coin } from './Coin'
import { ItemIcon } from './ItemIcon'

// 밝은 골드 배너 위 흰 글자 — 따뜻한 갈금색(gold-ink) 8방향 1px 외곽선 + 옅은 드롭섀도로, 밝은 금색
// 표면 위에서도 또렷하게 떠 보이게 한다(레퍼런스 "빠른 순찰" 타이틀 바의 굵은 외곽선 라벨 톤).
const GOLD_OUTLINE =
  '1px 0 0 var(--color-gold-ink), -1px 0 0 var(--color-gold-ink), 0 1px 0 var(--color-gold-ink), 0 -1px 0 var(--color-gold-ink), 1px 1px 0 var(--color-gold-ink), -1px 1px 0 var(--color-gold-ink), 1px -1px 0 var(--color-gold-ink), -1px -1px 0 var(--color-gold-ink), 0 2px 3px rgba(0,0,0,0.3)'

// 강화 버튼 표면 = 밝은 골드 배너(레퍼런스 타이틀 바 톤). 왼쪽 옅은 골드(gold-glow)에서 시작해
// 약 50% 지점부터 오른쪽 끝으로 갈수록 노란 골드(gold)가 강조되는 가로 그라데이션. hex 하드코딩
// 금지 규약대로 토큰에서 파생.
const BANNER_BG =
  'linear-gradient(to right, var(--color-gold-glow), var(--color-gold-glow) 45%, var(--color-gold))'

// 쿨다운 "리차지" 디밍 레이어 — 평소엔 가득 밝은 배너. 쿨다운 시작에 어둡게 "소진"됐다가 밝은 골드가
// 좌→우로 다시 차오른다. 이 레이어는 아직 안 찬(오른쪽) 영역을 어둡게 덮고, transform 으로 오른쪽으로
// 밀려나며(CSS .fx-cooldown-dim) 밝은 배너를 드러낸다. 레이어의 왼쪽 가장자리가 "차오르는 선두"라
// 거기에 골드 글로우 띠(0.6rem)를 두고 그 뒤로 어둠이 이어진다.
const RECHARGE_DIM =
  'linear-gradient(to right, color-mix(in srgb, var(--color-gold-glow) 80%, transparent), rgba(0,0,0,0.5) 0.6rem)'

// 강화 버튼 — 둥근 카드형 밝은 골드 배너(레퍼런스 "빠른 순찰" 타이틀 바 톤). 카드 안에 "강화" 라벨 +
// 강화 조건(비용/재료)을 아이콘+수량으로 보여 준다. 글자는 흰색 + 갈금색 외곽선으로 밝은 금색 위에서도
// 또렷하다.
//  - 골드 비용: 금화 아이콘 + 금액 / 아이템(재료검·잡템) 비용: 아이템 아이콘 + ×수량 / 무료·최종 단계: 칩 없이 라벨만.
//  - 비용 칩은 시각적으로 아이콘+수량만 보여 주되, aria-label 로 스크린리더에 비용을 설명한다(접근성 보존).
// 상태별 표현:
//  - 가능(ready = 강화 가능 && 쿨다운 아님): 가득 밝은 골드 배너 + 금색 글로우 + 펄스 링. 클릭 가능.
//  - 쿨다운(charging): "리차지" — 버튼이 어둡게 소진됐다가 밝은 골드가 좌→우로 다시 차오른다(RECHARGE_DIM).
//    흐리게(disabled) 만들지 않고, 클릭은 무시(GameScreen 의 잠금 가드).
//  - 진짜 비활성(검 없음/비용 부족/최종): 흐리게(opacity-40 saturate-50) — 아예 누를 수 없음을 명확히.
// aria-keyshortcuts="Space"로 데스크탑 단축키를 알린다(ARIA 키 토큰이라 로케일 무관 — i18n 대상 아님.
// 실제 처리는 useEnhanceHotkey).
//  - 쿨다운(charging)은 효과 store 의 lockCount 를 버튼이 직접 구독한다(prop 아님).
//  - chargeMs: 쿨다운 길이(= 직전 강화의 타임라인 lockMs = 떨림 끝 + 재강화 가드). 리차지가 끝까지 차오르는 시간 기준.
type EnhanceButtonProps = {
  disabled: boolean
  chargeMs: number
  onEnhance: () => void
  enchantCost: Material | null
  enchantCostItems: readonly ItemCost[]
}

export const EnhanceButton = memo(function EnhanceButton({
  disabled,
  chargeMs,
  onEnhance,
  enchantCost,
  enchantCostItems,
}: EnhanceButtonProps) {
  const t = useT()
  const lang = useI18nStore((s) => s.lang)
  // 쿨다운(입력 잠금) — 효과 store 의 lockCount 를 이 리프만 구독한다. 잠금 해제 전이가 상위 화면(GameScreen)을
  // 커밋시키지 않고 버튼 하나만 다시 그린다(잠금 시작은 강화 탭 커밋에 이미 포함).
  const charging = useEffectStore((s) => s.lockCount > 0)

  // 강화 가능 상태 = 강화 가능(검·비용 OK) && 쿨다운 아님. 평소 활성 연출(금색 글로우·펄스)의 기준.
  const ready = !disabled && !charging

  // 마우스로 꾹 누르면 강화 → 쿨다운 → 강화 … 가 이어지도록 press-and-hold 연사(스페이스 단축키와 같은 박자).
  // 발사 게이트 disabled = !ready(불가·쿨다운). 터치/펜은 탭=1회, 키보드 Enter 는 합성 click 으로 1회
  // (스페이스는 전역 단축키 useEnhanceHotkey 가 전담). onEnhance 의 잠금 가드가 쿨다운 중 발사를 무효화한다.
  // 발사 게이트는 함수 — 잠금은 store 를 직접 읽어(커밋 무관) 폴링이 항상 최신 잠금을 본다.
  const hold = useHoldRepeat<HTMLButtonElement>({
    isDisabled: () => disabled || useEffectStore.getState().lockCount > 0,
    onFire: onEnhance,
  })

  // 쿨다운 리차지(좌→우 차오름) — 디밍 레이어의 이동은 CSS transform 애니메이션(fx-cooldown-recharge,
  // index.css)이 소유한다: 합성 전용이라 쿨다운 내내 메인 스레드 스타일 재계산·리페인트가 0 이다(JS motion 이나
  // clip-path 보간은 연사 중 — 거의 항상 쿨다운 — 매 프레임 버튼을 다시 래스터한다). charging 이 새로 켜질
  // 때마다 사이클 키를 올려 레이어를 재마운트 → 애니메이션이 처음(가득 소진)부터 깨끗하게 재시작한다(연사의
  // true→false→true 토글마다). 전이 감지는 렌더 중 이전 값 비교(공식 "adjusting state during render" 패턴).
  const [cooldownCycle, setCooldownCycle] = useState(0)
  const [prevCharging, setPrevCharging] = useState(charging)
  if (charging !== prevCharging) {
    setPrevCharging(charging)
    if (charging) setCooldownCycle((c) => c + 1)
  }

  // 강화 조건 칩 — 골드/아이템(enchantCost) + 추가 아이템(enchantCostItems)을 칩으로 나열한다.
  // 무료·최종 단계(칩 0개)는 null. 아이콘+수량만 시각화하고 aria-label 로 전체 비용을 설명한다.
  const renderCost = () => {
    type Chip = { key: string; icon: ReactNode; qty: string; label: string }
    const chips: Chip[] = []
    if (enchantCost !== null && enchantCost.kind === 'gold')
      chips.push({
        key: 'gold',
        icon: <Coin className="h-5 w-5" />,
        // 금화 아이콘이 통화를 대신하므로 단위 없이 금액만 표시. aria-label 엔 단위 포함(formatGold).
        qty: formatAmount(enchantCost.amount),
        label: formatGold(enchantCost.amount, lang),
      })
    else if (enchantCost !== null && enchantCost.kind === 'item')
      chips.push({
        key: enchantCost.itemId,
        icon: <ItemIcon itemId={enchantCost.itemId} className="h-5 w-5" />,
        qty: `×${enchantCost.count}`,
        label: `${itemDisplayName(enchantCost.itemId, t)} ×${enchantCost.count}`,
      })
    for (const ec of enchantCostItems)
      chips.push({
        key: ec.itemId,
        icon: <ItemIcon itemId={ec.itemId} className="h-5 w-5" />,
        qty: `×${ec.count}`,
        label: `${itemDisplayName(ec.itemId, t)} ×${ec.count}`,
      })
    if (chips.length === 0) return null // 무료·최종 단계
    return (
      <>
        <span className="relative h-px w-14 bg-gold-ink/30" aria-hidden />
        <span
          className="relative flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm font-bold tabular-nums text-white"
          style={{ textShadow: GOLD_OUTLINE }}
          aria-label={`${t('cost.enhance')}: ${chips.map((c) => c.label).join(', ')}`}
        >
          {chips.map((c) => (
            <span key={c.key} className="flex items-center gap-1.5 whitespace-nowrap">
              {c.icon}
              {c.qty}
            </span>
          ))}
        </span>
      </>
    )
  }

  return (
    <button
      type="button"
      onPointerDown={hold.onPointerDown}
      onClick={hold.onClick}
      disabled={disabled}
      aria-keyshortcuts="Space"
      aria-disabled={charging || undefined}
      style={{ background: BANNER_BG }}
      // touch-none: 이 버튼에서 시작한 터치를 스크롤·줌 제스처로 넘기지 않는다 — 모바일 press-and-hold
      // 연사(useHoldRepeat)가 pointercancel 로 끊기지 않게 한다(페이지는 한 화면 맞춤이라 스크롤 손실 없음).
      className={`fx-layer relative flex w-full touch-none flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 px-3 py-5 transition-[opacity,transform] duration-100 active:scale-95 ${
        ready
          ? 'cursor-pointer border-frame shadow-[0_0_28px_-4px_var(--color-gold)]' // 가능 — 금색 글로우 + 펄스
          : charging
            ? 'cursor-wait border-frame' // 쿨다운 — 리차지 오버레이가 좌→우로 차오름(흐리지 않게 풀 밝기)
            : 'cursor-not-allowed border-panel-edge opacity-40 saturate-50' // 진짜 비활성 — 흐림
      }`}
    >
      {/* 활성 시 천천히 번지는 펄스 링(카드 외곽) — 쿨다운·불가에는 끈다.
          상시 펄스라 CSS(.fx-pulse-ring — index.css)가 소유한다(메인 스레드 0). */}
      {ready && (
        <span className="fx-pulse-ring pointer-events-none absolute inset-0 rounded-2xl border border-gold-glow" />
      )}
      {/* "강화" 라벨 — 흰 글자 + 갈금색 외곽선(밝은 골드 배너 위 대비). */}
      <span
        className="relative text-2xl font-extrabold tracking-wide text-white"
        style={{ textShadow: GOLD_OUTLINE }}
      >
        {t('action.enhance')}
      </span>
      {renderCost()}
      {/* 쿨다운 리차지 오버레이 — 라벨/비용 위(z-10). 바깥 span 은 버튼 모양대로 자르는 클립 창(overflow-hidden,
          rounded-2xl)이자 쿨다운이 끝났을 때 0.15s 로 걷히는 페이드(정상 종료 땐 이미 다 밀려났고, 타이밍이
          어긋나 잔여가 남아도 부드럽게 사라진다). 안쪽 디밍 레이어(.fx-cooldown-dim)가 chargeMs 동안 translateX
          0 → 100% 로 밀려나며 밝은 배너를 좌→우로 드러낸다 — 합성 전용이라 리페인트 0. */}
      <span
        key={cooldownCycle}
        aria-hidden
        className={`pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-2xl transition-opacity duration-150 ease-out ${
          charging ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <span
          className="fx-cooldown-dim absolute inset-0"
          style={{
            background: RECHARGE_DIM,
            ['--fx-cooldown-ms' as string]: `${Math.max(chargeMs, 0)}ms`,
          }}
        />
      </span>
    </button>
  )
})
