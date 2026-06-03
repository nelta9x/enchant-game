// 한국어 리소스 — 번역 키의 단일 출처(source of truth).
// 여기 정의된 키 집합이 곧 TranslationKey 타입이 되고,
// 다른 로케일(en 등)은 이 키를 모두 채우도록 타입으로 강제된다.
export const ko = {
  // 앱 공통
  'app.title': '검 강화하기',
  'app.footer':
    '스프린트 1 · 베이스 레이아웃 골격 — 게임 로직은 스프린트 2부터 구현됩니다.',

  // HUD
  'hud.gold': '골드',
  'hud.level': '단계',
  'hud.tickets': '방지권',

  // 난이도
  'difficulty.easy': '쉬움',
  'difficulty.hard': '어려움',

  // 강화 무대
  'enhance.enhance': '강화',
  'enhance.sell': '판매',
  'enhance.notice': '⚙️ 강화·판매 로직은 스프린트 2에서 구현됩니다.',

  // 하단 패널
  'panel.shop': '상점',
  'panel.forge': '조합소',
  'panel.inventory': '인벤토리',
  'panel.shop.hint': '검 · 워프권 · 방지권 구매',
  'panel.forge.hint': '잡템 → 방지권 / 검 교환',
  'panel.inventory.hint': '보유 검 · 잡템 · 방지권',
  'panel.comingSoon': '🚧 준비 중 — 해당 스프린트에서 구현됩니다.',

  // 검 이름 (게임 데이터의 표시명 — DataManager의 nameKey가 이 키를 가리킨다)
  'sword.0.name': '낡은 단검',
  'sword.1.name': '쓸만한 단검',
} as const

// 모든 번역 키의 합집합 타입. 데이터·UI 양쪽에서 이 타입을 키로 사용한다.
export type TranslationKey = keyof typeof ko
