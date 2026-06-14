// 파괴 드롭 수집 연출의 "순수 코어" — 타이머/모션/DOM 의존이 없다. 드롭 토큰 개수 산정·
// 흩뿌림(scatter) 파라미터만 결정적 순수 함수로 두어 단위 테스트가 가능하게 한다(뷰-로직 분리).
// 좌표 환산(relativeCenter)·타입(Point/Rect)은 코인 연출과 공유한다.
// 실제 드롭/수집 애니메이션은 DropScatter.tsx(프레젠테이션), 시간(durationMs)은 Effect 시스템이 맡는다.
//
// 연출 의도: 검이 파괴되며 떨어뜨린 재료가 "검 아래"에 흩어져 떨어진다. 마우스로 스칠 때마다(또는
// 일정 시간 후 자동으로) 각 재료가 인벤토리로 빨려 들어간다. 실제 인벤토리 수량은 이미 store 에서
// 즉시 반영되며(게임 로직 불변), 이 연출은 "드롭이 일어났음"을 인지시키는 순수 시각 표현이다.

export { relativeCenter, type Point, type Rect } from './coins'

// 화면에 흩뿌리는 토큰 수 상한. 실제 드롭 수량은 검 데이터에 따라 크게 늘 수 있으므로(수백 개도 가능) 상한을 둔다 —
// 이 이상은 토큰을 더 그리지 않고 대표로만 보여 준다(실제 획득 수량과는 무관, 연출).
export const MAX_DROP_TOKENS = 8

// 흩뿌릴 토큰 수 = 총 드롭 수량을 상한으로 자른 값(없으면 0).
export function dropTokenCount(total: number): number {
  if (total <= 0) return 0
  return Math.min(MAX_DROP_TOKENS, Math.floor(total))
}

// ── 연출 타이밍(초) — 애니메이션 길이의 단일 출처. DropScatter 가 공유한다. ──
// 호흡: 파괴 폭발(버스트)이 드러난 직후 재료가 검 아래로 "툭" 떨어져(backOut 바운스) 흩어진다 → 잠시
// 머물다 → 마우스로 스치거나 일정 시간 후 자동으로 인벤토리로 빨려 들어간다.
//
// 등장 시점(appear)은 매 강화의 버스트 시점(burstAt = 임팩트 + 무작위 떨림)에 묶인다 — 떨림이 길수록 폭발도
// 늦으므로 드롭도 그만큼 늦게 떨어져야 폭발 전에 재료가 먼저 보이는 일이 없다. 그래서 appear 는 코드 상수가
// 아니라 호출 측(GameScreen)이 타임라인에서 도출해 넘긴다(아래 함수들이 appearSec 을 받아 나머지 시각을 도출).
export const DROP_AFTER_BURST_SEC = 0.1 // 버스트가 드러난 뒤 재료가 떨어지기까지의 간격
export const DROP_IN_SEC = 0.45 // 검 위치 → 바닥(rest)으로 떨어지는 시간(토큰 1개)
export const DROP_IN_SPAN = 0.25 // 토큰들이 순차로 떨어지는 폭(stagger) → 우르르 쏟아지는 느낌
export const DROP_LINGER_SEC = 2.6 // 바닥에 머무는 시간 — 이 뒤 미수집분은 자동 수집된다
export const DROP_FLIGHT_SEC = 0.7 // 바닥 → 인벤토리로 빨려 드는 시간(토큰 1개)

// 재료가 떨어지기 시작하는 시각(초, 파일 mount 기준) = 버스트 시점 + 약간의 간격.
export function dropAppearSec(burstAtSec: number): number {
  return burstAtSec + DROP_AFTER_BURST_SEC
}

// 모든 토큰이 떨어져 머문 뒤 자동 수집이 시작되는 시각(초, 파일 mount 기준).
export function dropAutoAtSec(appearSec: number): number {
  return appearSec + DROP_IN_SEC + DROP_IN_SPAN + DROP_LINGER_SEC
}

// 연출 전체 수명(ms). Effect 'drop' 의 durationMs + useOneShot 백스톱이 쓴다. 자동 수집분이
// 인벤토리에 다 도착하고도 여유가 남도록 잡는다(수집 중 토큰이 도중에 사라지지 않게).
export function dropLifetimeMs(appearSec: number): number {
  return Math.round((dropAutoAtSec(appearSec) + DROP_FLIGHT_SEC + 0.4) * 1000)
}

