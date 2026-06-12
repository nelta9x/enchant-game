// 수상한 상인(도박) 판정 — 순수 코어. press-your-luck 미니게임의 상태 전이를 표현한다.
// enhancer 와 동일 규율: DataManager·시간 비의존이고 확률 rng 를 주입받아 결정적으로 동작한다.
// 여기는 "레벨 산수와 상태 전이"만 한다 — 그 레벨의 검을 조회(getSwordByLevel)하거나 currentSwordId 를
// 교체하는 것, 만료 타이머를 거는 것은 셸(gameStore/모달)이 한다.
//
// 모델: 시작 검(base)을 걸고 매 라운드 굴린다. 승리하면 누적 레벨이 winDelta 만큼 오르고(멈출지 더 갈지는
// 호출자가 결정), 패배하면 즉시 종료하고 base - loseDelta 로 추락한다 — 누적분이 아니라 base 기준이라
// "쌓을수록 잃을 게 커진다"(모델 A). maxRounds 또는 최고 검(상한)에 도달하면 더 못 굴리고 자동 확정된다.

// 도박 1회(전체 세션)의 튜닝 파라미터(언어 중립). 의뢰 데이터에서 freeze 되어 셸이 주입한다.
//  - successChance: 라운드별 승리 확률(0~1, 고정). 판정은 `rng() < successChance`.
//  - winDelta: 라운드 승리당 누적 레벨 상승폭(> 0).
//  - loseDelta: 패배 시 base 에서 내려가는 하락폭(> 0).
//  - maxRounds: 굴릴 수 있는 최대 라운드 수(> 0). 도달하면 자동 확정.
export type GambleParams = {
  successChance: number
  winDelta: number
  loseDelta: number
  maxRounds: number
}

// 검 레벨의 허용 범위 — 셸이 데이터에서 도출해 주입한다(순수 코어는 검 데이터 비의존).
//  - floorLevel: 하한(보통 시작 검 레벨). 패배가 이 아래로 내려가지 않도록 클램프.
//  - ceilLevel: 상한(보통 최고 검 레벨). 승리 누적이 이 위로 올라가지 않도록 클램프 + 도달 시 자동 확정.
export type GambleBounds = {
  floorLevel: number
  ceilLevel: number
}

// press-your-luck 진행 상태.
//  - rolling: 진행 중(다음 라운드를 굴리거나 멈출 수 있음).
//  - banked: 확정(멈춤·maxRounds·상한 도달·만료) — currentLevel 이 최종 결과.
//  - busted: 패배 종료 — currentLevel = base - loseDelta(클램프) 가 최종 결과.
export type PressStatus = 'rolling' | 'banked' | 'busted'

// 도박 세션 상태(언어 중립). 레벨로만 표현하고 검 id 해석은 셸이 한다.
//  - baseLevel: 시작 검 레벨(패배 시 이 값 기준으로 추락 — 모델 A 의 핵심).
//  - currentLevel: 현재 누적 레벨(rolling 중 잠정, banked/busted 시 최종).
//  - round: 완료한 승리 라운드 수(maxRounds 와 비교).
//  - status: 진행/확정/실패.
export type PressState = {
  baseLevel: number
  currentLevel: number
  round: number
  status: PressStatus
}

// 세션 시작 — base 검을 걸고 rolling 상태로(아직 한 번도 안 굴림: currentLevel = base, round 0).
export function startPress(baseLevel: number): PressState {
  return { baseLevel, currentLevel: baseLevel, round: 0, status: 'rolling' }
}

// 한 라운드 진행. rolling 이 아니면 무변화(멱등 가드 — 만료 타이머와 입력의 경합을 "먼저 끝낸 쪽이 이긴다"로
// 자동 해소한다). 시도당 정확히 rng() 1회(enhancer 와 동일 — 결정성).
//  - 패배: base - loseDelta 로 추락(누적분이 아니라 base 기준 — 모델 A). 하한 클램프. busted.
//  - 승리: 누적 + winDelta(상한 클램프). maxRounds 도달 또는 상한 도달이면 자동 확정(banked), 아니면 rolling.
export function pressRound(
  state: PressState,
  params: GambleParams,
  bounds: GambleBounds,
  rng: () => number,
): PressState {
  if (state.status !== 'rolling') return state
  const won = rng() < params.successChance
  if (!won) {
    return {
      ...state,
      currentLevel: Math.max(bounds.floorLevel, state.baseLevel - params.loseDelta),
      status: 'busted',
    }
  }
  const nextLevel = Math.min(
    bounds.ceilLevel,
    state.currentLevel + params.winDelta,
  )
  const nextRound = state.round + 1
  // 더 못 굴리는 조건: 라운드 소진 또는 상한(최고 검) 도달 — 후자가 없으면 최고 검 직전에서 "이득 0, 패배만"
  // 인 순수 손해 굴림이 제안된다(완결성 가드).
  const status: PressStatus =
    nextRound >= params.maxRounds || nextLevel >= bounds.ceilLevel
      ? 'banked'
      : 'rolling'
  return { ...state, currentLevel: nextLevel, round: nextRound, status }
}

// 멈춤(확정) — rolling 일 때만 현재 누적(currentLevel)으로 확정한다(멱등 가드). 만료 자동 확정도 이 전이를 쓴다.
export function pressBank(state: PressState): PressState {
  if (state.status !== 'rolling') return state
  return { ...state, status: 'banked' }
}
