import type { SwordData } from '../types'

// 스프린트1 골격용 placeholder 검 데이터.
// nameKey 타입이 TranslationKey 이므로, i18n에 없는 키를 적으면 컴파일 에러가 난다.
// 전체 검 데이터(29종)는 '데이터 시트 → 코드 상수화' 항목에서 채운다.
export const SWORDS: SwordData[] = [
  { level: 0, nameKey: 'sword.0.name' },
  { level: 1, nameKey: 'sword.1.name' },
]
