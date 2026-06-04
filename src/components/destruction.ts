import type { EnhanceResult } from '../game/types'

// 파괴 연출의 "로직 경계" — 순수 함수만 둔다(프레젠테이션/모션 의존 없음).
// 강화 결과를 연출 대상으로 변환하는 결정만 담당하며, 실제 애니메이션은 DestructionEffect 가 맡는다.
// 이 모듈은 motion/react 를 import 하지 않으므로 node 환경 테스트에서 단독으로 검증된다.

// 연출에 필요한 최소 정보(프레젠테이션이 해석한 스프라이트 URL + 재생 식별자 + 파티클 수).
// 단계→스프라이트 URL·파티클 수 해석은 뷰 경계(GameScreen)에서 수행한다.
export type DestructionEvent = {
  id: number
  spriteUrl: string
  particleCount: number
}

// 강화 결과로부터 "무엇을" 터뜨릴지 결정한다.
//  - 'destroyed' 일 때만 연출(방지·성공은 별도).
//  - 대상 단계는 fromLevel(터진 검)이다. 스토어는 파괴 즉시 검을 +0 으로 교체하므로
//    현재 장착 검(toLevel/새 검)이 아니라 파괴된 검을 잔상으로 그려야 한다.
export function destructionTargetOf(
  result: EnhanceResult | null,
): { level: number } | null {
  if (!result || result.outcome !== 'destroyed') return null
  return { level: result.fromLevel }
}
