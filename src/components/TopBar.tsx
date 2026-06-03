import { dataManager } from '../data/DataManager'
import type { Difficulty } from '../store/uiStore'
import { useUiStore } from '../store/uiStore'
import { LANGS, useI18nStore, useT } from '../i18n'

export function TopBar() {
  const t = useT()
  const difficulty = useUiStore((s) => s.difficulty)
  const setDifficulty = useUiStore((s) => s.setDifficulty)

  // 현재 검은 DataManager에서 가져온다(골격: 시작 검 = +0).
  // 골드·방지권 등 진행 상태는 스프린트 2의 gameStore에서 채운다(현재는 0).
  const currentSword = dataManager.getSwordByLevel(0)

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-edge bg-surface px-4 py-3">
      <div className="flex items-center gap-5">
        <Stat label={t('hud.gold')} value={(0).toLocaleString()} accent />
        <Stat label={t('hud.level')} value={`+${currentSword?.level ?? 0}`} />
        <Stat label={t('hud.tickets')} value="0" />
      </div>
      <div className="flex items-center gap-2">
        <DifficultyToggle value={difficulty} onChange={setDifficulty} />
        <LangToggle />
      </div>
    </header>
  )
}

function Stat({
  label,
  value,
  accent = false,
}: {
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] uppercase tracking-wide text-muted">
        {label}
      </span>
      <span
        className={`text-base font-semibold tabular-nums ${accent ? 'text-gold' : 'text-fg'}`}
      >
        {value}
      </span>
    </div>
  )
}

function DifficultyToggle({
  value,
  onChange,
}: {
  value: Difficulty
  onChange: (d: Difficulty) => void
}) {
  const t = useT()
  const options: { id: Difficulty; label: string }[] = [
    { id: 'easy', label: t('difficulty.easy') },
    { id: 'hard', label: t('difficulty.hard') },
  ]
  return (
    <div className="flex rounded-lg border border-edge p-0.5">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
            value === opt.id
              ? 'bg-accent text-white'
              : 'text-muted hover:text-fg'
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
    <div className="flex rounded-lg border border-edge p-0.5">
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
            lang === l ? 'bg-accent text-white' : 'text-muted hover:text-fg'
          }`}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
