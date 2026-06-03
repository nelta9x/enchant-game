import type { TranslationKey } from '../i18n/locales/ko'

// 강화 비용. 골드 / 아이템(잡템·재료검) / 무료 세 가지 형태.
//  - gold: 골드 amount 소모
//  - item: itemId 아이템을 count 개 소모(재료검·잡템 등)
//  - free: 비용 없음
export type Material =
  | { kind: 'gold'; amount: number }
  | { kind: 'item'; itemId: string; count: number }
  | { kind: 'free' }

// 검의 특수 플래그(언어 중립 태그). 표시가 필요하면 i18n에서 해석한다.
//  - storable(보관필요): 고단계 강화 재료로도 쓰일 수 있는 검
//  - easyBug(이지버그): Easy 모드 버그성 특수 단계
export type SwordNote = 'storable' | 'easyBug'

// 검 정의 데이터(언어 중립).
// 표시명은 코드에 박지 않고 nameKey(i18n 키)로 두어 표시 시점에 t()로 해석한다.
// enhanceCost / successRate 가 null 이면 더 이상 강화할 수 없는 최종 단계(terminal)다.
export type SwordData = {
  level: number
  nameKey: TranslationKey
  enhanceCost: Material | null // null = 최종 단계(강화 불가)
  successRate: number | null // 0~1, null = 최종 단계
  sellPrice: number | null // null = 판매 불가
  protectionTickets: number | 'disabled' // 'disabled' = 방지권 사용 불가
  dropItemOnFail: string | null // 실패 시 드랍되는 잡템 itemId, null = 없음
  notes: SwordNote[]
  // 스프라이트 파일명(예: 'rusty_dagger.png'). 전용 스프라이트가 없는 단계는
  // 로더가 마지막(최고 단계) 보유 스프라이트로 채운다(임시). 디렉토리/URL은 뷰에서 해석.
  sprite: string
}
