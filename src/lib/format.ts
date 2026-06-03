import type { Lang } from '../i18n'

// 골드 금액 → 표시 문자열(뷰 경계). useT는 보간이 없으므로 숫자 포맷은 여기서 조합한다.
// 천 단위 구분은 로케일 무관하게 콤마(en-US)로 통일하고, 단위만 언어별로 붙인다.
//   ko: '2,000,000원'   en: '2,000,000 G'
export function formatGold(amount: number, lang: Lang): string {
  const n = amount.toLocaleString('en-US')
  return lang === 'ko' ? `${n}원` : `${n} G`
}
