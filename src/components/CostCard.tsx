import type { ReactNode } from 'react'
import { useI18nStore, useT } from '../i18n'
import type { Material } from '../data/types'
import { formatGold } from '../lib/format'
import { itemDisplayName } from '../lib/items'
import { Coin } from './Coin'

// 강화비용 / 판매가격 정보 카드(양피지 톤 + 금장 모서리).
// 값은 현재 검의 데이터에 바인딩된다(데모 수치가 아님). 판매 불가/최종 단계는 '—'.
type CostCardProps = { enhanceCost: Material | null; sellPrice: number | null }

export function CostCard({ enhanceCost, sellPrice }: CostCardProps) {
  const t = useT()
  const lang = useI18nStore((s) => s.lang)

  // 강화비용 표시: 골드 → 코인+금액, 아이템 → 이름 ×수량, 무료 → '무료', 없음(최종) → '—'.
  const renderCost = () => {
    if (enhanceCost === null) return <Dash />
    if (enhanceCost.kind === 'free')
      return <span className="text-ink">{t('cost.free')}</span>
    if (enhanceCost.kind === 'gold')
      return (
        <Value coin="gold">{formatGold(enhanceCost.amount, lang)}</Value>
      )
    // item: 재료(검/잡템) 이름 + 수량
    return (
      <span className="font-semibold text-ink">
        {itemDisplayName(enhanceCost.itemId, t)}
        <span className="ml-1 text-ink-soft">×{enhanceCost.count}</span>
      </span>
    )
  }

  return (
    <div className="relative rounded-lg border border-parchment-line bg-parchment px-4 py-3 shadow-sm">
      <Corners />
      <Row label={t('cost.enhance')}>{renderCost()}</Row>
      <div className="my-2.5 border-t border-parchment-line/70" />
      <Row label={t('cost.sell')}>
        {sellPrice === null ? (
          <Dash />
        ) : (
          <Value coin="silver">{formatGold(sellPrice, lang)}</Value>
        )}
      </Row>
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-ink-soft">{label}</span>
      <div className="flex items-center gap-1.5 text-lg leading-none">
        {children}
      </div>
    </div>
  )
}

function Value({
  coin,
  children,
}: {
  coin: 'gold' | 'silver'
  children: ReactNode
}) {
  return (
    <>
      <Coin variant={coin} className="h-5 w-5 shrink-0" />
      <span className="font-bold tabular-nums text-ink">{children}</span>
    </>
  )
}

function Dash() {
  return <span className="text-ink-soft">—</span>
}

// 금장 모서리 장식(4귀퉁이 ㄱ자 브래킷).
function Corners() {
  const base = 'pointer-events-none absolute h-2.5 w-2.5 border-frame/70'
  return (
    <>
      <span className={`${base} left-1 top-1 border-l border-t`} />
      <span className={`${base} right-1 top-1 border-r border-t`} />
      <span className={`${base} bottom-1 left-1 border-b border-l`} />
      <span className={`${base} bottom-1 right-1 border-b border-r`} />
    </>
  )
}
