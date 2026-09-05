// 방사형 파티클 연출의 공유 코어(순수). 파괴(적)·성공(금)이 같은 분출 패턴을 쓰고,
// "강화 단계가 높을수록 더 많이" 규칙을 한 곳에서 관리한다(EffectCanvas 가 렌더).

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
// 도트가 도달하는 최대 반경(px) — 바깥 링(96 + 2×42) + 최대 도트 글로우 반경(12/(2·0.5)) + 여유. 효과 캔버스(EffectCanvas)가
// 이 값으로 최소 크기를 정해 세로 폰(rem 이 작아 30rem < 도달 반경)에서 바깥 링이 잘리지 않게 한다.
export const PARTICLE_REACH_PX = BURST_DIST + 2 * BURST_RING_GAP + 12 + 8

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
