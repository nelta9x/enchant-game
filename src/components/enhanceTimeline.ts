import type { AnimationConfig, ShakeBand } from '../data/types'
import { PARTICLE_DUR } from './particles'

// 강화 1회 연출의 "타임라인" 단일 출처(순수). 데이터(animation.json → AnimationConfig)의 시퀀스 타이밍 +
// 매 강화마다 무작위로 뽑은 떨림 시간(shakeMs)으로, GameScreen 이 효과·사운드·공개·잠금을 거는 데 필요한
// 마일스톤·수명을 한 번에 도출한다.
//
// 왜 한 곳에 모으나(중요): 강화 흐름은 여러 효과 enqueue 지점·reveal 타이머·잠금이 각자 "impact + 떨림"
// 또는 "그 + 가드"를 계산해 쓴다. 이 계산이 한 곳에서 어긋나면 그게 곧 "강화 전/후 검이 동시에 보이는"
// 버그(crossover 불일치)다. 그래서 매 강화마다 shakeMs 를 1회 뽑아 이 함수를 1회 부르고, 결과 슬라이스를
// 모든 소비처(payload·props·durationMs·공개 타이머)에 흘려보낸다 — 불일치 클래스를 원천 차단.
//
// 경계: 여기 담는 건 GameScreen 이 거는 시퀀스 마일스톤·효과 durationMs 뿐이다. 각 연출 컴포넌트가
// 스스로 소유하는 내부 수명(예: 플로팅 텍스트의 useOneShot 수명 = floatingText.floatingTextMs)은 그 효과가
// burstAt(여기서 흘려 준 delaySec)에서 자기 책임으로 도출한다 — 타임라인은 그것까지 떠안지 않는다.
//
// 타임라인(t=0 = 강화 클릭):
//   t=0           망치 윈드업 시작 + 로직 즉시 계산(결과는 reveal 까지 가림)
//   t=impactMs    망치가 검에 닿음 → '캉' 타격음 + Hit 불꽃(1회) + 무기 떨림 시작(shakeMs)
//   t=burstAtMs   떨림 끝 → 성공/실패 파티클 버스트 + 결과 공개(이름·스프라이트·가격)
//   t=lockMs      재강화 허용(UI 가드만)
// impact 까지(윈드업)는 고정이라 매회 동일하고, 그 뒤(떨림→버스트→공개→가드)만 shakeMs 에 따라 매회 달라진다.

// 연출 수명에 더하는 여유(ms) — 애니메이션이 끝나기 직전 효과가 사라져 끊기지 않도록(기존 +60 관례 계승).
const TAIL_BUFFER_MS = 60

export type EnhanceTimeline = {
  // ── 마일스톤(반드시 서로 일치해야 하는 값들) ──
  impactMs: number // 망치 임팩트 = 떨림 시작 = Hit 불꽃 = '캉' 타격음
  shakeMs: number // 이번 강화의 무기 떨림 길이(무작위)
  burstAtMs: number // = impact + shake. 떨림 끝 = 성공/실패 버스트 = 결과 공개의 공통 앵커(crossover)
  revealAtMs: number // 결과(이름·스프라이트·가격) 공개 시점 — burstAt 과 같아야 한다
  suppressMs: number // 새 스프라이트 등장 억제 길이 — [0, burstAt] 동안 숨겨 강화 전/후 검 동시 노출 방지
  lockMs: number // 재강화 입력 잠금 길이(UI 가드) = burstAt + reEnhanceGuard
  // ── 효과 수명(연출이 끝나기 전에 사라지지 않도록 ≥ 애니메이션 길이) ──
  burstLifetimeMs: number // 성공/파괴 버스트 효과 durationMs + useOneShot 백스톱
  protectedDurationMs: number // 방지(떨림만) 효과 durationMs — 떨림이 끝날 때까지
}

// 떨림 시간 범위(ms) — 강화 대상 검의 레벨로 고른 밴드의 [min, max]. rollShakeMs 가 이 범위에서 뽑는다.
export type ShakeRange = { minMs: number; maxMs: number }

// 검 레벨에 해당하는 떨림 밴드 범위를 고른다. 밴드는 레벨 [1, ∞) 를 덮는 연속 구간(로더가 강제)이라,
// "레벨 이상인 첫 밴드"(maxLevel === null 이면 ∞)가 곧 담당 밴드다. 어떤 양수 레벨이든 마지막 밴드(=∞)에는
// 반드시 걸리므로 find 가 비지 않지만, 방어적으로 마지막 밴드로 폴백한다.
export function shakeRangeForLevel(
  bands: ShakeBand[],
  level: number,
): ShakeRange {
  const band =
    bands.find((b) => b.maxLevel === null || level <= b.maxLevel) ??
    bands[bands.length - 1]
  return { minMs: band.minMs, maxMs: band.maxMs }
}

// 이번 강화의 떨림 시간(ms)을 [min, max] 구간에서 무작위로 뽑는다(정수, 양끝 포함). rng 주입 → 결정적 테스트.
// min==max 면 항상 그 값(고정 떨림). 범위는 호출부가 검 레벨로 미리 고른 밴드(shakeRangeForLevel)에서 온다.
export function rollShakeMs(
  range: ShakeRange,
  rng: () => number = Math.random,
): number {
  const { minMs: min, maxMs: max } = range
  return min + Math.floor(rng() * (max - min + 1))
}

// 데이터 타이밍 + 이번 강화의 떨림 시간 → 연출 타임라인. 순수(시간/모션/React 무관) — 테스트가 결정적이다.
export function computeEnhanceTimeline(
  anim: AnimationConfig,
  shakeMs: number,
): EnhanceTimeline {
  const impactMs = anim.hammerImpactMs
  const burstAtMs = impactMs + shakeMs
  return {
    impactMs,
    shakeMs,
    burstAtMs,
    revealAtMs: burstAtMs,
    suppressMs: burstAtMs,
    lockMs: burstAtMs + anim.reEnhanceGuardMs,
    burstLifetimeMs:
      burstAtMs + Math.round(PARTICLE_DUR * 1000) + TAIL_BUFFER_MS,
    protectedDurationMs: burstAtMs + TAIL_BUFFER_MS,
  }
}
