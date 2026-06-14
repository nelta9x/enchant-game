// 햅틱(진동) 피드백 — 강화 결과를 손끝으로도 전한다(성공=짧게, 파괴=묵직하게). 시각 연출과 별개의
// 부가 채널이라 미지원 단말에서는 조용히 무시한다.
//
//  - navigator.vibrate 는 주로 안드로이드 Chrome 에서만 동작한다(iOS Safari·데스크탑은 미지원) — 기능
//    감지로 게이트해 미지원이면 no-op. 없어도 게임 동작·연출은 동일하다(연출용 보조 피드백).
//  - 비-브라우저(SSR/테스트, navigator 미정의)에서도 안전하게 아무 일도 하지 않는다.
//  - delayMs 로 재생을 늦춰 시각 연출(버스트=결과 공개)과 박자를 맞춘다(sound.playSfx 의 delayMs 관례 미러).

// 진동 패턴: 단일 지속(ms) 또는 [진동, 정지, 진동, ...] 배열(navigator.vibrate 규약).
export type VibratePattern = number | number[]

// 강화 성공 — 짧고 경쾌한 한 번(보상감).
export const HAPTIC_SUCCESS: VibratePattern = 18
// 강화 파괴 — 길고 묵직한 이중 진동(상실감).
export const HAPTIC_DESTROY: VibratePattern = [0, 60, 50, 130]

export function vibrate(pattern: VibratePattern, delayMs = 0): void {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return
  const fire = () => {
    try {
      navigator.vibrate(pattern)
    } catch {
      /* 일부 단말은 사용자 제스처 밖 호출을 거부한다 — 연출용이라 조용히 무시 */
    }
  }
  if (delayMs > 0) setTimeout(fire, delayMs)
  else fire()
}
