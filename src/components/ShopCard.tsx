import { memo, useCallback } from 'react'
import { dataManager } from '../data/DataManager'
import { useI18nStore, useT } from '../i18n'
import { formatAmount, formatGold } from '../lib/format'
import { itemDisplayName } from '../lib/items'
import { sound } from '../lib/sound'
import { uiSpriteUrl } from '../lib/sprites'
import { nextUpgradeCost, useCommissionStore } from '../store/commissionStore'
import { useGameStore } from '../store/gameStore'
import { Coin } from './Coin'
import { ItemIcon } from './ItemIcon'
import { SpriteCanvas } from './SpriteCanvas'

// 상점 카드 아이콘 — 검·아이템과 같은 32px 도트 스프라이트(public/sprites/ui/shop.png)를 SpriteCanvas 로 그린다.
// URL 조립은 sprites.ts 경계(uiSpriteUrl — UI_SPRITES 등록 이름)에서만. 모듈 평가 시 1회 해석(BASE_URL 은 빌드 상수).
const SHOP_SPRITE_URL = uiSpriteUrl('shop')

// 상점 카드 — 상단 컨트롤(언어 토글·최고 기록 게이지)과 거래 제안 카드 줄의 오른쪽에 두 줄 높이로 서는 세로
// 패널(GameScreen 그리드의 row-span-2 — 예전 갱신 버튼 자리부터 제안 카드 밑단까지). 상점 아이콘 + 현재 상점
// 레벨(표시는 1 부터 — 내부 shopLevel 0 = Lv.1) + 다음 업그레이드 비용을 보여 주고, 클릭하면 비용을 내고 상점을
// 업그레이드한다(commissionStore.upgradeShop — 세션이 새 티어 풀로 즉시 갱신돼 카드들이 교체된다). 비용은 거래
// 비용과 같은 체계(골드 또는 아이템)라 표시도 제안 카드의 지불 라인과 같은 어휘(코인+금액 / 아이템 아이콘 ×N)를
// 쓴다. 게이팅은 제안 카드와 같은 idiom: 업그레이드 가능(잠금 해제 + 비용 충당) 불리언 셀렉터만 구독해,
// 골드·가방이 임계를 넘나들 때만 리렌더한다. 최고 레벨이면 '최고 등급'으로 비활성. 높이는 그리드가 stretch 로
// 준다(h-full) — 카드 자신은 고정 높이를 두지 않는다.
export const ShopCard = memo(function ShopCard() {
  const t = useT()
  const lang = useI18nStore((s) => s.lang)
  const config = dataManager.getCommissionConfig()
  const shopLevel = useCommissionStore((s) => s.shopLevel)
  const cost = nextUpgradeCost(config, shopLevel)
  const canUpgrade = useGameStore(
    (s) =>
      cost !== null &&
      s.maxLevelReached >= config.unlockAtLevel &&
      s.canFulfill(cost),
  )
  const onUpgrade = useCallback(() => {
    // 업그레이드 성공(재화 실제 차감) 시에만 '재화 빠지는' 효과음 — 판매·거래 성사와 같은 item_sold.
    if (useCommissionStore.getState().upgradeShop()) sound.playSfx('item_sold')
  }, [])
  const levelLabel = `${t('commission.shop')} ${t('commission.shopLevel')}${shopLevel + 1}`
  // 비용 문구(스크린리더) — 골드는 formatGold(로케일 단위), 아이템은 표시명 ×N. 최고 레벨이면 '최고 등급'.
  const costLabel =
    cost === null
      ? t('commission.shopMax')
      : cost.kind === 'gold'
        ? formatGold(cost.amount, lang)
        : `${itemDisplayName(cost.itemId, t)}${cost.count > 1 ? ` ×${cost.count}` : ''}`

  return (
    <button
      type="button"
      onClick={onUpgrade}
      disabled={!canUpgrade}
      aria-label={`${t('commission.shopUpgrade')} (${levelLabel}): ${costLabel}`}
      // 업그레이드 가능하면 황금색 강조(테두리 + 글로우 — 제안 카드의 초록과 구분되는 '상점' 어휘), 불가하면 흐리게.
      className={`relative flex h-full w-[5.5rem] shrink-0 flex-col items-center justify-center gap-1.5 overflow-hidden rounded-lg border px-2 py-2 text-center transition-opacity sm:w-24 ${
        canUpgrade
          ? 'cursor-pointer border-gold bg-panel ring-1 ring-gold/60 shadow-[0_0_12px_-2px_var(--color-gold)] hover:opacity-90'
          : 'cursor-not-allowed border-frame/40 bg-panel-soft opacity-60'
      }`}
    >
      {/* 타이틀(ko '상점' / en 'SHOP') → 상점 스프라이트 → 레벨(LV.N) → 비용 순으로 세로 배치. uppercase 는 라틴 문자에만 작용. */}
      <span className="text-[0.7rem] font-bold uppercase leading-none tracking-widest text-on-dark">
        {t('commission.shop')}
      </span>
      <SpriteCanvas url={SHOP_SPRITE_URL} className="h-12 w-12" />
      <span className="text-[0.7rem] font-bold uppercase leading-none tabular-nums tracking-wide text-gold">
        {t('commission.shopLevel')}
        {shopLevel + 1}
      </span>
      {/* 비용 라인 — 카드의 지불 라인과 같은 어휘. 최고 레벨이면 텍스트만. */}
      {cost === null ? (
        <span className="text-[0.65rem] font-semibold leading-none text-on-dark-soft">
          {t('commission.shopMax')}
        </span>
      ) : cost.kind === 'gold' ? (
        <span className="flex items-center gap-0.5 text-[0.65rem] font-bold leading-none text-gold tabular-nums">
          <Coin className="h-3 w-3" />
          {formatAmount(cost.amount)}
        </span>
      ) : (
        <span className="flex items-center gap-0.5 text-[0.65rem] font-bold leading-none text-gold tabular-nums">
          <ItemIcon itemId={cost.itemId} className="h-4 w-4" />
          {cost.count > 1 && <span>×{cost.count}</span>}
        </span>
      )}
    </button>
  )
})
