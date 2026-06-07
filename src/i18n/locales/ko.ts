// 한국어 리소스 — 번역 키의 단일 출처(source of truth).
// 여기 정의된 키 집합이 곧 TranslationKey 타입이 되고,
// 다른 로케일(en 등)은 이 키를 모두 채우도록 타입으로 강제된다.
export const ko = {
  // 앱 공통
  'app.title': '검 강화하기',

  // 상점
  'shop.open': '상점',
  'shop.title': '상점',
  'shop.buy': '구매',
  'shop.close': '닫기',
  'shop.owned': '보유',
  'shop.insufficient': '재화 부족',

  // 비용 카드
  'cost.enhance': '강화비용',
  'cost.sell': '판매가격',
  'cost.free': '무료',

  // 강화 / 판매 / 보관 / 장착 동작
  'action.enhance': '강화',
  'action.sell': '판매',
  'action.store': '보관',
  'action.equip': '장착',

  // 파괴보호장치 보호 결계(검 주변) — 토글·상태 라벨
  'protection.toggle': '파괴보호장치 사용 전환',
  'protection.unavailable': '보호 불가',

  // 검 스테이지 스탯
  'stat.protection': '파괴보호장치',
  'stat.successRate': '성공률',
  'sword.none': '검 없음',
  'sword.maxLevel': '최종 단계',

  // 인벤토리
  'inventory.title': '인벤토리',

  // 의뢰(Commission)
  'commission.title': '의뢰',
  'commission.reward': '보상',
  'commission.fulfill': '납품',
  'commission.empty': '준비 중',
  'commission.level': '의뢰 Lv.',

  // 강화 결과 토스트
  'toast.success': '강화 성공',
  'toast.protected': '파괴보호장치로 보호',
  'toast.destroyed': '검 파괴',

  // 아이템 표시명 (파괴보호장치 · 잡템 — 인벤토리/드랍 표시에 사용)
  // 재료로 쓰이는 검(sword_<level>)은 검 이름 키(sword.N.name)로 해석한다.
  'item.protection_ticket': '파괴보호장치',
  'item.iron_scrap': '철조각',
  'item.faded_fluorescent': '빛 바랜 형광물질',
  'item.flame_sword_handle': '불꽃마검 손잡이',
  'item.dark_matter': '암흑 물질',

  // 검 이름 (게임 데이터의 표시명 — DataManager의 nameKey가 이 키를 가리킨다)
  // 보관필요/이지버그 등 특수 플래그는 이름이 아니라 SwordData.notes로 둔다.
  'sword.0.name': '낡은 단검',
  'sword.1.name': '쓸만한 단검',
  'sword.2.name': '견고한 단검',
  'sword.3.name': '바이킹 소드',
  'sword.4.name': '불타는 검',
  'sword.5.name': '냉기의 소드',
  'sword.6.name': '양날 검',
  'sword.7.name': '심판자의 대검',
  'sword.8.name': '마력의 검',
  'sword.9.name': '타우 스워드',
  'sword.10.name': '형광검',
  'sword.11.name': '피묻은 검',
  'sword.12.name': '화염의 쌍검',
  'sword.13.name': '불꽃 마검',
  'sword.14.name': '마검 아포피스',
  'sword.15.name': '데몬 배틀 엑스',
  'sword.16.name': '투명 검',
  'sword.17.name': '날렵한 용검',
  'sword.18.name': '샤이니 소드',
  'sword.19.name': '왕푸야샤',
  'sword.20.name': '다색검',
  'sword.21.name': '템페스트 골드',
  'sword.22.name': '샤프 워커',
  'sword.23.name': '피에로의 쌍검',
  'sword.24.name': '도룡도',
  'sword.25.name': '안 강해보이는 검',
  'sword.26.name': '메두사',
  'sword.27.name': '오딧세이 소드',
  'sword.28.name': '모자이칼',
  'sword.29.name': '화염에 달군 검',
} as const

// 모든 번역 키의 합집합 타입. 데이터·UI 양쪽에서 이 타입을 키로 사용한다.
export type TranslationKey = keyof typeof ko
