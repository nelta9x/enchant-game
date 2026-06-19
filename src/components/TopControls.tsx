import { memo } from 'react'
import { LANGS, useI18nStore, useT } from '../i18n'
import { RecordGauge } from './RecordGauge'

// 상단 컨트롤. 좌: 언어 토글, 가운데: 역대 최고 강화 게이지, 우: 상점(클릭 시 상점 팝업 열기).
type TopControlsProps = { onOpenShop: () => void }

export const TopControls = memo(function TopControls({
  onOpenShop,
}: TopControlsProps) {
  const t = useT()
  return (
    <div className="flex items-center gap-2">
      <LangToggle />

      {/* 가운데 칸은 남는 공간을 모두 채우고(flex-1), 게이지가 그 폭을 가득 stretch 한다(w-full). 좌우 여백 px-4.
          게이지는 2줄(라벨 / 진행도 바)이라 이 칸이 상단바를 가장 높게 만들고, 양옆 버튼은 그 높이에 가운데 정렬된다. */}
      <div className="flex min-w-0 flex-1 px-4">
        <RecordGauge />
      </div>

      <button
        type="button"
        onClick={onOpenShop}
        aria-haspopup="dialog"
        className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-frame/50 bg-panel px-3 py-1.5 text-sm font-semibold text-on-dark transition-opacity hover:opacity-90"
      >
        <ShopIcon />
        {t('shop.open')}
      </button>
    </div>
  )
})

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

function ShopIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M4 4h16l-1 4.5a3 3 0 0 1-3 2.5 3 3 0 0 1-3-2.5A3 3 0 0 1 10 11a3 3 0 0 1-3-2.5L4 4Z" />
      <path d="M5 11v9h14v-9a4.2 4.2 0 0 1-3 .9 4 4 0 0 1-2-1 4 4 0 0 1-2 1 4 4 0 0 1-2-1 4.2 4.2 0 0 1-3 .1Z" />
    </svg>
  )
}
