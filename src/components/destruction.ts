import type { EnhanceFeedback } from './ResultToast'

// 파괴 연출의 "로직 경계" — 순수 함수만 둔다(프레젠테이션/모션 의존 없음).
// 강화 결과(이벤트)를 연출 대상으로 변환하는 결정만 담당하며, 실제 애니메이션은
// DestructionEffect 가 맡는다 → 로직과 연출의 완전 분리.
//
// 이 모듈은 motion/react 를 import 하지 않으므로 node 환경 테스트에서 단독으로 검증된다
// (EnhanceFeedback 은 type-only import 라 런타임 의존이 없다).

// 연출에 필요한 최소 정보(프레젠테이션이 해석한 스프라이트 URL + 재생 식별자).
// 검 단계→스프라이트 URL 해석은 뷰 경계(GameScreen)에서 수행한다.
export type DestructionEvent = { id: number; spriteUrl: string }

// 강화 결과로부터 "무엇을, 언제" 터뜨릴지 결정한다.
//  - 'destroyed' 일 때만 연출(방지·성공은 폭발 없음).
//  - 대상 단계는 fromLevel(터진 검)이다. 스토어는 파괴 즉시 검을 +0 으로 교체하므로
//    현재 장착 검(toLevel/새 검)이 아니라 파괴된 검을 잔상으로 그려야 한다.
//  - id 는 시도마다 바뀌므로 같은 결과가 연속돼도 연출이 재생된다.
export function destructionTargetOf(
  feedback: EnhanceFeedback | null,
): { id: number; level: number } | null {
  if (!feedback || feedback.result.outcome !== 'destroyed') return null
  return { id: feedback.id, level: feedback.result.fromLevel }
}
