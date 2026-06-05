import type { Lang } from '../i18n'

// 골드 금액 → 표시 문자열(뷰 경계). useT는 보간이 없으므로 숫자 포맷은 여기서 조합한다.
// 천 단위 구분은 로케일 무관하게 콤마(en-US)로 통일하고, 단위만 언어별로 붙인다.
//   ko: '2,000,000원'   en: '2,000,000 G'
export function formatGold(amount: number, lang: Lang): string {
  const n = formatAmount(amount)
  return lang === 'ko' ? `${n}원` : `${n} G`
}

// 통화 단위 없이 천 단위 구분만 붙인 숫자 문자열(뷰 경계). 코인 아이콘이 통화를 시각적으로
// 대신하는 자리(강화 비용/판매가/보유 골드)에서 단위 텍스트('원'/'G') 없이 금액만 보일 때 쓴다.
// 단위가 없으니 lang 무관. 스크린리더용 aria-label 에는 formatGold 를 따로 써 통화 맥락을 보존한다.
export function formatAmount(amount: number): string {
  return amount.toLocaleString('en-US')
}

// 골드 획득 플로팅 텍스트(뷰 경계) — 부호(+)를 붙인 금액만. 단위('원'/'G')는 검 위 황금 텍스트라는
// 시각 맥락으로 충분하므로 생략한다(formatAmount 와 같이 lang 무관). 연출은 aria-hidden 이라 통화
// 맥락은 GoldDisplay 의 aria-label(formatGold)이 따로 보존한다.
export function formatGoldGain(amount: number): string {
  return `+${formatAmount(amount)}`
}

// 성공률(0~1) → 정수 백분율 표시 문자열(뷰 경계). 백분율은 로케일 무관이라 formatGold 와
// 달리 lang 인자가 없다. null/검없음 등 부재 처리는 호출 측 책임이다(뷰마다 의미가 다르다:
// 최종 단계 vs 검 없음).
export function formatRate(rate: number): string {
  return `${Math.round(rate * 100)}%`
}
