import type { TranslationKey } from './ko'

// 영어 리소스. Record<TranslationKey, string> 타입이므로
// ko의 키 중 하나라도 빠지면 컴파일 단계에서 에러가 난다(누락 키 방지).
export const en: Record<TranslationKey, string> = {
  // 앱 공통
  'app.title': 'Sword Enchant',
  'app.footer':
    'Sprint 1 · base layout skeleton — game logic begins in Sprint 2.',

  // HUD
  'hud.gold': 'Gold',
  'hud.level': 'Level',
  'hud.tickets': 'Tickets',

  // 난이도
  'difficulty.easy': 'Easy',
  'difficulty.hard': 'Hard',

  // 강화 무대
  'enhance.enhance': 'Enhance',
  'enhance.sell': 'Sell',
  'enhance.notice': '⚙️ Enhance / sell logic arrives in Sprint 2.',

  // 하단 패널
  'panel.shop': 'Shop',
  'panel.forge': 'Forge',
  'panel.inventory': 'Inventory',
  'panel.shop.hint': 'Buy swords · warp tickets · protection tickets',
  'panel.forge.hint': 'Trade junk items → protection tickets / swords',
  'panel.inventory.hint': 'Owned swords · junk items · tickets',
  'panel.comingSoon': '🚧 Coming soon — built in its sprint.',

  // 검 이름
  'sword.0.name': 'Rusty Dagger',
  'sword.1.name': 'Decent Dagger',
}
