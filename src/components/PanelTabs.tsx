import { AnimatePresence, motion } from 'motion/react'
import type { PanelTab } from '../store/uiStore'
import { useUiStore } from '../store/uiStore'
import { useT, type TranslationKey } from '../i18n'

const TABS: {
  id: PanelTab
  labelKey: TranslationKey
  hintKey: TranslationKey
}[] = [
  { id: 'shop', labelKey: 'panel.shop', hintKey: 'panel.shop.hint' },
  { id: 'forge', labelKey: 'panel.forge', hintKey: 'panel.forge.hint' },
  {
    id: 'inventory',
    labelKey: 'panel.inventory',
    hintKey: 'panel.inventory.hint',
  },
]

export function PanelTabs() {
  const t = useT()
  const activeTab = useUiStore((s) => s.activeTab)
  const setActiveTab = useUiStore((s) => s.setActiveTab)
  const active = TABS.find((tab) => tab.id === activeTab) ?? TABS[0]

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
            {t(tab.labelKey)}
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
          <p className="text-sm font-semibold text-fg">{t(active.labelKey)}</p>
          <p className="mt-1 text-xs text-muted">{t(active.hintKey)}</p>
          <p className="mt-4 text-xs text-muted">{t('panel.comingSoon')}</p>
        </motion.div>
      </AnimatePresence>
    </section>
  )
}
