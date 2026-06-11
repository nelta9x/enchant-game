import type { TranslationKey } from '../i18n/locales/ko'
import type { FloatingTextEntry } from '../data/types'
import { weightedIndex } from '../lib/weightedPick'

// 강화 결과 플로팅 텍스트의 순수 코어(뷰-로직 분리) — "어떤 문구를, 어디에" 띄울지 결정하는 결정적 로직.
// 데이터(floatingText.json → DataManager.getFloatingTexts)에서 받은 후보 목록에서 가중치로 한 줄을
// 고르고(pickFloatingText), 검 박스 중상단 가상 사각형 안의 임의 시작점·드리프트·흔들림을 뽑는다
// (pickSpawn). rng 를 주입받아 결정적으로 테스트한다(commissionQueue.generateOne·enhancer 와 동일
// 관례). 실제 렌더(모션·i18n 해석)는 FloatingTextEffect 가 맡는다.

// ── 타이밍 ──────────────────────────────────────────────────────────────────────
// 등장 지연(팝업 시점)은 매 강화의 "버스트 시점"(burstAt = 임팩트 + 무작위 떨림)에 맞춰야 하므로 코드
// 상수가 아니라 이벤트(FloatingTextEvent.delaySec)로 전달된다(타임라인 단일 출처). 여기선 "모양"인 애니메이션
// 길이(체공·상승·페이드)만 코드로 둔다. useOneShot 수명(floatingTextMs)은 delay + 애니메이션을 모두 덮어야
// 한다 — 수명이 짧으면 애니메이션 도중 이벤트가 만료돼 끊긴다. 그래서 (delay + anim)*1000 + 여유로 잡는다.
export const FLOAT_ANIM_SEC = 1.0 // 팝업 → 체공 → 상승·페이드 길이
export function floatingTextMs(delaySec: number): number {
  return Math.round((delaySec + FLOAT_ANIM_SEC) * 1000) + 60
}
// (이 모듈은 컴포넌트를 export 하지 않으므로 함수 export 도 react-refresh 규칙과 무관 — drops.ts 동일.)

// ── 위치·움직임(검 박스 중심 0,0 기준 중상단 가상 사각형) ───────────────────────
// x+ 오른쪽, y- 위(spriteOverlay 좌표 관례 = HammerStrike). 브라우저에서 눈으로 맞추는 px/도 값.
// 박스를 넓혀 시작 위치 임의성을 키우고, 상승 중 좌/우 드리프트와 등장 흔들림(회전)으로 궤적도 매번 다르게 한다.
export const FT_BOX = { cy: -44, halfW: 72, halfH: 30 } // x∈[-72,72], y∈[-74,-14]
export const FT_DRIFT_PX = 30 // 상승하며 좌/우로 흘러가는 최대 px(임의 방향) — 궤적 임의성
export const FT_WOBBLE_DEG = 12 // 등장 흔들림(회전) 진폭(도). 감쇠하며 0 으로 수렴

// 후보 중 weight 비례로 한 줄 선택(weightedIndex 공유 구현). 빈 배열/합≤0 → null(미표시, rng 소비 없음).
// 합이 1이 아니어도 정규화된다(total 로 스케일한 r 을 누적 구간에 떨어뜨림). rng 주입 → 결정적.
export function pickFloatingText(
  entries: readonly FloatingTextEntry[],
  rng: () => number = Math.random,
): TranslationKey | null {
  const total = entries.reduce((sum, e) => sum + e.weight, 0)
  if (entries.length === 0 || total <= 0) return null
  return entries[weightedIndex(entries, (e) => e.weight, rng)].text
}

// 한 번의 등장 파라미터 — 시작점(박스 내) + 상승 중 좌/우 드리프트 + 흔들림 방향. 마운트당 1회 뽑아
// 인스턴스마다 위치·궤적·흔들림이 다르게 한다. rng 4회 순서 소비(x, y, driftX, wobble) → 결정적 테스트.
export type FloatingTextSpawn = {
  x: number
  y: number
  driftX: number // 상승하며 좌/우로 흘러가는 양(부호=방향, 크기=세기)
  wobble: number // 흔들림(회전) 시작 방향 부호(±1)
}

export function pickSpawn(rng: () => number = Math.random): FloatingTextSpawn {
  const x = (rng() * 2 - 1) * FT_BOX.halfW
  const y = FT_BOX.cy + (rng() * 2 - 1) * FT_BOX.halfH
  const driftX = (rng() * 2 - 1) * FT_DRIFT_PX // 임의 방향·크기(좌/우)
  const wobble = rng() < 0.5 ? -1 : 1
  return { x, y, driftX, wobble }
}
