import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useT } from '../i18n'
import type { TranslationKey } from '../i18n/locales/ko'
import {
  FLOAT_ANIM_SEC,
  FLOAT_DELAY_SEC,
  FLOATING_TEXT_MS,
  FT_WOBBLE_DEG,
  pickSpawn,
} from './floatingText'
import { useOneShot } from './useOneShot'

// 강화 결과 플로팅 텍스트(프레젠테이션 전용) — 강화 결과마다 검 중상단 가상 사각형 안의 임의 위치에서
// 짧은 문구("아이구! 손이 미끄러졌네." 등)가 흔들리며 팝업 → 상승(좌/우 드리프트)·페이드한다. 게임
// 로직과 분리되어 'floatingText' 이벤트(재생 id + i18n 키)에만 반응한다 — 무엇을/어디에/어떻게 띄울지는
// 순수 코어(floatingText.ts: pickFloatingText/pickSpawn)가 결정하고, 이 컴포넌트는 그 결과를 그린다.
//
// SwordStage 의 spriteOverlay 슬롯에 얹어 검 박스 위 전면에 그린다 — 그 슬롯은 떨림 레이어 밖 형제라
// (HammerStrike 와 동일) 텍스트가 검과 함께 흔들리지 않는다. 좌표 관례도 HammerStrike 와 같다:
// 박스 중심(0,0) 기준, x+ 오른쪽 · y- 위. delay 로 결과 분출("터진다") 박자에 맞춰 등장한다.
// spriteOverlay 는 ProtectionWard(좌상단 결계 서클)보다 먼저 렌더되어 그 형제 UI 가 위에
// 그려지므로, 컨테이너에 z-50 을 줘 텍스트를 최전면으로 끌어올린다(검 박스는 z-index 가 없어 stacking
// context 가 아니라 형제 비교에서 z-50 이 auto 를 이긴다 — pointer-events-none 이라 결계 클릭은 그대로 통과).
//
// 색은 토큰(--color-floating-text, 현재 흰색 — 추후 토큰만 바꿔 변경). 외곽선(text-shadow)은 두지
// 않는다(사용자 결정) — 필요해지면 style 에 textShadow 를 더해 양피지·폭발 위 대비를 높일 수 있다.

export type FloatingTextEvent = { id: number; textKey: TranslationKey }

export function FloatingTextEffect({
  event,
}: {
  event: FloatingTextEvent | null
}) {
  const active = useOneShot(event, FLOATING_TEXT_MS)

  return (
    <div
      className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center overflow-visible"
      aria-hidden
    >
      <AnimatePresence>
        {active && (
          <FloatingTextBurst key={active.id} textKey={active.textKey} />
        )}
      </AnimatePresence>
    </div>
  )
}

// 한 번의 떠오름. key=event.id 로 마운트되며, 마운트 시점에 등장 파라미터(시작점·드리프트·흔들림)를
// 1회 고정한다 — 인스턴스마다 위치·궤적·흔들림이 달라 매번 다르게 보인다(이후 새 결과가 와도 이
// 인스턴스 값은 고정 — 교체 중 튀지 않음). useMemo 가 아니라 lazy useState 로 잡는다(useMemo 는 성능
// 힌트라 재계산될 수 있어 안정성을 보장하지 않는다).
function FloatingTextBurst({ textKey }: { textKey: TranslationKey }) {
  const t = useT()
  const [spawn] = useState(() => pickSpawn())
  const tilt = spawn.wobble * FT_WOBBLE_DEG // 흔들림 시작 각도(부호=방향)

  return (
    <motion.span
      className="whitespace-nowrap text-2xl font-extrabold"
      style={{ color: 'var(--color-floating-text)' }}
      // 컨테이너(flex 중앙정렬)가 span 을 박스 중심에 두고, x/y 는 그 중심 기준 오프셋(spawn)으로만
      // 쓴다 — HammerStrike 의 motion.img 와 동일 관례. absolute left/top 을 쓰면 nowrap 텍스트의
      // 좌상단이 중심에 박혀 글자가 우·하로 어긋난다. 팝업(backOut+scale) → 상승하며 좌/우로 드리프트
      // (driftX) → 페이드. 회전(rotate)은 등장 직후 짧게 흔들다 일찍 수렴한다(flashead 의 텍스트 연출 참고).
      initial={{ x: spawn.x, y: spawn.y, scale: 0.5, opacity: 0, rotate: tilt }}
      animate={{
        x: [
          spawn.x,
          spawn.x + spawn.driftX * 0.5,
          spawn.x + spawn.driftX * 0.85,
          spawn.x + spawn.driftX,
        ],
        scale: [0.5, 1.12, 1, 1],
        opacity: [0, 1, 1, 0],
        y: [spawn.y, spawn.y - 6, spawn.y - 22, spawn.y - 44],
        rotate: [tilt, -tilt * 0.65, tilt * 0.4, -tilt * 0.2, 0],
      }}
      transition={{
        delay: FLOAT_DELAY_SEC,
        duration: FLOAT_ANIM_SEC,
        times: [0, 0.18, 0.7, 1], // ~체공 후 페이드(쾌감·인지)
        ease: ['backOut', 'easeOut', 'easeIn'],
        // 흔들림(회전)은 위치 곡선과 분리한다 — 등장 직후(앞 ~절반)에 빠르게 몇 번 흔들고 0 으로 수렴.
        rotate: {
          delay: FLOAT_DELAY_SEC,
          duration: FLOAT_ANIM_SEC,
          times: [0, 0.12, 0.24, 0.36, 0.5],
          ease: 'easeOut',
        },
      }}
      // 연출 중 새 결과로 교체되면 끊기지 않게 부드럽게 사라진다(다른 연출과 동일).
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
    >
      {t(textKey)}
    </motion.span>
  )
}
