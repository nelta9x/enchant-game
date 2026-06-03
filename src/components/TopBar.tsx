import type { Difficulty } from '../store/uiStore'
import { useUiStore } from '../store/uiStore'

// 스프린트 1 표시용 placeholder. 스프린트 2에서 gameStore의 실제 상태로 대체된다.
const PLACEHOLDER = {
  gold: 300,
  swordLevel: 0,
  protectionTickets: 0,
}

export function TopBar() {
  const difficulty = useUiStore((s) => s.difficulty)
  const setDifficulty = useUiStore((s) => s.setDifficulty)

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-edge bg-surface px-4 py-3">
      <div className="flex items-center gap-5">
        <Stat label="골드" value={PLACEHOLDER.gold.toLocaleString()} accent />
        <Stat label="단계" value={`+${PLACEHOLDER.swordLevel}`} />
        <Stat label="방지권" value={`${PLACEHOLDER.protectionTickets}`} />
      </div>
      <DifficultyToggle value={difficulty} onChange={setDifficulty} />
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
  const options: { id: Difficulty; label: string }[] = [
    { id: 'easy', label: 'Easy' },
    { id: 'hard', label: 'Hard' },
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