// ── 흩뿌림 기하(px) ──
const DROP_BASE_OFFSET = 92 // 검 박스 중심에서 아래로 — 스프라이트(약 144px) 하단 부근
const DROP_SPREAD = 150 // 좌우로 흩뿌리는 폭
const DROP_ROW_GAP = 26 // 짝/홀 토큰을 두 줄로 살짝 어긋나게(겹침 완화)
const DROP_SIZE_MIN = 30 // 토큰 한 변(px) 최소

// 드롭 토큰 1개의 파라미터(인덱스로 결정 — Math.random 없이 결정적; makeCoins 와 동일 원칙).
export type DropTokenSpec = {
  itemId: string // 이 토큰이 그릴 아이템(ItemIcon 으로 렌더)
  count: number // 이 토큰이 대표하는 실제 수량(토큰 수 상한 때문에 1토큰이 여러 개를 대표할 수 있음)
  dx: number // rest 위치의 수평 오프셋(검 중심 기준, px)
  dy: number // rest 위치의 수직 오프셋(검 중심 기준 아래로, px)
  size: number // 토큰 한 변(px)
  inStagger: number // 떨어지는 지연(s) — 0..DROP_IN_SPAN 에 고르게 분포(우르르 낙하)
  rise: number // 수집 시 위로 솟는 호의 높이(px) — 살짝 떠올랐다 빨려 든다
  drift: number // 수집 호의 수평 분산(px, ±)
  spin: number // 수집 시 회전(부호=방향) — 빨려들 때 돈다
}

// 드롭 스택 목록 → 흩뿌릴 토큰 specs. 토큰 수는 상한(MAX_DROP_TOKENS)이라 1토큰이 여러 개를
// 대표할 수 있다. 각 스택의 수량을 그 스택에 배정된 토큰들에 고르게 분배해(base/remainder) 토큰의
// count 합이 항상 실제 수량과 같게 한다(수집 시 정확히 그 수만큼 인벤토리로 들어간다). 토큰은 검
// 중심 아래에 좌우로 흩어지고, 짝/홀로 두 줄을 이뤄 겹침을 줄인다.
// (파괴 시 dropOnFail 후보가 엔트리별 독립 추첨으로 통과해 여러 종이 동시에 떨어질 수 있으므로
//  drops 는 다중 스택일 수 있다 — 토큰 예산을 초과하는 잔여 수량은 토큰으로 표현되지 않지만 flushDrops 가 회수한다.)
export function makeDropTokens(
  drops: readonly { itemId: string; count: number }[],
): DropTokenSpec[] {
  const stacks = drops
    .map((d) => ({ itemId: d.itemId, count: Math.max(0, Math.floor(d.count)) }))
    .filter((s) => s.count > 0)

  // 스택마다 토큰을 배정하고(slots = min(수량, 남은 예산)), 그 스택의 수량을 토큰들에 분배한다.
  const planned: { itemId: string; count: number }[] = []
  let budget = MAX_DROP_TOKENS
  for (const s of stacks) {
    if (budget <= 0) break
    const slots = Math.min(s.count, budget)
    const base = Math.floor(s.count / slots)
    const rem = s.count % slots // 앞쪽 rem 개 토큰이 1개씩 더 가진다 → 합 = s.count
    for (let k = 0; k < slots; k++) {
      planned.push({ itemId: s.itemId, count: base + (k < rem ? 1 : 0) })
    }
    budget -= slots
  }

  const n = planned.length
  return planned.map((p, i) => {
    const frac = n > 1 ? i / (n - 1) : 0.5
    const dx = (frac - 0.5) * DROP_SPREAD
    const dy = DROP_BASE_OFFSET + (i % 2) * DROP_ROW_GAP + (i % 3) * 3
    const size = DROP_SIZE_MIN + (i % 3) * 4 // 30~38
    const inStagger = (i / n) * DROP_IN_SPAN
    const rise = 38 + (i % 4) * 12 // 38~74 — 수집 호 높이
    const drift = (i % 2 ? 1 : -1) * (6 + (i % 3) * 8) // ±6~22
    const spin = (i % 2 ? 1 : -1) * (1 + (i % 3) * 0.5) // ±1~2
    return {
      itemId: p.itemId,
      count: p.count,
      dx,
      dy,
      size,
      inStagger,
      rise,
      drift,
      spin,
    }
  })
}
