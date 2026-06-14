import { motion } from 'motion/react'
import { useState } from 'react'
import type { Material } from '../data/types'
import { useHoldRepeat } from '../hooks/useHoldRepeat'
import { useI18nStore, useT } from '../i18n'
import { formatAmount, formatGold } from '../lib/format'
import { itemDisplayName } from '../lib/items'
import { Coin } from './Coin'
import { ItemIcon } from './ItemIcon'

// 밝은 골드 배너 위 흰 글자 — 따뜻한 갈금색(gold-ink) 8방향 1px 외곽선 + 옅은 드롭섀도로, 밝은 금색
// 표면 위에서도 또렷하게 떠 보이게 한다(레퍼런스 "빠른 순찰" 타이틀 바의 굵은 외곽선 라벨 톤).
const GOLD_OUTLINE =
  '1px 0 0 var(--color-gold-ink), -1px 0 0 var(--color-gold-ink), 0 1px 0 var(--color-gold-ink), 0 -1px 0 var(--color-gold-ink), 1px 1px 0 var(--color-gold-ink), -1px 1px 0 var(--color-gold-ink), 1px -1px 0 var(--color-gold-ink), -1px -1px 0 var(--color-gold-ink), 0 2px 3px rgba(0,0,0,0.3)'

// 강화 버튼 표면 = 골드 배너(레퍼런스 타이틀 바 톤). 왼쪽은 채도 높은 "완전 노랑"에 가까운 골드에서
// 시작해(gold-glow 와 gold 를 섞어 옅은 크림빛 대신 또렷한 노랑을 낸다) 오른쪽 끝으로 갈수록 깊은
// 골드(gold)로 가라앉는 가로 그라데이션. hex 하드코딩 금지 규약대로 토큰에서 color-mix 로 파생
// (글로벌 gold 토큰은 그대로 — 판매가·+N·재화는 영향 없음).
const BANNER_BG =
  'linear-gradient(to right, color-mix(in srgb, var(--color-gold-glow) 32%, var(--color-gold)), color-mix(in srgb, var(--color-gold-glow) 32%, var(--color-gold)) 45%, var(--color-gold))'

// 쿨다운 "리차지" 오버레이 — 평소엔 가득 밝은 배너. 쿨다운 시작에 어둡게 "소진"됐다가 밝은 골드가
// 좌→우로 다시 차오른다. 이 오버레이는 아직 안 찬(오른쪽) 영역을 어둡게 덮고, 채움 비율(--cooldown-fill)
// 만큼 좌→우로 물러난다(clip-path 왼쪽 inset). 채움 선두엔 골드 글로우 띠로 차오르는 끝선을 강조한다.
const RECHARGE_DIM =
  'linear-gradient(to right, color-mix(in srgb, var(--color-gold-glow) 80%, transparent) var(--cooldown-fill), rgba(0,0,0,0.5) calc(var(--cooldown-fill) + 0.6rem))'

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
//  - charging: 강화 쿨다운(입력 잠금) 중인지. 리차지 오버레이 표시·차오름 타이밍에 쓴다.
//  - chargeMs: 쿨다운 길이(= 직전 강화의 타임라인 lockMs = 떨림 끝 + 재강화 가드). 리차지가 끝까지 차오르는 시간 기준.
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

  // 쿨다운 리차지(좌→우 차오름) — 채움 경계(클립 비율) 보간은 CSS 가 소유한다(fx-cooldown-fill +
  // @property — index.css): JS(motion)로 매 프레임 인라인 스타일을 갱신하면 연사 중(거의 항상 쿨다운)
  // 60fps 스타일 리캘크가 계속 돌기 때문. charging 이 새로 켜질 때마다 사이클 키를 올려 오버레이를
  // 재마운트 → CSS 애니메이션이 처음(0% = 가득 소진)부터 깨끗하게 재시작한다(연사의 true→false→true 토글마다).
  // 전이 감지는 렌더 중 이전 값 비교(공식 "adjusting state during render" 패턴 — effect 의 set 회피).
  const [cooldownCycle, setCooldownCycle] = useState(0)
  const [prevCharging, setPrevCharging] = useState(charging)
  if (charging !== prevCharging) {
    setPrevCharging(charging)
    if (charging) setCooldownCycle((c) => c + 1)
  }

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
        <span className="relative h-px w-14 bg-gold-ink/30" aria-hidden />
        <span
          className="relative flex items-center justify-center gap-1.5 text-sm font-bold tabular-nums text-white"
          style={{ textShadow: GOLD_OUTLINE }}
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
      style={{ background: BANNER_BG }}
      // touch-none: 이 버튼에서 시작한 터치를 스크롤·줌 제스처로 넘기지 않는다 — 모바일 press-and-hold
      // 연사(useHoldRepeat)가 pointercancel 로 끊기지 않게 한다(페이지는 한 화면 맞춤이라 스크롤 손실 없음).
      className={`relative flex w-full touch-none flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 px-3 py-5 transition-opacity ${
        ready
          ? 'cursor-pointer border-frame shadow-[0_0_20px_-6px_var(--color-gold)]' // 가능 — 금색 글로우(톤다운) + 펄스
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
      {/* 쿨다운 리차지 오버레이 — 라벨/비용 위(z-10)에 얹어, 아직 안 찬(오른쪽) 영역을 어둡게 덮는다.
          채움 비율(--cooldown-fill)만큼 왼쪽 inset 으로 물러나며(clip-path) 밝은 배너가 좌→우로 드러나
          "리차지"된다. 차오르는 선두엔 골드 글로우 띠. 비율 보간은 CSS 애니메이션(fx-cooldown-fill,
          forwards)이 0%→100% 진행하고, 쿨다운이 끝나면 opacity 만 0.15s 로 거둔다(정상 종료 땐 이미 다 찼고,
          타이밍이 어긋나 잔여가 남아도 부드럽게 사라진다). overflow-hidden + rounded-2xl 가 모양대로 잘라 준다. */}
      <span
        key={cooldownCycle}
        aria-hidden
        className={`pointer-events-none absolute inset-0 z-10 rounded-2xl transition-opacity duration-150 ease-out ${
          charging ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          background: RECHARGE_DIM,
          clipPath: 'inset(0 0 0 var(--cooldown-fill))',
          animation: `fx-cooldown-fill ${Math.max(chargeMs, 0)}ms linear forwards`,
        }}
      />
    </motion.button>
  )
}
