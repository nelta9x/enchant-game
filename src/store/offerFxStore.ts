import { create } from 'zustand'

// 거래 제안 "도착 연출" 트리거용 얇은 store.
// 도착 감지(CommissionBar)가 fire() 로 nonce 를 올리면 연출(OfferArrivalFx)이 1회 재생된다.
// 연출 본체는 토스트 + 글로우 펄스 합성(OfferArrivalFx) — 후보 비교가 끝나 하나로 확정됐다.
type OfferFxStore = {
  // 도착 1회를 표현하는 단조 증가 카운터. 바뀔 때마다 연출이 처음부터 재생된다(애니메이션 key 로 사용).
  nonce: number
  fire: () => void
}

export const useOfferFxStore = create<OfferFxStore>((set) => ({
  nonce: 0,
  fire: () => set((s) => ({ nonce: s.nonce + 1 })),
}))
