import { useEffect } from 'react'
import { motion, useAnimationControls } from 'motion/react'
import { useT } from '../i18n'
import { PROTECTION_TICKET_ID } from '../lib/items'
import { type ProtectionState } from './protection'
import { ItemIcon } from './ItemIcon'
import { SigilRunes } from './Sigil'

// 검 좌상단에 떠 있는 "보호 결계 서클"(프레젠테이션 전용). 파괴보호장치를 추상 뱃지가 아니라
// 마법진처럼 표현한다 — 이 서클에서 흘러나온 마력이 검을 감싸 파괴를 막는다는 연출.
//   · 발동(armed): 룬이 흰빛으로 점등하고, SwordStage 의 흰색 글로우가 검을 감싼다
//     (무기만 보고 있어도 "보호 중"임이 읽힌다).
//   · 비발동/부족/보호불가: 서클이 disable 처럼 흐려지고, 가운데 파괴보호장치 아이템 +
//     아래 충전 수치(예: 0/6 — 6 필요한데 0 보유)로 "무엇이 얼마나 필요한지"를 드러낸다.
// 서클을 누르면 발동을 토글하고(충분할 때), 부족하면 상점으로 보낸다.

export type ProtectionWardProps = {
  state: ProtectionState
  // 발동 토글(ready·armed). 충분히 보유한 상태에서 결계를 켜고 끈다.
  onToggle: () => void
  // 상점 열기(insufficient) — 부족분을 채우러.
  onShop: () => void
  // 파괴보호장치로 살아남은 순간(protected) 결계가 폭발을 튕겨내는 흰빛 플레어 트리거(0 무시).
  blockKey: number
  // 플레어 시작 지연(초) — 막아냄은 망치가 닿는 순간(impact) 일어나므로 그만큼 늦춰 떨림과 박자를 맞춘다.
  flareDelaySec?: number
}

export function ProtectionWard({
  state,
  onToggle,
  onShop,
  blockKey,
  flareDelaySec = 0,
}: ProtectionWardProps) {
  const t = useT()

  // 실드-블록 플레어 — blockKey 가 바뀔 때마다 흰빛 결계 링이 한 번 확 퍼졌다 사라진다(망치 임팩트에 맞춰).
  const flare = useAnimationControls()
  useEffect(() => {
    if (blockKey > 0) {
      flare.start({
        scale: [0.55, 1.5],
        opacity: [0.85, 0],
        transition: { delay: flareDelaySec, duration: 0.5, ease: 'easeOut' },
      })
    }
    // flareDelaySec 은 트리거(blockKey)가 바뀔 때의 최신값을 쓰면 충분하다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockKey, flare])

  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible">
      {/* 흰빛 실드-블록 플레어(파괴보호장치 발동 순간) — 검 중심에서 흰 링이 퍼진다. */}
      <motion.div
        aria-hidden
        className="absolute inset-4 rounded-full border-2 border-white"
        style={{ opacity: 0 }}
        animate={flare}
      />

      {/* 보호 결계 서클 — 검 좌상단(마력의 근원). 검 캔버스와 닿지 않게 바깥(코너)으로 띄운다.
          크기·오프셋은 코너 3종 동일(h-20, -25%/-2%) — 키울 때 안쪽 모서리를 고정하려 오프셋을 바깥으로 민다. */}
      <div className="absolute" style={{ left: '-25%', top: '-2%' }}>
        <ProtectionSigil
          state={state}
          onToggle={onToggle}
          onShop={onShop}
          t={t}
        />
      </div>
    </div>
  )
}

function ProtectionSigil({
  state,
  onToggle,
  onShop,
  t,
}: {
  state: ProtectionState
  onToggle: () => void
  onShop: () => void
  t: ReturnType<typeof useT>
}) {
  const armed = state.kind === 'armed'
  const unavailable = state.kind === 'unavailable'
  const insufficient = state.kind === 'insufficient'

  const required = unavailable ? 0 : state.required
  const owned = unavailable ? 0 : state.owned
  // 충전 분자는 필요치까지만(보유가 넘쳐도 '충전 완료'). 분모(필요치)는 항상 드러난다.
  const charged = Math.min(owned, required)

  // 발동·충분(ready)은 흰빛으로 또렷이, 부족·보호불가는 회색으로 흐릿하게(요청).
  const lit = armed || state.kind === 'ready'
  const dim = lit ? 'opacity-100' : insufficient ? 'opacity-55' : 'opacity-45'
  const cls = `pointer-events-auto transition-opacity ${dim}`

  const body = (
    // 마법진(회전 룬)이 가운데 충전 수치를 감싼다. 발동 시 흰빛 글로우가 더해진다(기존 활성화 효과).
    <div
      className="relative h-20 w-20"
      style={{
        // 마법진 룬은 currentColor 로 그려진다 — 상태색(발동·충분=흰빛 / 부족·보호불가=회색)을 여기서 물들인다.
        color: lit ? 'white' : 'var(--color-ink-soft)',
        filter: armed
          ? 'drop-shadow(0 0 7px rgba(255,255,255,0.9))'
          : undefined,
      }}
    >
      <SigilRunes />
      {/* 파괴보호장치 아이템 — 마법진 한가운데(중심 원)에 놓는다. 보호불가는 빗금 방패. */}
      <span className="absolute inset-0 grid place-items-center">
        {unavailable ? (
          <CrossedShield />
        ) : (
          <ItemIcon itemId={PROTECTION_TICKET_ID} className="h-10 w-10" />
        )}
      </span>
      {/* 충전 수치 — 아이템보다 살짝 아래(가장 큰 원 안쪽). */}
      {!unavailable && (
        <span
          className="absolute bottom-2.5 left-1/2 -translate-x-1/2 text-[13px] leading-none tabular-nums"
          style={{
            color: lit ? 'white' : 'var(--color-ink-soft)',
            textShadow: '0 1px 2px rgba(0,0,0,0.55)',
          }}
        >
          {charged}/{required}
        </span>
      )}
    </div>
  )

  // unavailable: 누를 게 없다(이 단계는 보호 불가) — 정적. aria-label 로 상태를 음성 전달.
  if (unavailable)
    return (
      <div className={cls} aria-label={t('protection.unavailable')}>
        {body}
      </div>
    )
  // insufficient: 탭 = 상점(부족분 채우기).
  if (insufficient)
    return (
      <button
        type="button"
        onClick={onShop}
        aria-label={t('shop.open')}
        className={cls}
      >
        {body}
      </button>
    )
  // ready·armed: 탭 = 발동 토글.
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={armed}
      aria-label={t('protection.toggle')}
      className={cls}
    >
      {body}
    </button>
  )
}

// 보호 불가(이 단계엔 못 씀) 표시 — 빗금친 방패.
function CrossedShield() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6 text-ink-soft"
      fill="currentColor"
      aria-hidden
    >
      <path d="M12 2 4 5v6c0 5 3.4 8.5 8 11 4.6-2.5 8-6 8-11V5l-8-3Z" />
      <line
        x1="5"
        y1="4"
        x2="19"
        y2="20"
        stroke="var(--color-stage)"
        strokeWidth="2.4"
        fill="none"
      />
    </svg>
  )
}
