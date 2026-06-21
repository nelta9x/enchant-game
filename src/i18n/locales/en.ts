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
  'stat.successRate': 'Enchant Success Rate',
  'sword.none': 'No Sword',
  'sword.maxLevel': 'Max Level',

  // 인벤토리
  'inventory.title': 'Inventory',

  // 최고 도달 강화 게이지(상단바)
  'record.best': 'Best Record',

  // 거래 제안(Commission — 내부 코드명은 commission 유지, 표시명만 "거래 제안")
  'commission.title': 'Trade Offers',
  'commission.fulfill': 'Accept',
  'commission.arrived': 'New trade offers!',
  // 제안 강제 갱신 버튼(상단바)
  'commission.refresh': 'Refresh Offers',

  // 강화 결과 토스트
  'toast.success': 'Enchanted',
  'toast.protected': 'Protected',
  'toast.whiff': 'Miss',
  'toast.destroyed': 'Destroyed',

  // 게임 클리어(최종 검 완성)
  'gameClear.title': 'Game Cleared!',
  'gameClear.body': 'You forged Excalibur. Congratulations!',
  'gameClear.close': 'Close',

  // 강화 결과 플로팅 텍스트
  'floatingText.enhanceFail.slip': 'Oops! My hand slipped.',
  'floatingText.enhanceWhiff.betterThanBroken': 'Well, better than shattered.',
  'floatingText.enhanceWhiff.notBroken': 'Phew, at least it didn’t break...',

  // 아이템 표시명
  'item.protection_ticket': 'Protection Ticket',
  'item.iron_scrap': 'Iron Scrap',
  'item.flame_sword_handle': 'Flame Ejector',
  'item.dark_matter': 'Dark Matter',

  // 검 이름
  'sword.1.name': 'Sword',
  'sword.2.name': 'Sabre',
  'sword.3.name': 'Viking Sword',
  'sword.4.name': 'Kukri',
  'sword.5.name': 'Kriss',
  'sword.6.name': 'Gladius',
  'sword.7.name': 'Wangfu',
  'sword.8.name': 'Cutlass',
  'sword.9.name': 'Ssaurabi',
  'sword.10.name': 'Zard',
  'sword.11.name': 'Blade Of Alibaba',
  'sword.12.name': "Wit's End",
  'sword.13.name': 'Blackwidow',
  'sword.14.name': 'Red Lotus Sword',
  'sword.15.name': 'Sachsen Sword',
  'sword.16.name': 'Maxcalibur',
  'sword.17.name': 'Frost Fang',
  'sword.18.name': 'Doombringer',
  'sword.19.name': 'Diffusal Blade',
  'sword.20.name': 'Flameblade',
  'sword.21.name': 'Bloodthirster',
  'sword.22.name': 'Master Sword',
  'sword.23.name': 'Grandfather',
  'sword.24.name': 'Infinity Edge',
  'sword.25.name': 'Evil Sword Apophis',
  'sword.26.name': 'Divine Rapier',
  'sword.27.name': 'Ashbringer',
  'sword.28.name': 'Frostmourne',
  'sword.29.name': 'Holy Sword Onidance',
  'sword.30.name': 'Excalibur',
}
