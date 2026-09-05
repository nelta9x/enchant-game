import { useEffect, useRef, useState } from 'react'
import { useI18nStore } from '../i18n'
import { useGameStore } from '../store/gameStore'
import { playFx } from '../lib/fx'
import { formatAmount, formatGold } from '../lib/format'
import { Coin } from './Coin'
import { COIN_ARRIVAL_SEC, coinArrivalTimes } from './coins'

// 보유 골드 표시(인벤토리 헤더 알약) — 판매·의뢰 완료의 코인 비행이 도착할 때마다 숫자가 코인 수만큼 나눠 오르며
// (카운트업) 알약이 통 튀고(punch), 도착 구간에 금색 글로우가 번진다. 표시 숫자는 React 상태가 아니라 DOM 텍스트를
// 직접 갱신한다 — 코인 50개면 50번의 갱신이라 커밋으로 돌리면 리렌더 폭풍이 된다(motion value 를 쓰던 이유와 같다).
// 펄스(punch·글로우)는 WAAPI(lib/fx)로 컴포지터가 돈다. pulseKey 변화가 트리거(판매·의뢰 완료마다 증가).
export function GoldDisplay({
  pulseKey = 0,
  coinCount = 0,
}: {
  pulseKey?: number
  coinCount?: number
}) {
  const gold = useGameStore((s) => s.gold)
  const lang = useI18nStore((s) => s.lang)
  const rootRef = useRef<HTMLDivElement>(null)
  const glowRef = useRef<HTMLSpanElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)

  // 화면에 보이는(카운트업 중일 수 있는) 값 — DOM 텍스트의 단일 출처. React 는 초기 텍스트만 렌더한다(아래 span 은
  // 마운트 시점 문자열을 고정 렌더 → 이후 React 가 텍스트를 덮어쓰지 않는다).
  const shownRef = useRef(gold)
  const [initialText] = useState(() => formatAmount(gold)) // 갱신하지 않는 초기 문자열(React 가 텍스트를 덮어쓰지 않게)
  const show = (value: number) => {
    shownRef.current = value
    if (textRef.current) textRef.current.textContent = formatAmount(Math.round(value))
  }

  // 코인 도착 시점·수·목표 골드는 effect 안에서 최신 ref 로 읽는다(펄스 도중 골드가 또 바뀌어도 마지막 도착이 최신 값에 맞는다).
  const goldRef = useRef(gold)
  const countRef = useRef(coinCount)
  useEffect(() => {
    goldRef.current = gold
    countRef.current = coinCount
  })

  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const clearTimers = () => {
    for (const id of timers.current) clearTimeout(id)
    timers.current = []
  }

  // 펄스: 코인이 도착하는 박자(coinArrivalTimes)마다 숫자를 한 단계 올리고 알약을 통 튀긴다. 글로우는 첫 도착 직전부터.
  useEffect(() => {
    if (pulseKey <= 0) return
    const from = shownRef.current
    const n = Math.max(1, countRef.current)
    clearTimers()
    playFx(glowRef.current, {
      channels: { opacity: [0, 0.7, 0.45, 0.9, 0] },
      durationSec: 0.7,
      delaySec: COIN_ARRIVAL_SEC,
      ease: 'easeOut',
    })
    coinArrivalTimes(n).forEach((t, i) => {
      const id = setTimeout(() => {
        const to = goldRef.current
        show(i === n - 1 ? to : Math.round(from + ((to - from) * (i + 1)) / n))
        playFx(rootRef.current, {
          channels: { scale: [1.15, 1] },
          durationSec: 0.24,
          ease: 'backOut',
        })
      }, t * 1000)
      timers.current.push(id)
    })
    return clearTimers
    // show/clearTimers 는 렌더마다 새 함수지만 ref 만 만지는 안정 동작 — 트리거는 pulseKey 뿐.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulseKey])

  // 골드가 줄면(강화 비용·제안 갱신) 카운트업을 끊고 즉시 반영한다 — 차감은 연출 없이 정직하게.
  useEffect(() => {
    if (gold < shownRef.current) {
      clearTimers()
      show(gold)
    } else if (gold > shownRef.current && timers.current.length === 0) {
      show(gold) // 펄스 없는 증가(현재 경로엔 없음) — 표시가 뒤처지지 않게
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gold])

  return (
    <div
      ref={rootRef}
      aria-label={formatGold(gold, lang)}
      className="fx-layer relative inline-flex items-center gap-1.5 rounded-full bg-bezel px-2.5 py-1"
    >
      {/* 도착 글로우 — 알약 테두리 밖으로 번지는 금색 빛(펄스마다 WAAPI 재생, 대기 시 opacity 0). */}
      <span
        ref={glowRef}
        className="fx-layer pointer-events-none absolute inset-0 rounded-full"
        style={{ boxShadow: '0 0 22px 3px var(--color-gold-glow)', opacity: 0 }}
      />
      <Coin className="h-5 w-5" />
      {/* 숫자 슬롯 — 자릿수가 바뀌어도 코인이 밀리지 않게 min-w 로 폭을 고정하고 우측 정렬한다(tabular-nums + 수치 슬롯
          고정 규칙). 텍스트는 마운트 시 문자열로 고정 렌더하고 이후엔 show() 가 DOM 을 직접 갱신한다. */}
      <span
        ref={textRef}
        className="min-w-[6rem] whitespace-nowrap text-right text-sm font-bold tabular-nums text-gold"
      >
        {initialText}
      </span>
    </div>
  )
}
