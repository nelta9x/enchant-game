import type { TranslationKey } from '../i18n/locales/ko'

// 검 정의 데이터. 언어 중립 구조 — 표시명은 코드에 박지 않고
// nameKey(i18n 키)로 두어 표시 시점에 t()로 해석한다.
//
// 스프린트1 골격에서는 level / nameKey 구조만 둔다.
// 강화 비용·확률·판매가·드롭 등은 '데이터 시트 → 코드 상수화' 항목에서 확장한다.
export type SwordData = {
  level: number
  nameKey: TranslationKey
}
