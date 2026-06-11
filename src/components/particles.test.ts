import { describe, it, expect } from 'vitest'
import { particleCount, makeParticles, makeHitSparks } from './particles'

describe('particleCount — 단계별 스케일링', () => {
  it('단계가 높을수록 파티클이 더 많다(단조 증가)', () => {
    for (let lv = 1; lv <= 29; lv++) {
      expect(particleCount(lv)).toBeGreaterThanOrEqual(particleCount(lv - 1))
    }
    // 양 끝이 실제로 차이가 난다(고단계가 더 많음).
    expect(particleCount(29)).toBeGreaterThan(particleCount(0))
  })

  it('정수 개수를 반환하고 0단계에서도 양수다', () => {
    expect(Number.isInteger(particleCount(0))).toBe(true)
    expect(particleCount(0)).toBeGreaterThan(0)
  })

  it('음수 단계는 0단계로 클램프(방어적)', () => {
    expect(particleCount(-5)).toBe(particleCount(0))
  })
})

describe('makeParticles — 결정적 분포', () => {
  it('요청한 개수만큼 생성한다', () => {
    expect(makeParticles(8)).toHaveLength(8)
    expect(makeParticles(40)).toHaveLength(40)
  })

  it('결정적이다(같은 count → 같은 좌표)', () => {
    expect(makeParticles(10)).toEqual(makeParticles(10))
  })

  it('각 파티클이 중심에서 벗어나 흩어진다(원점 아님)', () => {
    for (const p of makeParticles(14)) {
      expect(Math.hypot(p.x, p.y)).toBeGreaterThan(0)
      expect(p.size).toBeGreaterThan(0)
    }
  })

  it('count 0 / 음수는 빈 배열', () => {
    expect(makeParticles(0)).toEqual([])
    expect(makeParticles(-3)).toEqual([])
  })
})

describe('makeHitSparks — 위로 튀는 불티(결정적)', () => {
  it('요청한 개수만큼 생성한다', () => {
    expect(makeHitSparks(14)).toHaveLength(14)
    expect(makeHitSparks(6)).toHaveLength(6)
  })

  it('결정적이다(같은 count → 같은 좌표, Math.random 없음)', () => {
    expect(makeHitSparks(14)).toEqual(makeHitSparks(14))
  })

  it('각 불티는 중심에서 벗어나고(원점 아님) 양수 크기를 가진다', () => {
    for (const p of makeHitSparks(14)) {
      expect(Math.hypot(p.x, p.y)).toBeGreaterThan(0)
      expect(p.size).toBeGreaterThan(0)
    }
  })

  it('위쪽으로 튄다(평균 y < 0) — 방사형 버스트와 구분되는 부채꼴', () => {
    const sparks = makeHitSparks(14)
    const avgY = sparks.reduce((a, p) => a + p.y, 0) / sparks.length
    expect(avgY).toBeLessThan(0)
    // 모든 불티가 정점에서 위(또는 수평)에 있다 — 아래로 솟구치지 않는다.
    expect(sparks.every((p) => p.y <= 0)).toBe(true)
  })

  it('불티는 버스트 파티클보다 전반적으로 작다(작은 불티 느낌)', () => {
    // 극단-대-극단(max<=min)은 튜닝값이 우연히 맞닿은 경계라 미세 조정에 깨진다 — 중심 경향(평균)의
    // 관계만 단언해 "불티가 대체로 더 작다"는 의도를 여유 있게 표현한다(특정 px 는 박지 않는다).
    const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length
    const hitAvg = avg(makeHitSparks(14).map((p) => p.size))
    const burstAvg = avg(makeParticles(14).map((p) => p.size))
    expect(hitAvg).toBeLessThan(burstAvg)
  })

  it('count 0 / 음수는 빈 배열', () => {
    expect(makeHitSparks(0)).toEqual([])
    expect(makeHitSparks(-2)).toEqual([])
  })
})
