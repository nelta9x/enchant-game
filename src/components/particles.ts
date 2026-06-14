// 강화 분출 연출의 길이 상수(순수). 옛 방사형 도트 파티클은 제거됐고(결과 색 불꽃 HitSparkCanvas 로 통합),
// 분출 비행 시간만 타임라인 단일 출처로 남는다 — enhanceTimeline 이 버스트 효과 수명(burstLifetimeMs)을
// 이 값으로 도출한다.

// 분출 비행 시간(초). 버스트 효과가 끝나기 전에 사라지지 않도록 타임라인 수명 계산에 쓰인다.
export const PARTICLE_DUR = 0.6
