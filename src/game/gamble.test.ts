import { describe, it, expect } from 'vitest'
import { startPress, pressRound, pressBank } from './gamble'

// 합성 픽스처 — 데이터(밸런스) 비의존. 방향·클램프·전이만 검증하고 구체적 delta 값은 단언하지 않는다
// (winDelta/loseDelta/maxRounds 는 디자이너 튜닝값 — PARAMS 를 통해서만 참조한다). 확률은 고정 rng 로 판정.
const PARAMS = { successChance: 0.5, winDelta: 1, loseDelta: 3, maxRounds: 3 }
const BOUNDS = { floorLevel: 1, ceilLevel: 30 }

// rng < successChance 면 승리. 경계가 확실하도록 0/0.99 를 쓴다.
const WIN = () => 0
const LOSE = () => 0.99

describe('press-your-luck 도박 — 상태 전이', () => {
  it('startPress: base 에서 rolling 으로 시작(아직 안 굴림)', () => {
    expect(startPress(15)).toEqual({
      baseLevel: 15,
      currentLevel: 15,
      round: 0,
      status: 'rolling',
    })
  })

  it('승리: 누적 레벨이 winDelta 만큼 오르고 계속 진행(rolling)', () => {
    const s = pressRound(startPress(15), PARAMS, BOUNDS, WIN)
    expect(s.currentLevel).toBe(15 + PARAMS.winDelta)
    expect(s.round).toBe(1)
    expect(s.status).toBe('rolling') // maxRounds 미도달
  })

  it('패배: base - loseDelta 로 추락하고 종료(busted)', () => {
    const s = pressRound(startPress(15), PARAMS, BOUNDS, LOSE)
    expect(s.status).toBe('busted')
    expect(s.currentLevel).toBe(15 - PARAMS.loseDelta)
  })

  it('모델 A — 승리 후 패배는 누적이 아니라 base 기준으로 추락한다', () => {
    // 핵심: 1라운드 승(→base+winDelta) 뒤 패배. base 기준(base-loseDelta)이어야 모델 A,
    // 누적 기준(currentLevel-loseDelta)이면 모델 B. round-0 패배는 둘을 구분 못하므로 이 순서가 버그를 잡는다.
    let s = pressRound(startPress(15), PARAMS, BOUNDS, WIN) // → 16, rolling
    expect(s.currentLevel).toBe(16)
    s = pressRound(s, PARAMS, BOUNDS, LOSE) // 패배
    expect(s.status).toBe('busted')
    expect(s.currentLevel).toBe(15 - PARAMS.loseDelta) // base(15) 기준 — NOT 16 기준
  })

  it('멈추면(bank) 현재 누적으로 확정된다', () => {
    let s = pressRound(startPress(15), PARAMS, BOUNDS, WIN) // → 16, rolling
    s = pressBank(s)
    expect(s.status).toBe('banked')
    expect(s.currentLevel).toBe(16)
  })

  it('maxRounds 까지 연승하면 자동 확정된다(banked)', () => {
    let s = startPress(15)
    for (let i = 0; i < PARAMS.maxRounds; i += 1)
      s = pressRound(s, PARAMS, BOUNDS, WIN)
    expect(s.round).toBe(PARAMS.maxRounds)
    expect(s.status).toBe('banked')
    expect(s.currentLevel).toBe(15 + PARAMS.maxRounds * PARAMS.winDelta)
  })

  it('상한(ceil) 도달 시 라운드가 남아도 자동 확정된다(순수 손해 굴림 방지)', () => {
    // ceil 직전에서 1승 → 상한 도달 → 라운드(1 < maxRounds)가 남아도 banked.
    const s = pressRound(startPress(BOUNDS.ceilLevel - 1), PARAMS, BOUNDS, WIN)
    expect(s.currentLevel).toBe(BOUNDS.ceilLevel)
    expect(s.status).toBe('banked')
  })

  it('패배가 하한(floor) 아래로 내려가지 않는다(클램프)', () => {
    // base 가 floor 근처라 base-loseDelta 가 음수가 돼도 floor 에서 멈춘다.
    const s = pressRound(startPress(BOUNDS.floorLevel + 1), PARAMS, BOUNDS, LOSE)
    expect(s.status).toBe('busted')
    expect(s.currentLevel).toBe(BOUNDS.floorLevel)
  })

  it('확정/실패 후의 굴림·멈춤은 무변화다(멱등 가드 — 만료·입력 경합 해소)', () => {
    const busted = pressRound(startPress(15), PARAMS, BOUNDS, LOSE)
    expect(busted.status).toBe('busted')
    expect(pressRound(busted, PARAMS, BOUNDS, WIN)).toEqual(busted) // no-op
    expect(pressBank(busted)).toEqual(busted) // no-op

    const banked = pressBank(startPress(15))
    expect(pressRound(banked, PARAMS, BOUNDS, WIN)).toEqual(banked) // no-op
    expect(pressBank(banked)).toEqual(banked) // no-op
  })
})
