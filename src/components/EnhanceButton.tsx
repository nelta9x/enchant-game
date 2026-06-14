import { motion } from 'motion/react'
import { useState } from 'react'
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
//  - 쿨다운(charging): 버튼 표면 자체가 좌→우로 황금색으로 차오른다(프로그래스바). 반투명 덮기가 아니라,
//    같은 내용(라벨/비용)을 "황금 표면 + 어두운 글자" 사본으로 겹쳐 두고 채움 비율만큼 클립해 드러내
//    경계에서 글자색까지 뒤집는다 — 칙칙한 알파 블렌딩 없이 또렷한 금빛. 흐리게(disabled) 만들지 않고
//    풀 밝기 유지, 클릭은 무시(GameScreen 의 잠금 가드).
//  - 진짜 비활성(검 없음/비용 부족/최종): 흐리게(opacity-40) — 아예 누를 수 없음을 명확히.
// aria-keyshortcuts="Space"로 데스크탑 단축키를 알린다(ARIA 키 토큰이라 로케일 무관 — i18n 대상 아님.
// 실제 처리는 useEnhanceHotkey).
//  - charging: 강화 쿨다운(입력 잠금) 중인지. 쿨다운 게이지 표시·채움 타이밍에 쓴다.
//  - chargeMs: 쿨다운 길이(= 직전 강화의 타임라인 lockMs = 떨림 끝 + 재강화 가드). 게이지가 끝까지 차오르는 시간 기준.
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

  // 쿨다운 채움(프로그래스바) — 황금 표면 사본이 좌→우로 차오른다. 채움 경계(클립 비율) 보간은 CSS 가
  // 소유한다(fx-cooldown-fill + @property — index.css): JS(motion)로 매 프레임 인라인 스타일을
  // 갱신하면 연사 중(거의 항상 쿨다운) 60fps 스타일 리캘크가 계속 돌기 때문. charging 이 새로 켜질
  // 때마다 사이클 키를 올려 채움을 재마운트 → CSS 애니메이션이 처음(0% = 빈 게이지)부터 깨끗하게
  // 재시작한다(연사의 true→false→true 토글마다).
  // 전이 감지는 렌더 중 이전 값 비교(공식 "adjusting state during render" 패턴 — effect 의 set 회피).
  const [cooldownCycle, setCooldownCycle] = useState(0)
  const [prevCharging, setPrevCharging] = useState(charging)
  if (charging !== prevCharging) {
    setPrevCharging(charging)
    if (charging) setCooldownCycle((c) => c + 1)
  }

  // 강화 조건 칩 — 골드/아이템만 표시(무료·최종 단계는 null). 아이콘+수량만 시각화하고 aria-label 로 설명.
  // onGold: 황금 채움 사본 위에 그릴 때(true)는 글자·구분선을 어두운 잉크색으로 뒤집어 금빛 위에서 읽히게 한다.
  const renderCost = (onGold: boolean) => {
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
        <span
          className={`relative h-px w-14 ${onGold ? 'bg-ink/30' : 'bg-on-dark-soft/30'}`}
          aria-hidden
        />
        <span
          className={`relative flex items-center justify-center gap-1.5 text-sm font-bold tabular-nums ${
            onGold ? 'text-ink' : 'text-on-dark'
          }`}
          // 황금 사본은 base 와 글자만 같고 시각 중복이라 스크린리더에서 숨긴다(접근성은 base 가 전담).
          aria-label={onGold ? undefined : `${t('cost.enhance')}: ${label}`}
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

  // 버튼 안쪽 내용(라벨 + 비용) — base/gold 두 톤으로 두 번 그린다. base 는 평소(어두운 표면 위 금색)이고,
  // gold 는 쿨다운 채움 사본(황금 표면 위 어두운 글자)이라 채움 경계에서 글자색이 정확히 뒤집힌다.
  const renderContent = (onGold: boolean) => (
    <>
      {/* "강화" 라벨 — base 는 강화 수치용 UI 금색(text-gold, 진짜 비활성만 흐린 색), gold 사본은 잉크색. */}
      <span
        className={`relative text-2xl font-extrabold tracking-wide ${
          onGold
            ? 'text-ink'
            : !ready && !charging
              ? 'text-on-dark-soft'
              : 'text-gold'
        }`}
      >
        {t('action.enhance')}
      </span>
      {renderCost(onGold)}
    </>
  )

  return (
    <motion.button
      type="button"
      onPointerDown={hold.onPointerDown}
      onClick={hold.onClick}
      disabled={disabled}
      aria-keyshortcuts="Space"
      aria-disabled={charging || undefined}
      whileTap={{ scale: 0.95 }}
      // touch-none: 이 버튼에서 시작한 터치를 스크롤·줌 제스처로 넘기지 않는다 — 모바일 press-and-hold
      // 연사(useHoldRepeat)가 pointercancel 로 끊기지 않게 한다(페이지는 한 화면 맞춤이라 스크롤 손실 없음).
      className={`relative flex w-full touch-none flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border bg-gradient-to-b from-panel-soft to-panel px-3 py-5 transition-opacity ${
        ready
          ? 'cursor-pointer border-gold/60 shadow-[0_0_28px_-4px_var(--color-gold)]' // 가능 — 금색 글로우 + 펄스
          : charging
            ? 'cursor-wait border-gold/40' // 쿨다운 — 황금 채움이 표면을 좌→우로 덮음(흐리지 않게 풀 밝기)
            : 'cursor-not-allowed border-panel-edge opacity-40 saturate-50' // 진짜 비활성 — 흐림
      }`}
    >
      {/* 활성 시 천천히 번지는 펄스 링(카드 외곽) — 쿨다운·불가에는 끈다.
          상시 펄스라 CSS(.fx-pulse-ring — index.css)가 소유한다(메인 스레드 0). */}
      {ready && (
        <span className="fx-pulse-ring pointer-events-none absolute inset-0 rounded-2xl border border-gold-glow" />
      )}
      {/* 기본 내용(어두운 표면 위 금색) — 쿨다운 미충전 영역의 모습. */}
      {renderContent(false)}
      {/* 쿨다운 황금 채움 — 같은 내용을 "황금 표면 + 어두운 글자" 사본으로 z-10 에 겹쳐 두고, 채움 비율
          (--cooldown-fill)만큼 좌→우로 클립해 드러낸다. 경계 왼쪽은 이 사본(금빛), 오른쪽은 클립돼 base
          (어두움)가 비친다 — 같은 자리에 겹쳐 그렸기에 경계에서 표면·글자색이 동시에 뒤집힌다. 표면은
          불투명 노란 금색 그라데이션(gold-glow→gold 토큰 — 골드 획득 텍스트와 같은 톤, hex 하드코딩
          금지)이라 알파 블렌딩의 칙칙함이 없다.
          클립 비율은 CSS 애니메이션(fx-cooldown-fill, forwards)이 0%→100% 차오르고, 쿨다운이 끝나면
          opacity 만 0.15s 로 거둔다(정상 종료 땐 이미 가득 차 있고, 타이밍이 어긋나도 부드럽게 사라진다).
          overflow-hidden + rounded-2xl 가 버튼 모양대로 잘라 주고, inset-0 + 같은 flex/padding 으로 base
          와 글자 위치를 픽셀 단위로 맞춘다. */}
      <span
        key={cooldownCycle}
        aria-hidden
        className={`pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-2xl px-3 py-5 transition-opacity duration-150 ease-out ${
          charging ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          background:
            'linear-gradient(to right, transparent calc(var(--cooldown-fill) - 10px), color-mix(in srgb, var(--color-gold-glow) 80%, transparent) var(--cooldown-fill)), linear-gradient(to bottom, var(--color-gold-glow), var(--color-gold))',
          clipPath: 'inset(0 calc(100% - var(--cooldown-fill)) 0 0)',
          animation: `fx-cooldown-fill ${Math.max(chargeMs, 0)}ms linear forwards`,
        }}
      >
        {renderContent(true)}
      </span>
    </motion.button>
  )
}
