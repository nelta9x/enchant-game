import { motion } from 'motion/react'

// 스프린트 1 표시용 placeholder 검. 스프린트 2에서 데이터 시트 기반 실제 검으로 대체.
const PLACEHOLDER_SWORD = { level: 0, name: '낡은 단검' }

export function EnhanceStage() {
  return (
    <section className="flex w-full max-w-sm flex-col items-center gap-6">
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="flex aspect-square w-full max-w-[18rem] flex-col items-center justify-center gap-2 rounded-2xl border border-edge bg-surface"
      >
        <span className="text-7xl" aria-hidden>
          🗡️
        </span>
        <span className="text-sm text-muted">+{PLACEHOLDER_SWORD.level}</span>
        <span className="text-lg font-semibold text-fg">
          {PLACEHOLDER_SWORD.name}
        </span>
      </motion.div>

      <div className="flex w-full gap-3">
        <button
          type="button"
          disabled
          className="flex-1 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white opacity-50"
        >
          강화
        </button>
        <button
          type="button"
          disabled
          className="flex-1 rounded-xl border border-edge px-4 py-3 text-sm font-semibold text-fg opacity-50"
        >
          판매
        </button>
      </div>

      <p className="text-xs text-muted">
        ⚙️ 강화·판매 로직은 스프린트 2에서 구현됩니다.
      </p>
    </section>
  )
}
