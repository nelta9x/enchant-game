// 가중치 비례 추첨(weighted pick)의 단일 구현 — 순수 함수(rng 주입 → 결정적 테스트).
// 의뢰 출제(commissionQueue: 단건 선택·비복원 추출)와 플로팅 텍스트 선택(floatingText)이
// 같은 누적 구간 알고리즘을 각자 손으로 들고 있던 것을 한 곳으로 모은다 — 세 구현이
// 미세하게 어긋나면(폴백·경계 처리) 추첨 분포가 조용히 달라지므로 단일 출처로 둔다.
//
// 알고리즘: r = rng() × (가중치 합)을 누적 구간에 떨어뜨려 해당 항목의 인덱스를 고른다.
// 가중치 합이 1이 아니어도 된다(합으로 스케일). 부동소수 오차로 루프가 못 잡으면 마지막
// 인덱스로 폴백한다(기존 세 구현과 동일한 관례).
//
// rng 소비(결정성): 비어 있지 않으면 정확히 1회, 비어 있으면 0회(-1 반환).
// 가중치가 전부 0 이하인 입력의 거부(예: null 반환)는 호출 측 정책이다 — 로더가 weight > 0 을
// 강제하는 경로(의뢰·플로팅 텍스트)에선 발생하지 않는다.
export function weightedIndex<T>(
  entries: readonly T[],
  weightOf: (entry: T) => number,
  rng: () => number,
): number {
  if (entries.length === 0) return -1
  const total = entries.reduce((sum, e) => sum + weightOf(e), 0)
  let r = rng() * total
  let idx = entries.length - 1 // 부동소수 오차 폴백(마지막)
  for (let i = 0; i < entries.length; i += 1) {
    const w = weightOf(entries[i])
    if (r < w) {
      idx = i
      break
    }
    r -= w
  }
  return idx
}
