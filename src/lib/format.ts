import type { Lang } from '../i18n'

// 골드 금액 → 표시 문자열(뷰 경계). useT는 보간이 없으므로 숫자 포맷은 여기서 조합한다.
// 천 단위 구분은 로케일 무관하게 콤마(en-US)로 통일하고, 단위만 언어별로 붙인다.
//   ko: '2,000,000원'   en: '2,000,000 G'
export function formatGold(amount: number, lang: Lang): string {
  const n = amount.toLocaleString('en-US')
  return lang === 'ko' ? `${n}원` : `${n} G`
}

// 성공률(0~1) → 정수 백분율 표시 문자열(뷰 경계). 백분율은 로케일 무관이라 formatGold 와
// 달리 lang 인자가 없다. null/검없음 등 부재 처리는 호출 측 책임이다(뷰마다 의미가 다르다:
// 최종 단계 vs 검 없음).
export function formatRate(rate: number): string {
  return `${Math.round(rate * 100)}%`
}
