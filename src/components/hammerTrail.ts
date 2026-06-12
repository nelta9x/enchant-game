// 망치 스윙 "스프라이트 모션 블러"(흰 스미어)의 순수 코어 — 물감을 찍고 쭉 끌듯, 본체 망치의 프레임
// 포즈를 받아 궤적 위에 촘촘한 스탬프(실루엣 자국)를 한 줄로 깔아 하나의 스미어를 만든다. 자국의
// 알파는 "나이"가 정한다: 머리(최신 자국·망치 현재 위치)가 가장 진하고, 꼬리(오래된 자국)로 갈수록
// 옅어져 움직임의 방향이 읽힌다. 임팩트 후 본체가 멈추면 새 자국이 안 생기고 남은 자국이 수명을 다해
// 꼬리부터 망치 쪽으로 빨려들며 사라진다 — 별도 페이드 코드 없는 나이 기반 알파의 자연 귀결.
//
// 시간·DOM·RNG 를 모르는 결정적 모듈: 호출자가 타임스탬프(tMs)·포즈를 주입한다(고정 픽스처로 테스트).
// 그리기(캔버스·실루엣·합성)는 hammerSmear.ts(HammerSmearSystem)가, 포즈 공급은 HammerStrike(본체
// motion.img 의 onUpdate — 실제 그려진 값 그대로)가 맡아 본체와 스미어가 구조적으로 어긋나지 않는다.

// 본체 motion.img 가 매 프레임 그리는 변환 그대로 — 검 박스 중심(0,0) 기준 px, x+ 오른쪽 · y- 위.
export type TrailPose = { x: number; y: number; rotate: number; scale: number }

// 캔버스가 한 프레임에 그릴 자국 하나 — 포즈 + 나이로 정해진 알파.
export type TrailStamp = { pose: TrailPose; alpha: number }

// ── 튜닝 상수(브라우저에서 눈으로 맞추는 값) ─────────────────────────────────────
// 자국 수명(ms) — 곧 스미어 꼬리의 시간 길이. 스냅(hammerSnapMs≈60ms)보다 길어야 임팩트 순간
// 스냅 전체가 한 줄 스미어로 남고, 임팩트 후 이 시간 안에 꼬리가 망치 쪽으로 수축하며 사라진다.
export const TRAIL_WINDOW_MS = 80
// 머리(나이 0) 자국의 최대 알파 — 본체(1.0) 대비. 꼬리는 나이 곡선(stampAlpha)으로 0 까지 떨어진다.
export const TRAIL_PEAK_ALPHA = 0.5
// 인접 자국 사이 최대 간격(px, poseDistance 기준) — 프레임 사이를 이 간격으로 보간해 점선이 아닌
// 연속된 물감 자국을 만든다. 작을수록 매끈하고 스탬프 수가 는다(스냅 한 번에 대략 궤적길이/간격 개).
export const STAMP_SPACING_PX = 7
// 자국을 남기는 최소 속도(px/ms) — 윈드업(≈0.1px/ms)·정지·페이드아웃에선 펜만 따라가고 물감은 안
// 묻는다. 스냅은 easeIn 가속이라 첫 프레임(≈1.4px/ms)부터 걸려 빠른 구간에서만 스미어가 생긴다.
export const SPEED_GATE_PX_PER_MS = 0.7
// 회전을 거리로 환산하는 반경(px) — 머리가 스프라이트 중심에서 이만큼 떨어져 호를 그린다고 보고
// |Δrotate|·반경을 이동 거리에 더한다(제자리 회전도 머리는 크게 쓸므로 자국·게이트에 반영).
export const HEAD_RADIUS_PX = 48
// 스미어 캔버스에 입히는 CSS blur(px) — 자국 경계를 녹여 한 덩어리 물감처럼. 머리의 또렷함은
// 어차피 위에 덮이는 본체(컬러 망치)가 담당한다.
export const TRAIL_BLUR_PX = 2

