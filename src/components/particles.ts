// 방사형 파티클 연출의 공유 코어(순수). 파괴(적)·성공(금)이 같은 분출 패턴을 쓰고,
// "강화 단계가 높을수록 더 많이" 규칙을 한 곳에서 관리한다(ParticlePool 이 렌더).

// 파티클 비행 시간(초). 파괴/성공 연출의 길이 계산에도 쓰인다(단일 출처).
export const PARTICLE_DUR = 0.6

// 단계별 파티클 수 스케일링: 단계가 높을수록 더 많이 분출(선형).
const BASE_PARTICLES = 8
const PARTICLES_PER_LEVEL = 1.2

export function particleCount(level: number): number {
  return Math.round(BASE_PARTICLES + Math.max(0, level) * PARTICLES_PER_LEVEL)
}

export type Particle = { x: number; y: number; size: number; stagger: number }

// 분출 반경(px) — 중심에서 퍼지는 거리. 3개 링으로 순환(촘촘함은 count 가 키운다).
// 값을 키우면 파티클이 더 넓게 퍼진다.
const BURST_DIST = 96 // 첫 링 반경
const BURST_RING_GAP = 42 // 링 간 간격

// 중심에서 사방으로 흩는 파티클 좌표를 결정적으로 생성한다(렌더 비의존).
// 균등 분포 + 교번 지터, 거리·크기는 인덱스로 순환 → count 가 커지면 같은 링이 더 촘촘해진다.
export function makeParticles(count: number): Particle[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + (i % 2 ? 0.22 : -0.2)
    const dist = BURST_DIST + (i % 3) * BURST_RING_GAP // 96 / 138 / 180 px
    const size = 6 + (i % 4) * 2 // 6 / 8 / 10 / 12 px
    return {
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      size,
      stagger: (i % 5) * 0.015,
    }
  })
}

// ── Hit 불꽃 스파크(망치가 검에 닿는 순간 1회) ───────────────────────────────────
// 성공/실패 버스트(사방으로 균등하게 퍼지는 방사형)와 "다른 느낌"이어야 한다(요구사항) — 충돌점에서
// 위쪽으로 튀어 오르는 불티 부채꼴이다. 방사형 대신 위쪽(−y) 중심의 좁은 부채꼴 + 작은 크기 + 짧은
// 비행으로, 풀의 'hit' 모션이 중력 낙하·깜빡임(flicker)을 더해 모루에 쇠를 칠 때 튀는 불꽃처럼 보이게 한다.

// 한 번의 임팩트에 튀는 불티 수(단계와 무관 — 임팩트는 항상 같은 한 번의 타격이다).
export const HIT_SPARK_COUNT = 14
// 불티 비행 시간(초) — 버스트(PARTICLE_DUR)보다 짧고 빠르게 사그라든다.
export const HIT_SPARK_DUR = 0.5

const HIT_FAN_DEG = 150 // 위쪽을 중심으로 한 부채꼴 폭(클수록 옆으로도 튄다)
const HIT_DIST_MIN = 46 // 가장 가까운 불티의 도달 거리(px)
const HIT_DIST_STEP = 22 // 거리 링 간격(인덱스로 순환 → 멀리 튀는 불티도 섞인다)

// 충돌점에서 위쪽으로 튀어 오르는 불티 좌표를 결정적으로 생성한다(makeParticles 와 동일 원칙 — 인덱스 기반).
// (x, y) 는 불티가 솟구치는 "정점" 방향이고, 실제 중력 낙하는 풀의 'hit' 모션이 그 아래로 더한다.
export function makeHitSparks(count: number): Particle[] {
  const n = Math.max(0, count)
  const fanRad = (HIT_FAN_DEG * Math.PI) / 180
  return Array.from({ length: n }, (_, i) => {
    const t = n > 1 ? i / (n - 1) : 0.5 // 0..1 로 부채꼴을 고르게 채움
    // −90°(똑바로 위) 중심으로 좌우 fan/2 만큼 펼치고, 교번 지터로 줄세움을 흩는다.
    const angle = -Math.PI / 2 + (t - 0.5) * fanRad + (i % 2 ? 0.14 : -0.16)
    const dist = HIT_DIST_MIN + (i % 4) * HIT_DIST_STEP // 46 / 68 / 90 / 112 px
    const size = 3 + (i % 3) * 1.5 // 3 / 4.5 / 6 px — 버스트보다 작게(불티)
    return {
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist, // 위쪽이라 음수
      size,
      stagger: (i % 4) * 0.012,
    }
  })
}
