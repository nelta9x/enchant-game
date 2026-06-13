import { AnimatePresence, motion } from 'motion/react'
import { dataManager } from '../data/DataManager'
import { useT } from '../i18n'
import { swordSpriteUrl } from '../lib/sprites'
import { useModalDialog } from './useModalDialog'

// 게임 클리어(승리) 모달. 최종 검(엑스칼리버)을 완성하면 GameScreen 이 띄운다.
// 오버레이·포커스·ESC·트랩 규약은 상점 모달과 같다(공통 크롬 useModalDialog — 닫기만, 게임 상태는 그대로 둔다).
type GameClearModalProps = { open: boolean; onClose: () => void }

export function GameClearModal({ open, onClose }: GameClearModalProps) {
  const t = useT()
  // 최종 검 = 최고 단계 검(데이터에서 해석 — id 하드코딩 없이 검 단계를 늘려도 자동 동작).
  const finalSword = dataManager.getSwordByLevel(dataManager.getMaxSwordLevel())
  const { panelRef, closeRef, trapTab } = useModalDialog({ open, onClose })

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="game-clear-title"
            className="w-full max-w-sm overflow-hidden rounded-2xl border border-gold/60 bg-panel shadow-[0_0_40px_-4px_var(--color-gold)]"
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={trapTab}
          >
            <div className="flex flex-col items-center gap-4 px-6 py-8 text-center">
              {/* 최종 검 스프라이트 — 황금 글로우 위에 떠오른다. */}
              <div className="relative grid h-36 w-36 place-items-center">
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background:
                      'radial-gradient(circle, color-mix(in srgb, var(--color-gold) 70%, transparent) 0%, transparent 64%)',
                  }}
                  aria-hidden
                />
                {finalSword && (
                  <motion.img
                    src={swordSpriteUrl(finalSword.sprite)}
                    alt={t(finalSword.nameKey)}
                    className="relative h-28 w-28 object-contain"
                    style={{ imageRendering: 'pixelated' }}
                    draggable={false}
                    initial={{ scale: 0.6, rotate: -12, opacity: 0 }}
                    animate={{ scale: 1, rotate: 0, opacity: 1 }}
                    transition={{
                      duration: 0.5,
                      ease: 'backOut',
                      delay: 0.1,
                    }}
                  />
                )}
              </div>

              <h2
                id="game-clear-title"
                className="text-2xl font-extrabold tracking-tight text-gold"
              >
                {t('gameClear.title')}
              </h2>
              <p className="text-sm text-on-dark-soft">{t('gameClear.body')}</p>

              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                className="mt-2 cursor-pointer rounded-lg border border-gold/60 bg-gold/10 px-6 py-2.5 text-sm font-bold text-gold transition-colors hover:bg-gold/20"
              >
                {t('gameClear.close')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
