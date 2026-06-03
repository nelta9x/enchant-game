import { motion } from 'motion/react'
import { useT } from '../i18n'

// 원형 강화 버튼(청색 글로우). 비활성(disabled) 시 글로우·펄스를 끄고 흐리게 표시.
type EnhanceButtonProps = { disabled: boolean; onEnhance: () => void }

export function EnhanceButton({ disabled, onEnhance }: EnhanceButtonProps) {
  const t = useT()
  return (
    <motion.button
      type="button"
      onClick={onEnhance}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.93 }}
      className={`relative grid h-28 w-28 place-items-center rounded-full border bg-gradient-to-b from-panel-soft to-panel transition-opacity sm:h-32 sm:w-32 ${
        disabled
          ? 'cursor-not-allowed border-panel-edge opacity-40 saturate-50'
          : 'cursor-pointer border-enhance/60 shadow-[0_0_28px_-4px_var(--color-enhance-glow)]'
      }`}
    >
      {/* 안쪽 링 */}
      <span
        className={`absolute inset-2.5 rounded-full border-2 ${
          disabled ? 'border-panel-edge' : 'border-enhance/70'
        }`}
      />
      {/* 활성 시 천천히 번지는 펄스 링 */}
      {!disabled && (
        <motion.span
          className="absolute inset-0 rounded-full border border-enhance-glow"
          animate={{ scale: [1, 1.12], opacity: [0.55, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
        />
      )}
      <span
        className={`relative text-xl font-extrabold tracking-wide ${
          disabled ? 'text-on-dark-soft' : 'text-enhance-glow'
        }`}
      >
        {t('action.enhance')}
      </span>
    </motion.button>
  )
}
