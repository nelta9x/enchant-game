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
  'sword.2.name': 'Sturdy Dagger',
  'sword.3.name': 'Viking Sword',
  'sword.4.name': 'Burning Sword',
  'sword.5.name': 'Frost Sword',
  'sword.6.name': 'Double-Edged Sword',
  'sword.7.name': "Judicator's Greatsword",
  'sword.8.name': 'Arcane Sword',
  'sword.9.name': 'Tau Sword',
  'sword.10.name': 'Fluorescent Sword',
  'sword.11.name': 'Bloodstained Sword',
  'sword.12.name': 'Flame Twin Swords',
  'sword.13.name': 'Blazing Demon Blade',
  'sword.14.name': 'Apophis the Demon Sword',
  'sword.15.name': 'Demon Battle Axe',
  'sword.16.name': 'Invisible Sword',
  'sword.17.name': 'Swift Dragon Sword',
  'sword.18.name': 'Shiny Sword',
  'sword.19.name': 'Wangpuyasha',
  'sword.20.name': 'Prismatic Sword',
  'sword.21.name': 'Tempest Gold',
  'sword.22.name': 'Sharp Walker',
  'sword.23.name': "Pierrot's Twin Swords",
  'sword.24.name': 'Dragonslaying Saber',
  'sword.25.name': 'Unimposing Sword',
  'sword.26.name': 'Medusa',
  'sword.27.name': 'Odyssey Sword',
  'sword.28.name': 'Mosaikal',
  'sword.29.name': 'Flame-Tempered Sword',
}
