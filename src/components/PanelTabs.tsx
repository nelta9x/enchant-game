import { AnimatePresence, motion } from 'motion/react'
import type { PanelTab } from '../store/uiStore'
import { useUiStore } from '../store/uiStore'

const TABS: { id: PanelTab; label: string; hint: string }[] = [
  { id: 'shop', label: '상점', hint: '검 · 워프권 · 방지권 구매' },
  { id: 'forge', label: '조합소', hint: '잡템 → 방지권 / 검 교환' },
  { id: 'inventory', label: '인벤토리', hint: '보유 검 · 잡템 · 방지권' },
]

export function PanelTabs() {
  const activeTab = useUiStore((s) => s.activeTab)
  const setActiveTab = useUiStore((s) => s.setActiveTab)
  const active = TABS.find((t) => t.id === activeTab) ?? TABS[0]

  return (
    <section className="overflow-hidden rounded-xl border border-edge bg-surface">
      <div className="flex border-b border-edge">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab.id === activeTab
                ? 'border-b-2 border-accent text-fg'
                : 'text-muted hover:text-fg'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={active.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="px-5 py-6 text-center"
        >
          <p className="text-sm font-semibold text-fg">{active.label}</p>
          <p className="mt-1 text-xs text-muted">{active.hint}</p>
          <p className="mt-4 text-xs text-muted">
            🚧 준비 중 — 해당 스프린트에서 구현됩니다.
          </p>
        </motion.div>
      </AnimatePresence>
    </section>
  )
}