// 포즈 사이 "겉보기 이동 거리"(px) — 중심 이동 + 회전이 쓸어내는 머리 호 길이. 보간 간격·속도 게이트
// 공용 메트릭. scale 변화는 미세(0.9→1.08)해 무시한다.
export function poseDistance(a: TrailPose, b: TrailPose): number {
  return (
    Math.hypot(b.x - a.x, b.y - a.y) +
    Math.abs(b.rotate - a.rotate) * (Math.PI / 180) * HEAD_RADIUS_PX
  )
}

// 자국 나이(ms) → 알파. 최신(나이 0)=peak, 수명 끝=0 의 단조 감소 — 제곱 곡선이라 꼬리 끝이 빠르게
// 옅어져 머리 쪽 밀도가 도드라진다(움직임 방향 강조).
export function stampAlpha(ageMs: number): number {
  const u = Math.min(1, Math.max(0, 1 - ageMs / TRAIL_WINDOW_MS))
  return TRAIL_PEAK_ALPHA * u * u
}

function lerpPose(a: TrailPose, b: TrailPose, f: number): TrailPose {
  return {
    x: a.x + (b.x - a.x) * f,
    y: a.y + (b.y - a.y) * f,
    rotate: a.rotate + (b.rotate - a.rotate) * f,
    scale: a.scale + (b.scale - a.scale) * f,
  }
}

type Sample = { tMs: number; pose: TrailPose }

// 포즈 히스토리 = "펜과 물감". push 는 펜을 새 포즈로 옮기고, 직전 펜에서의 평균 속도가 게이트를
// 넘을 때만 그 사이를 STAMP_SPACING_PX 간격으로 보간해 자국을 깐다(느린 구간은 펜만 이동 — 물감을
// 든 채 따라간다). stamps()/isAlive() 가 수명 지난 자국을 솎아내므로 호출 측 별도 청소가 없다.
export class TrailHistory {
  private samples: Sample[] = [] // 시간 오름차순(push 가 역행 입력을 버려 불변 유지)
  private pen: Sample | null = null

  // 새 강화의 하드 컷 — 이전 스윙의 자국·펜을 모두 버린다(다음 push 가 이전 위치와 잇지 않는다).
  reset(): void {
    this.samples = []
    this.pen = null
  }

  push(tMs: number, pose: TrailPose): void {
    const prev = this.pen
    this.pen = { tMs, pose }
    if (!prev || tMs <= prev.tMs) return
    const d = poseDistance(prev.pose, pose)
    if (d / (tMs - prev.tMs) < SPEED_GATE_PX_PER_MS) return
    // 직전 펜(제외)→현재(포함)를 등간격 보간 — 타임스탬프도 함께 보간해 한 구간 안에서도 알파가 기운다.
    const n = Math.max(1, Math.ceil(d / STAMP_SPACING_PX))
    for (let i = 1; i <= n; i++) {
      const f = i / n
      this.samples.push({
        tMs: prev.tMs + (tMs - prev.tMs) * f,
        pose: lerpPose(prev.pose, pose, f),
      })
    }
  }

  // 지금 그려야 할 자국들 — 오래된 것→최신 순(알파 오름차순). 소비자(캔버스)는 최신부터 역순으로
  // destination-over 합성해 겹친 픽셀에 최신 자국의 알파만 남긴다(겹침 누적으로 타는 핫스팟 방지).
  stamps(nowMs: number): TrailStamp[] {
    this.prune(nowMs)
    return this.samples.map((s) => ({
      pose: s.pose,
      alpha: stampAlpha(nowMs - s.tMs),
    }))
  }

  // 살아 있는 자국이 남았는가 — 캔버스 rAF 루프의 종료 조건(false 면 그릴 게 없어 루프를 멈춘다).
  isAlive(nowMs: number): boolean {
    this.prune(nowMs)
    return this.samples.length > 0
  }

  private prune(nowMs: number): void {
    const cut = nowMs - TRAIL_WINDOW_MS
    let i = 0
    while (i < this.samples.length && this.samples[i].tMs <= cut) i++
    if (i > 0) this.samples.splice(0, i)
  }
}
