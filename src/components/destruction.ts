import type { EnhanceResult } from '../game/types'

// 파괴 연출의 "로직 경계" — 순수 함수만 둔다(프레젠테이션/모션 의존 없음).
// 강화 결과를 연출 대상으로 변환하는 결정만 담당하며, 실제 애니메이션(잔상 디졸브)은 ShakeAfterimage 가 맡는다.

// 강화 결과로부터 "무엇을" 터뜨릴지 결정한다.
//  - 'destroyed' 일 때만 연출(방지·성공은 별도).
//  - 대상은 fromId(터진 검)다. 스토어는 파괴 즉시 검을 시작 검(+1)으로 교체하므로
//    현재 장착 검(toId/새 검)이 아니라 파괴된 검을 잔상으로 그려야 한다.
export function destructionTargetOf(
  result: EnhanceResult | null,
): { id: string } | null {
  if (!result || result.outcome !== 'destroyed') return null
  return { id: result.fromId }
}
