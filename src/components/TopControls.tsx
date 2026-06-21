import { memo, useCallback } from 'react'
import { dataManager } from '../data/DataManager'
import { LANGS, useI18nStore, useT } from '../i18n'
import { formatAmount } from '../lib/format'
import { useCommissionStore } from '../store/commissionStore'
import { useGameStore } from '../store/gameStore'
import { Coin } from './Coin'
import { RecordGauge } from './RecordGauge'

// 상단 컨트롤. 좌: 언어 토글, 가운데: 역대 최고 강화 게이지, 우: 거래 제안 강제 갱신 버튼.
export const TopControls = memo(function TopControls() {
  return (
    <div className="flex items-center gap-2">
      <LangToggle />

      {/* 가운데 칸은 남는 공간을 모두 채우고(flex-1), 게이지가 그 폭을 가득 stretch 한다(w-full). 좌우 여백 px-4.
          게이지는 2줄(라벨 / 진행도 바)이라 이 칸이 상단바를 가장 높게 만들고, 양옆 버튼은 그 높이에 가운데 정렬된다. */}
      <div className="flex min-w-0 flex-1 px-4">
        <RecordGauge />
      </div>

      <RefreshOffersButton />
    </div>
  )
})

// 거래 제안 강제 갱신 버튼 — 누르면 refreshCost 골드를 내고 제안 세션을 즉시 새로 받는다(상점 버튼을 대체).
// 보유 골드·도달 레벨을 자기 자신이 구독해 게이팅하므로(GoldDisplay·CommissionBar 와 동일 idiom) TopControls
// 자체는 prop 없이 memo 로 부모 커밋에 bail 한다. 설정(refreshCost·unlockAtLevel)은 load 이후라 dataManager
// 를 직접 읽는다(CommissionBar 와 동일). 위(Refresh 아이콘) / 아래(골드 코인 + 비용)로 세로 배치한다.
function RefreshOffersButton() {
  const t = useT()
  const gold = useGameStore((s) => s.gold)
  const maxLevelReached = useGameStore((s) => s.maxLevelReached)
  const config = dataManager.getCommissionConfig()
  const refreshCost = config.refreshCost
  // 잠금 해제(도달 레벨) + 비용 충당 가능할 때만 활성. refreshNow 가 같은 조건을 self-guard 하지만,
  // 비활성(흐림)으로 미리 알려 헛클릭(골드 부족·잠금)을 막는다.
  const canRefresh =
    maxLevelReached >= config.unlockAtLevel && gold >= refreshCost
  const onRefresh = useCallback(() => {
    useCommissionStore.getState().refreshNow()
  }, [])
  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={!canRefresh}
      // 비용은 아이콘으로 보이지만 스크린리더엔 동작+금액을 합성해 알린다(CommissionBar 의 aria-label 관례).
      aria-label={`${t('commission.refresh')}: ${formatAmount(refreshCost)} gold`}
      className="flex cursor-pointer flex-col items-center gap-0.5 rounded-lg border border-frame/50 bg-panel px-3 py-1.5 text-on-dark transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <RefreshIcon />
      {/* 골드 차감 표시 — 골드 코인 아이콘 + 차감 금액(천 단위 콤마). 코인이 통화를 시각적으로 대신한다. */}
      <span className="flex items-center gap-0.5 text-[0.65rem] font-bold leading-none text-gold tabular-nums">
        <Coin className="h-3 w-3" />
        {formatAmount(refreshCost)}
      </span>
    </button>
  )
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex rounded-lg border border-panel-edge bg-panel p-0.5">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          aria-pressed={value === opt.id}
          className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
            value === opt.id
              ? 'bg-enhance text-on-dark'
              : 'text-on-dark-soft hover:text-on-dark'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function LangToggle() {
  const lang = useI18nStore((s) => s.lang)
  const setLang = useI18nStore((s) => s.setLang)
  return (
    <Segmented
      options={LANGS.map((l) => ({ id: l, label: l.toUpperCase() }))}
      value={lang}
      onChange={setLang}
    />
  )
}

// 갱신(refresh-cw) 아이콘 — 두 갈래 화살표가 도는 형태로 "제안을 새로 돌린다"는 동작을 또렷이 전한다.
function RefreshIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </svg>
  )
}
