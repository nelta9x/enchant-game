import { useI18nStore } from '../i18n'
import { formatGold } from '../lib/format'
import { Coin } from './Coin'

// 보유 골드(우하단). 은화 + 포맷된 금액.
export function GoldDisplay({ gold }: { gold: number }) {
  const lang = useI18nStore((s) => s.lang)
  return (
    <div className="flex items-center gap-2 rounded-lg border border-panel-edge bg-panel px-4 py-2.5 shadow-md">
      <Coin variant="silver" className="h-6 w-6 shrink-0" />
      <span className="text-lg font-bold tabular-nums text-on-dark">
        {formatGold(gold, lang)}
      </span>
    </div>
  )
}
