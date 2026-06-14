// 판매 코인 연출의 "순수 코어" — 타이머/모션/DOM 의존이 없다. 코인 개수 산정·분출 파라미터·
// 좌표 계산만 순수 함수로 두어 결정적 단위 테스트가 가능하게 한다(뷰-로직 분리).
// 실제 비행 애니메이션은 CoinFlight.tsx(프레젠테이션)가, 시간(durationMs)은 Effect 시스템이 맡는다.

// 코인 1개당 골드. "10000골드당 코인 하나"(사용자 지정). 코인은 순수 시각 표현이며 실제 획득
// 골드와는 무관하다(골드는 판매가 그대로 들어간다).
export const GOLD_PER_COIN = 10000
// 화면/컴퓨팅 상한. 판매가는 수십억까지 가므로(검 데이터) 반드시 상한을 둔다 — 이 이상은 포화.
export const MAX_COINS = 50

// 판매가 → 분출할 코인 수. floor(gold / 10000), 단 판매가 있으면 최소 1개, 최대 MAX_COINS.
export function coinCount(gold: number): number {
  if (gold <= 0) return 0
  return Math.min(MAX_COINS, Math.max(1, Math.floor(gold / GOLD_PER_COIN)))
}

// ── 연출 타이밍(초) — 애니메이션 길이의 단일 출처. CoinFlight 와 GoldDisplay(카운터 반응)가 공유. ──
// 모바일 코인 흡수의 표준 호흡: "흩뿌려 튀어오름(backOut 바운스) → 코인마다 다른 시간 체공 →
// 살짝 당겼다 급가속 흡수(backIn)". 동기화를 피하려 체공 시간을 코인마다 다르게 준다(hold).
export const COIN_FLIGHT_SEC = 0.9 // 코인 1개의 전체 수명(튀어오름 + 체공 + 당김·흡수)
export const COIN_STAGGER_SPAN = 0.28 // 코인들이 연속 방출되는 폭 → 도착이 스트림처럼 이어진다
export const COIN_ARRIVAL_SEC = 0.82 // 골드 글로우가 번지기 시작하는 시점 — 첫 코인이 빨려들기 직전

// 연출 전체 수명(ms). Effect 'coinFlight' 의 durationMs(진행 길이) + useOneShot 백스톱이 쓴다.
// 마지막 코인(stagger 끝)이 흡수를 마치고도 여유가 남도록 잡는다.
export const COIN_FLIGHT_MS =
  Math.round((COIN_STAGGER_SPAN + COIN_FLIGHT_SEC) * 1000) + 250

// 각 코인이 골드창에 "도착하는" 시각(초, 방출 순간 0 기준). 코인은 stagger 만큼 늦게 방출돼
// COIN_FLIGHT_SEC 뒤 도착하므로 arrival_i = stagger_i + COIN_FLIGHT_SEC (makeCoins 의 stagger 와 동일식).
// CoinFlight 의 코인 도착과 GoldDisplay 의 코인별 타격(통통통)·숫자 증가를 "콜백 없이" 이 한 스케줄로 맞춘다.
export function coinArrivalTimes(count: number): number[] {
  const n = Math.max(0, Math.floor(count))
  return Array.from(
    { length: n },
    (_, i) => (i / n) * COIN_STAGGER_SPAN + COIN_FLIGHT_SEC,
  )
}

// 튀어오르는 부채꼴 반각(rad). 코인은 검에서 "위쪽으로 넓게 흩뿌려" 튀어오른 뒤 골드창으로 빨려든다.
const COIN_FAN_SPREAD = 1.4 // 수직(↑) 기준 ±80° — 넓게 흩뿌림

// 코인 1개의 분출 파라미터(인덱스로 결정 — Math.random 없이 결정적; makeParticles 와 동일 원칙).
export type CoinSpec = {
  angle: number // 튀어오름 방향(rad) — 위쪽(-π/2) 중심 부채꼴. frac 단조 → 코인마다 다른 각도
  rise: number // 튀어오름 정점까지 거리(px) — 코인마다 달라 흩뿌려진 구름이 된다
  drift: number // 체공 중 수평 분산(px, ±) — 정점에서 흩어져 머무는 느낌
  settle: number // 체공 중 살짝 내려앉는 양(px) — 정점에서 잠깐 떠 있다 가라앉음
  hold: number // 체공이 끝나고 흡수가 시작되는 시점(0..1, 코인마다 달라 동기화를 깬다)
  size: number // 코인 한 변(px)
  stagger: number // 방출 지연(s) — 0..COIN_STAGGER_SPAN 에 고르게 분포(스트림처럼 도착)
}

export function makeCoins(count: number): CoinSpec[] {
  const n = Math.max(0, Math.floor(count))
  return Array.from({ length: n }, (_, i) => {
    // 위쪽(-π/2)을 중심으로 넓게 펼친다(frac 0..1 → 단조 증가 → 각도 모두 distinct).
    const frac = n > 1 ? i / (n - 1) : 0.5
    const angle = -Math.PI / 2 + (frac - 0.5) * 2 * COIN_FAN_SPREAD
    const rise = 64 + (i % 5) * 28 // 64~176 — 튀어오르는 정점 높이
    const drift = (i % 2 ? 1 : -1) * (8 + (i % 3) * 9) // ±8~26 — 체공 수평 분산
    const settle = 6 + (i % 4) * 6 // 6~24 — 체공 중 가라앉는 양
    const hold = 0.32 + (i % 4) * 0.09 // 0.32~0.59 — 코인마다 다른 체공 길이(동기화 방지)
    const size = 22 + (i % 3) * 5 // 22~32
    const stagger = (i / n) * COIN_STAGGER_SPAN
    return { angle, rise, drift, settle, hold, size, stagger }
  })
}

// ── 좌표 헬퍼(순수) — 측정한 DOMRect 들을 오버레이 기준 좌표로 환산. CoinFlight 의 유일한 테스트 대상. ──
export type Rect = { left: number; top: number; width: number; height: number }
export type Point = { x: number; y: number }

// rect 의 중심을 origin(오버레이) 좌상단 기준 좌표로 환산한다.
// 측정은 반드시 코인이 사는 오버레이 자신의 rect 를 origin 으로 써야 한다 — 카드의 padding/border
// 만큼 어긋나지 않도록(좌표계 일관성).
export function relativeCenter(rect: Rect, origin: Rect): Point {
  return {
    x: rect.left + rect.width / 2 - origin.left,
    y: rect.top + rect.height / 2 - origin.top,
  }
}
