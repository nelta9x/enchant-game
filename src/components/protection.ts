// 파괴보호장치 "보호 결계"의 순수 코어 — (필요 수량, 보유 수량, 발동 의사) → 결계 상태 한 덩어리.
// 모션/DOM 의존이 없어 결정적 단위 테스트가 가능하다(coins.ts·goldGain.ts 와 같은 뷰-로직 분리 원칙).
// 결계의 시각화(ProtectionWard)와 강화 게이트(GameScreen)가 흩어진 if 가 아니라 이 한 곳에서
// 같은 상태를 끌어쓴다 — "필요 갯수가 드러나고, 발동/비발동이 잘 드러난다"의 단일 출처.

// 결계가 표현해야 할 네 가지 상태(요청 핵심: 상태 legibility).
//   unavailable  — 이 단계는 파괴보호장치를 쓸 수 없다(데이터상 'disabled' 또는 0).
//   insufficient — 쓸 수 있으나 보유가 필요 수량에 못 미친다(정적 표시 — 파괴보호장치는 거래 제안으로 얻는다).
//   ready        — 충분히 보유했지만 아직 발동(armed)하지 않음(클릭하면 켜짐).
//   armed        — 충분히 보유 + 발동 → 실제 강화 실패를 막는다.
export type ProtectionState =
  | { kind: 'unavailable' }
  | { kind: 'insufficient'; required: number; owned: number; shortfall: number }
  | { kind: 'ready'; required: number; owned: number }
  | { kind: 'armed'; required: number; owned: number }

// (필요 수량, 보유 수량, 발동 의사) → 결계 상태. required 는 SwordData.protectionTickets 와
// 같은 도메인('disabled' | 정수). 'disabled'/0 이면 발동 의사와 무관하게 unavailable 이고,
// 보유가 모자라면 armed 의사가 있어도 insufficient 다(못 쓰는 걸 켜진 것처럼 보이지 않게).
export function protectionState(
  required: number | 'disabled',
  owned: number,
  armed: boolean,
): ProtectionState {
  if (required === 'disabled' || required <= 0) return { kind: 'unavailable' }
  if (owned < required)
    return { kind: 'insufficient', required, owned, shortfall: required - owned }
  return armed
    ? { kind: 'armed', required, owned }
    : { kind: 'ready', required, owned }
}

// 결계가 실제로 강화에 적용되는가(= armed). enhance() 게이트(effectiveProtection)가 쓰는 단일 기준.
export function isProtectionActive(state: ProtectionState): boolean {
  return state.kind === 'armed'
}
