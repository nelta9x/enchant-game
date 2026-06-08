import type { TranslationKey } from './ko'

// 영어 리소스. Record<TranslationKey, string> 타입이므로
// ko의 키 중 하나라도 빠지면 컴파일 단계에서 에러가 난다(누락 키 방지).
export const en: Record<TranslationKey, string> = {
  // 앱 공통
  'app.title': 'Sword Enchant',

  // 상점
  'shop.open': 'Shop',
  'shop.title': 'Shop',
  'shop.buy': 'Buy',
  'shop.close': 'Close',
  'shop.owned': 'Owned',
  'shop.insufficient': 'Not enough',

  // 비용 카드
  'cost.enhance': 'Enhance Cost',
  'cost.sell': 'Sell Price',
  'cost.free': 'Free',

  // 강화 / 판매 / 보관 / 장착 동작
  'action.enhance': 'Enhance',
  'action.sell': 'Sell',
  'action.store': 'Store',
  'action.equip': 'Equip',

  // 파괴보호장치 보호 결계(검 주변) — 토글·상태 라벨
  'protection.toggle': 'Toggle protection',
  'protection.unavailable': 'No Protection',

  // 검 스테이지 스탯
  'stat.protection': 'Protection',
  'stat.successRate': 'Enhance Success Rate',
  'sword.none': 'No Sword',
  'sword.maxLevel': 'Max Level',

  // 인벤토리
  'inventory.title': 'Inventory',

  // 최고 도달 강화 게이지(상단바)
  'record.best': 'Best Record',

  // 거래 제안(Commission — 내부 코드명은 commission 유지, 표시명만 "거래 제안")
  'commission.title': 'Trade Offers',
  'commission.reward': 'Reward',
  'commission.fulfill': 'Accept',
  'commission.arrived': 'New trade offer!',

  // 강화 결과 토스트
  'toast.success': 'Enhanced',
  'toast.protected': 'Protected',
  'toast.destroyed': 'Destroyed',

  // 게임 클리어(최종 검 완성)
  'gameClear.title': 'Game Cleared!',
  'gameClear.body': 'You forged the Divine Rapier. Congratulations!',
  'gameClear.close': 'Close',

  // 아이템 표시명
  'item.protection_ticket': 'Protection Ticket',
  'item.iron_scrap': 'Iron Scrap',
  'item.faded_fluorescent': 'Faded Fluorescent',
  'item.flame_sword_handle': 'Flame Sword Handle',
  'item.dark_matter': 'Dark Matter',

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
  'sword.30.name': 'Divine Rapier',
}
