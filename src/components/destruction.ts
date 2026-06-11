import type { EnhanceResult } from '../game/types'
import type { ShakeBurstEvent } from './ShakeBurstEffect'

// 파괴 연출의 "로직 경계" — 순수 함수만 둔다(프레젠테이션/모션 의존 없음).
// 강화 결과를 연출 대상으로 변환하는 결정만 담당하며, 실제 애니메이션은 DestructionEffect 가 맡는다.
// import type 은 컴파일 시 소거되어(verbatimModuleSyntax) motion/react 런타임 의존을 끌어오지
// 않으므로, 이 모듈은 여전히 node 환경 테스트에서 단독으로 검증된다.

// 파괴 연출 이벤트 = 공유 "떨림 후 분출" 이벤트(성공 버스트와 동일 형태 — 스프라이트 URL + 재생
// 식별자 + 파티클 수 + 떨림/임팩트 타이밍). 단계→스프라이트 URL·파티클 수 해석은 뷰 경계(GameScreen)
// 에서 수행하고, impactMs(망치 임팩트)·shakeMs(이번 강화의 무작위 떨림 길이)는 GameScreen 이
// 타임라인에서 도출해 넘긴다 — 필드를 복제 선언하지 않고 그 타입을 그대로 쓴다(어긋남 방지).
export type DestructionEvent = ShakeBurstEvent

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
