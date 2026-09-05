import { memo } from 'react'
import { LANGS, useI18nStore } from '../i18n'
import { RecordGauge } from './RecordGauge'

// 상단 컨트롤. 좌: 언어 토글, 나머지: 역대 최고 강화 게이지. (거래 제안 강제 갱신 버튼은 제거됨 — 세션 갱신은
// 강화 시도 카운터로만 굴러간다.)
export const TopControls = memo(function TopControls() {
  return (
    <div className="flex items-center gap-2">
      <LangToggle />

      {/* 게이지 칸은 남는 공간을 모두 채우고(flex-1), 게이지가 그 폭을 가득 stretch 한다(w-full). 좌우 여백 px-4.
          게이지는 2줄(라벨 / 진행도 바)이라 이 칸이 상단바를 가장 높게 만들고, 토글은 그 높이에 가운데 정렬된다. */}
      <div className="flex min-w-0 flex-1 px-4">
        <RecordGauge />
      </div>
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
