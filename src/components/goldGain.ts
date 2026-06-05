// 골드 획득 플로팅 텍스트의 "순수 코어" — 금액 → 글자 크기 매핑과 연출 수명만 둔다.
// 모션/DOM/타이머 의존이 없어 결정적 단위 테스트가 가능하다(coins.ts 와 동일한 뷰-로직 분리 원칙).
// 실제 떠오름·페이드 애니메이션은 GoldGainText.tsx(프레젠테이션)가 맡는다.

// 연출 전체 수명(ms) — Effect 가 아닌 로컬 트리거(GameScreen)라 useOneShot 백스톱이 이 값으로 만료시킨다.
// 통 떠오른 뒤 잠시 머물다(획득을 또렷이 인지) 천천히 페이드 — 너무 짧으면 큰 획득의 쾌감이 휘발된다.
export const GOLD_GAIN_MS = 1300

// 글자 크기 한계(px). 1만 이하는 기본 크기(MIN), 천문학적 금액이어도 레이아웃을 깨지 않게(MAX) 묶는다.
export const GOLD_TEXT_MIN_PX = 30
export const GOLD_TEXT_MAX_PX = 60

// "한 자릿수(10배)마다 이만큼 커진다"(px). 10000골드(=ANCHOR_DECADE)까지는 기본 크기(MIN)로 두고,
// 거기서 금액이 10배 커질 때마다 선형으로 키운다 — 곱(10×)에 대해 선형이라 체감이 자연스럽다(로그 스케일).
// 예) 1만=30 · 10만=33 · 100만=36 · 1000만=39.
const STEP_PER_DECADE = 3
const ANCHOR_DECADE = 4 // log10(10000)

// 획득 골드 → 플로팅 텍스트 글자 크기(px). 금액이 많을수록 커지되 [MIN, MAX] 로 포화한다.
export function goldTextSize(amount: number): number {
  if (amount <= 0) return GOLD_TEXT_MIN_PX
  const decade = Math.log10(amount)
  const px = GOLD_TEXT_MIN_PX + (decade - ANCHOR_DECADE) * STEP_PER_DECADE
  return Math.round(Math.min(GOLD_TEXT_MAX_PX, Math.max(GOLD_TEXT_MIN_PX, px)))
}

// 금색 글로우(텍스트 뒤 광채)를 함께 띄우기 시작하는 금액 임계값(100만). 큰 획득일 때만 더 화려하게 빛난다.
export const GOLD_GLOW_THRESHOLD = 1_000_000

// 이 금액부터 텍스트에 금색 글로우를 덧입힌다. 뷰가 글로우 레이어를 켤지 결정하는 단일 기준(순수).
export function hasGoldGlow(amount: number): boolean {
  return amount >= GOLD_GLOW_THRESHOLD
}
