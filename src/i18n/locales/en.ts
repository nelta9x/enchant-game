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
  'cost.enhance': 'Enchant Cost',
  'cost.sell': 'Sell Price',
  'cost.free': 'Free',

  // 강화 / 판매 / 보관 / 장착 동작
  'action.enhance': 'Enchant',
  'action.sell': 'Sell',
  'action.store': 'Store',
  'action.equip': 'Equip',

  // 파괴보호장치 보호 결계(검 주변) — 토글·상태 라벨
  'protection.toggle': 'Toggle protection',
  'protection.unavailable': 'No Protection',

  // 검 스테이지 스탯
  'stat.protection': 'Protection',
  'stat.successRate': 'Enchant Success Rate',
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
  'toast.success': 'Enchanted',
  'toast.protected': 'Protected',
  'toast.destroyed': 'Destroyed',

  // 게임 클리어(최종 검 완성)
  'gameClear.title': 'Game Cleared!',
  'gameClear.body': 'You forged Excalibur. Congratulations!',
  'gameClear.close': 'Close',

  // 강화 결과 플로팅 텍스트
  'floatingText.enhanceFail.slip': 'Oops! My hand slipped.',

  // 아이템 표시명
  'item.protection_ticket': 'Protection Ticket',
  'item.iron_scrap': 'Iron Scrap',
  'item.faded_fluorescent': 'Faded Fluorescent',
  'item.flame_sword_handle': 'Flame Sword Handle',
  'item.dark_matter': 'Dark Matter',

  // 검 이름
  'sword.1.name': 'Sword',
  'sword.2.name': 'Sabre',
  'sword.3.name': 'Viking Sword',
  'sword.4.name': 'Kukri',
  'sword.5.name': 'Kriss',
  'sword.6.name': 'Gladius',
  'sword.7.name': 'Scimitar',
  'sword.8.name': 'Cutlass',
  'sword.9.name': 'Zard',
  'sword.10.name': 'Red Lotus Sword',
  'sword.11.name': 'Widowmaker',
  'sword.12.name': 'Sachsen Sword',
  'sword.13.name': "Wit's End",
  'sword.14.name': "Tiger's Fang",
  'sword.15.name': 'Blade of Ali Baba',
  'sword.16.name': 'Doombringer',
  'sword.17.name': 'Holy Sword Onidance',
  'sword.18.name': 'Bloodthirster',
  'sword.19.name': 'Phantom Dancer',
  'sword.20.name': 'Flameblade',
  'sword.21.name': 'Trinity Force',
  'sword.22.name': 'Evil Sword Apophis',
  'sword.23.name': 'Grandfather',
  'sword.24.name': 'Ssaurabi Longsword',
  'sword.25.name': 'Maxcaliber',
  'sword.26.name': 'Meteor Twins',
  'sword.27.name': 'Infinity Edge',
  'sword.28.name': 'Butterfly',
  'sword.29.name': 'Stormstrike',
  'sword.30.name': 'Excalibur',
}
