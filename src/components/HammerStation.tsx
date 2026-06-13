import { itemSpriteUrl } from '../lib/sprites'
import { SigilRunes } from './Sigil'

// 검 우상단에 상시 떠 있는 "망치 거치대"(프레젠테이션 전용). 보호 결계(좌상단)·성공률 결계(우하단)와
// 같은 마법진(SigilRunes)을 공유해 검을 둘러싼 의식 코너 3종을 완성한다 — 룬 색도 일반 마법진
// 색(ink-soft)으로 맞춰 세 코너가 한 덩어리로 보인다. 크기·오프셋은 세 코너 동일(h-20, -25%/-2%).
//
// 강화에 쓰는 도구(호라드릭 망치)를 늘 보여 주는 자리 — 향후 "망치 업그레이드" 기능의 시각 앵커다.
// 그래서 룬은 차분하게(opacity) 두되 망치 본체는 풀 불투명·drop-shadow 로 또렷이 띄운다(검 본체의
// 강조 스프라이트와 같은 무게). 지금은 표시 전용(상호작용 없음)이라 마법진들과 같이 aria-hidden —
// 업그레이드 기능이 붙을 때 클릭 어포던스 + aria-label(i18n 키)을 함께 추가한다.

const HAMMER_SPRITE = itemSpriteUrl('horadric_hammer.png')

export function HammerStation() {
  return (
    // 위치: 검 우상단 — 좌상단 보호 결계(ProtectionWard)와 좌우 대칭(같은 -25%/-2% 오프셋, 좌→우 반전).
    // 검 박스가 overflow-visible 라 박스 밖으로 살짝 나가도 잘리지 않는다(다른 코너 결계와 동일).
    <div
      className="pointer-events-none absolute"
      style={{ right: '-25%', top: '-2%' }}
      aria-hidden
    >
      {/* 룬은 일반 마법진 색(ink-soft) — currentColor 로 그려지므로 여기 color 로 물들인다.
          크기·오프셋은 다른 두 코너 결계(h-20, -25%/-2%)와 동일하게 맞춘다 — 키울 때 안쪽 모서리를
          검에서 떨어뜨린 채 두려고 오프셋을 바깥(코너)으로 민다(검 캔버스를 건드리지 않게 통일). */}
      <div
        className="relative h-20 w-20"
        style={{ color: 'var(--color-ink-soft)' }}
      >
        {/* 마법진(룬) — 다른 두 코너 결계(ProtectionWard·SuccessRateSigil)와 같은 색(ink-soft)·같은
            투명도(opacity-45)로 맞춘다. 세 코너 서클이 한 무게로 읽혀야 통일된다(이 값이 어긋나면 망치
            서클만 더 밝아 색이 다르게 보인다). */}
        <div className="absolute inset-0 opacity-45">
          <SigilRunes />
        </div>
        {/* 가운데 정지 망치 — 강화 도구. 풀컬러 스프라이트 그대로(검 강조 스프라이트와 같은 무게로 또렷이).
            링(h-16)보다 살짝 크게 채워(h-10) 가독성 확보, object-contain 으로 비율 보존. */}
        <span className="absolute inset-0 grid place-items-center">
          <img
            src={HAMMER_SPRITE}
            alt=""
            draggable={false}
            className="h-12 w-12 object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.35)]"
            style={{ imageRendering: 'pixelated' }}
          />
        </span>
      </div>
    </div>
  )
}
