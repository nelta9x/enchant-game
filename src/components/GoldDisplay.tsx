import { useEffect, useRef } from 'react'
import {
  motion,
  useAnimationControls,
  useMotionValue,
  useTransform,
} from 'motion/react'
import { useI18nStore } from '../i18n'
import { formatAmount, formatGold } from '../lib/format'
import { Coin } from './Coin'
import { COIN_ARRIVAL_SEC, coinArrivalTimes } from './coins'

// 보유 골드(우하단). 판매 코인이 빨려드는 "착지점" — 코인이 하나씩 도착할 때마다(coinArrivalTimes
// 스케줄) UI 가 통! 튀고(통통통) 숫자가 그만큼 단계로 오른다. 코인 연출(CoinFlight)과는 콜백 없이
// 같은 순수 스케줄로 동기화한다. 모든 타격·숫자 갱신은 명령형(setTimeout + controls/motionValue)이라
// React 재렌더가 없다(가볍고 안전).
export function GoldDisplay({
  gold,
  pulseKey = 0,
  coinCount = 0,
}: {
  gold: number
  pulseKey?: number
  coinCount?: number
}) {
  const lang = useI18nStore((s) => s.lang)

  // 표시 숫자(명령형으로만 갱신 — React 재렌더 없이 textContent 만 바뀐다).
  const display = useMotionValue(gold)
  // 표시 텍스트는 금화 아이콘이 통화를 대신하므로 단위 없이 금액만. 통화 맥락은 컨테이너 aria-label(formatGold)로 보존.
  const text = useTransform(display, (v) => formatAmount(Math.round(v)))

  // 코인별 타격(통통통). 도착마다 통 튀고 backOut 으로 살짝 반동 후 제자리 — 빠르게 겹치면 활기찬
  // 연타, 코인이 적으면 또렷한 틱.
  const punch = useAnimationControls()

  // 항상 최신 gold·coinCount 를 읽되, "판매(pulseKey)" 변화에만 스케줄링하도록 ref 로 우회한다
  // (gold 를 deps 에 넣으면 강화 비용 등 다른 골드 변화에도 스케줄이 재실행되는 문제를 피한다).
  // ref 갱신은 렌더 중이 아니라 effect 에서 한다(렌더 중 ref 쓰기 금지). 아래 판매 effect 보다
  // 먼저 선언돼 매 커밋에 ref 가 갱신된 뒤 판매 effect 가 읽는다.
  const goldRef = useRef(gold)
  const countRef = useRef(coinCount)
  useEffect(() => {
    goldRef.current = gold
    countRef.current = coinCount
  })

  // 예약된 도착 타이머들(판매 취소·교체·언마운트 시 정리).
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const clearTimers = () => {
    for (const id of timers.current) clearTimeout(id)
    timers.current = []
  }

  // 판매(pulseKey 변화) → 코인 도착 스케줄대로 통통통 타격 + 숫자 단계 상승.
  useEffect(() => {
    if (pulseKey <= 0) return
    const from = display.get()
    const n = Math.max(1, countRef.current)
    clearTimers()
    coinArrivalTimes(n).forEach((t, i) => {
      const id = setTimeout(() => {
        // 목표는 매 틱 최신 gold 로 읽는다 — 스트림 도중 골드가 바뀌어도(예: 판매 직후 강화 비용)
        // 항상 실제 값으로 수렴한다. 마지막 코인은 정확히 현재 gold 로 맞춘다.
        const to = goldRef.current
        display.set(
          i === n - 1 ? to : Math.round(from + ((to - from) * (i + 1)) / n),
        )
        punch.start({
          scale: [1.15, 1],
          transition: { duration: 0.24, ease: 'backOut' },
        })
      }, t * 1000)
      timers.current.push(id)
    })
    return clearTimers
  }, [pulseKey, display, punch])

  // 판매 외 변화(강화 비용 등 감소)는 즉시 스냅 + 예약된 타격 취소(진행 중이었다면).
  useEffect(() => {
    if (gold < display.get()) {
      clearTimers()
      display.set(gold)
    }
  }, [gold, display])

  return (
    <motion.div
      animate={punch}
      aria-label={formatGold(gold, lang)}
      className="relative flex w-full items-center justify-center gap-2 rounded-lg border border-panel-edge bg-panel px-3 py-2.5 shadow-md"
    >
      {/* 도달 글로우 — 코인이 빨려 들어오는 동안 테두리에서 황금빛이 번진다(스트림처럼 두 번 일렁). */}
      <motion.span
        key={pulseKey}
        className="pointer-events-none absolute inset-0 rounded-lg"
        style={{ boxShadow: '0 0 22px 3px var(--color-gold-glow)' }}
        initial={{ opacity: 0 }}
        animate={
          pulseKey > 0 ? { opacity: [0, 0.7, 0.45, 0.9, 0] } : { opacity: 0 }
        }
        transition={{ delay: COIN_ARRIVAL_SEC, duration: 0.7, ease: 'easeOut' }}
      />
      <Coin className="h-5 w-5" />
      {/* 금액 슬롯 고정(min-w) — 보유 골드가 수십억으로 늘어도 표시 폭이 변하지 않게 자리를 미리 잡는다.
          (자릿수에 무관히 흔들리지 않도록 고정 text-sm + tabular-nums + 가운데 정렬) */}
      <motion.span className="min-w-[7.5rem] whitespace-nowrap text-center text-sm font-bold tabular-nums text-on-dark">
        {text}
      </motion.span>
    </motion.div>
  )
}
