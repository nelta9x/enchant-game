import { motion } from 'motion/react'
import { dataManager } from '../data/DataManager'
import { swordSpriteUrl } from '../lib/sprites'
import { useT } from '../i18n'

export function EnhanceStage() {
  const t = useT()
  // 골격: 시작 검 = +0. 스프린트 2에서 게임 진행 상태의 현재 검으로 대체.
  const sword = dataManager.getSwordByLevel(0)

  return (
    <section className="flex w-full max-w-sm flex-col items-center gap-6">
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="flex aspect-square w-full max-w-[18rem] flex-col items-center justify-center gap-2 rounded-2xl border border-edge bg-surface"
      >
        {sword?.sprite ? (
          <img
            src={swordSpriteUrl(sword.sprite)}
            alt={t(sword.nameKey)}
            className="h-40 w-40 object-contain"
            draggable={false}
          />
        ) : (
          <span className="text-7xl" aria-hidden>
            🗡️
          </span>
        )}
        <span className="text-sm text-muted">+{sword?.level ?? 0}</span>
        <span className="text-lg font-semibold text-fg">
          {sword ? t(sword.nameKey) : ''}
        </span>
      </motion.div>

      <div className="flex w-full gap-3">
        <button
          type="button"
          disabled
          className="flex-1 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white opacity-50"
        >
          {t('enhance.enhance')}
        </button>
        <button
          type="button"
          disabled
          className="flex-1 rounded-xl border border-edge px-4 py-3 text-sm font-semibold text-fg opacity-50"
        >
          {t('enhance.sell')}
        </button>
      </div>

      <p className="text-xs text-muted">{t('enhance.notice')}</p>
    </section>
  )
}
