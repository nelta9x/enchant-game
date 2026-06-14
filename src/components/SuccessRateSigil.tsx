import { useT } from '../i18n'
import { formatRate } from '../lib/format'
import { SigilRunes } from './Sigil'

// 검 우하단에 떠 있는 "강화 성공률 결계"(프레젠테이션 전용). 파괴보호장치(ProtectionWard)와 같은
// 마법진을 공유하고, 색도 일반 마법진과 동일하게 둔다 — 룬은 기본 마법진 색(ink-soft, 보호
// 결계의 평상시 룬과 동일). 성공률에 따른 신호등 색(초록/노랑/빨강)은 쓰지 않는다.
//   · 위치: 검 우하단 — 좌상단의 보호 결계(ProtectionWard)와 대각선으로 마주 본다.
//   · 가운데 % 도 보호 결계의 중심 충전 수치와 같은 ink-soft 로 둔다 — 룬·중심 텍스트가 한 색이라
//     두 결계의 색이 완전히 일치한다. 글자 크기는 rem(원 h-20 과 같은 단위)이라 반응형으로 원이 줄어도
//     함께 줄어 링 안에 들어찬다(px 고정이면 삐져나옴).
//   · 불투명도: 보호 결계의 차분한(비발동) 룬과 같은 무게로 맞춘다 — 평상시 0.45, 보호 결계가
//     발동 시 흰빛으로 점등(opacity-100)하는 건 별개. 그래서 풀 불투명이면 성공률 룬이 더 진해 보인다.
//   · 최종 단계(성공률 null): 한층 더 흐리게(0.30) 하고 가운데를 '—'로(강화 없음).
// 정보 표시 전용이라 상호작용하지 않는다(pointer-events-none) — 값은 aria-label 로 음성 전달.

export function SuccessRateSigil({
  successRate,
  hasSword,
}: {
  successRate: number | null
  hasSword: boolean
}) {
  const t = useT()
  if (!hasSword) return null

  // 최종 단계(성공률 null)는 강화가 없다 — 흐린 결계 + 가운데 '—'.
  const terminal = successRate === null
  const text = terminal ? '—' : formatRate(successRate as number)

  return (
    <div
      className={`pointer-events-none absolute right-0 bottom-0 lg:right-[-25%] lg:bottom-[-2%] ${terminal ? 'opacity-30' : 'opacity-45'}`}
      aria-label={`${t('stat.successRate')}: ${terminal ? t('sword.maxLevel') : text}`}
    >
      {/* 룬은 일반 마법진 색(ink-soft) — currentColor 로 그려지므로 여기 color 로 물들인다. */}
      <div
        className="relative h-20 w-20"
        style={{ color: 'var(--color-ink-soft)' }}
      >
        <SigilRunes />
        {/* 가운데 성공률 % — 보호 결계 중심 수치와 같은 ink-soft(룬과 한 색이라 두 결계 색이 일치).
            크기는 rem(원과 동일 단위)이라 원과 함께 스케일돼 반응형에서 글자가 마법진 링 밖으로
            삐져나오지 않는다(px 고정이면 작은 화면에서 넘친다). */}
        <span className="absolute inset-0 grid place-items-center text-[0.95rem] font-bold tabular-nums text-ink-soft">
          {text}
        </span>
      </div>
    </div>
  )
}
