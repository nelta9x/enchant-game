import { AnimatePresence, motion } from 'motion/react'
import { useT, type TranslationKey } from '../i18n'
import type { EnhanceResult } from '../game/types'
import { itemDisplayName } from '../lib/items'

// 강화 1회 결과 피드백. id가 시도마다 바뀌므로 같은 결과가 연속돼도 애니메이션이 재생된다.
export type EnhanceFeedback = { result: EnhanceResult; id: number }

const OUTCOME: Record<
  EnhanceResult['outcome'],
  { key: TranslationKey; cls: string }
> = {
  success: {
    key: 'toast.success',
    cls: 'border-success/50 bg-success/15 text-success',
  },
  protected: {
    key: 'toast.protected',
    cls: 'border-enhance/50 bg-enhance/15 text-enhance',
  },
  destroyed: {
    key: 'toast.destroyed',
    cls: 'border-danger/50 bg-danger/15 text-danger',
  },
}

export function ResultToast({ feedback }: { feedback: EnhanceFeedback | null }) {
  const t = useT()
  return (
    <AnimatePresence>
      {feedback && (
        <motion.div
          key={feedback.id}
          initial={{ opacity: 0, y: -10, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-bold shadow-md ${OUTCOME[feedback.result.outcome].cls}`}
        >
          <span>
            {t(OUTCOME[feedback.result.outcome].key)}
            {feedback.result.outcome === 'success' &&
              ` +${feedback.result.toLevel}`}
          </span>
          {feedback.result.drops.map((d) => (
            <span
              key={d.itemId}
              className="rounded-full bg-black/10 px-2 py-0.5 text-xs"
            >
              +{itemDisplayName(d.itemId, t)} ×{d.count}
            </span>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
