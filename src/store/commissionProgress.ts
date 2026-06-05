// 의뢰 레벨/경험치 progression 의 "순수 전이 코어" — DataManager/타이머/React 의존이 없다.
// 완료(경험치 +)·만료(경험치 -)에 따른 레벨업/레벨다운 수학만 순수 함수로 표현해 결정적으로 테스트한다.
// 레벨 정의(levels)는 인자로 주입받는다(데이터는 DataManager, 적용은 gameStore 액션).
//
// 모델: level 은 1부터(levels[level-1] 이 그 레벨 정의), xp 는 "현재 레벨 내 누적"(0 .. xpToNext).
//  - 레벨업: xp 가 그 레벨의 xpToNext 이상이면 차감하고 level++ (보상이 커서 한 번에 여러 레벨 가능 → while).
//  - 레벨다운: xp 가 음수면 한 레벨 내려가 이전 레벨의 xpToNext 를 더한다(연쇄 가능 → while).
//  - 바닥: 레벨 1 아래로는 내려가지 않고 xp 는 0 으로 클램프(초반 플레이어가 음수에 빠지지 않게).
//  - 천장: 최고 레벨에서는 xp 가 그 레벨의 xpToNext 를 넘지 못하게 cap(더 오를 곳이 없으므로 누적 무효).

import type { CommissionLevel } from '../data/types'

export type CommissionProgress = { level: number; xp: number }

// 경험치 증감(delta)을 적용해 새 {level, xp} 를 반환한다. 완료는 +xpReward, 만료는 -xpPenalty 로 호출한다.
// levels 가 비어있으면(이론상 불가 — 로더가 막음) 입력을 그대로 돌려준다(방어).
export function applyXpDelta(
  level: number,
  xp: number,
  delta: number,
  levels: readonly CommissionLevel[],
): CommissionProgress {
  if (levels.length === 0) return { level, xp }

  // 레벨은 항상 [1, levels.length] 안에 둔다(방어적 클램프).
  let lv = Math.min(Math.max(level, 1), levels.length)
  let x = xp + delta

  // 레벨업(연쇄): 현재 레벨 xpToNext 이상이고 더 오를 레벨이 있으면 올린다.
  while (lv < levels.length && x >= levels[lv - 1].xpToNext) {
    x -= levels[lv - 1].xpToNext
    lv += 1
  }

  // 레벨다운(연쇄): xp 가 음수면 한 레벨 내려가 이전 레벨의 xpToNext 를 더한다.
  while (x < 0 && lv > 1) {
    lv -= 1
    x += levels[lv - 1].xpToNext
  }

  // 바닥(레벨 1): 더 내려갈 곳이 없으면 xp 를 0 으로 클램프.
  if (x < 0) x = 0
  // 천장(최고 레벨): 더 오를 곳이 없으면 xpToNext 로 cap(진행 바가 가득 찬 상태로 멈춘다).
  if (lv === levels.length && x > levels[lv - 1].xpToNext) x = levels[lv - 1].xpToNext

  return { level: lv, xp: x }
}

// 해당 의뢰 레벨에서 출제될 수 있는 검 단계 목록. level 이 범위 밖이면 최저/최고로 클램프(방어).
export function swordLevelsFor(
  level: number,
  levels: readonly CommissionLevel[],
): number[] {
  if (levels.length === 0) return []
  const lv = Math.min(Math.max(level, 1), levels.length)
  return levels[lv - 1].swordLevels
}
