import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createEffectStore } from './effectStore'
import type { EffectSpec } from './effectQueue'

// 셸(타이머) 통합 테스트 — 순수 코어(effectQueue.test)와 달리, durationMs 경과 시 finish 가
// 실제로 불려 생명주기가 도는지(시작→진행→종료)와 배타/체이닝이 시간축에서 맞물리는지 본다.
beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function spec(over: Partial<EffectSpec> = {}): EffectSpec {
  return {
    kind: 'test',
    exclusive: false,
    locksEnhance: false,
    durationMs: 400,
    ...over,
  }
}

describe('effectStore — 타이머 셸 생명주기', () => {
  it('잠금 효과: enqueue 시 lockCount 1 → durationMs 경과 후 0', () => {
    const store = createEffectStore()
    store
      .getState()
      .enqueueEffect(spec({ locksEnhance: true, durationMs: 400 }))
    expect(store.getState().lockCount).toBe(1)
    expect(store.getState().running).toHaveLength(1)

    vi.advanceTimersByTime(399)
    expect(store.getState().lockCount).toBe(1) // 아직 진행 중
    vi.advanceTimersByTime(1)
    expect(store.getState().lockCount).toBe(0) // 종료 → 잠금 해제
    expect(store.getState().running).toHaveLength(0)
  })

  it('병렬(연출 ∥ 잠금): 함께 시작하고 각자 길이에 끝난다 — 파괴 시나리오', () => {
    const store = createEffectStore()
    store.getState().enqueueEffect(spec({ kind: 'visual', durationMs: 1060 }))
    store
      .getState()
      .enqueueEffect(
        spec({ kind: 'lock', locksEnhance: true, durationMs: 400 }),
      )
    expect(store.getState().running.map((e) => e.kind)).toEqual([
      'visual',
      'lock',
    ])
    expect(store.getState().lockCount).toBe(1)

    vi.advanceTimersByTime(400) // 잠금만 끝 — 버튼 풀림, 연출은 계속
    expect(store.getState().lockCount).toBe(0)
    expect(store.getState().running.map((e) => e.kind)).toEqual(['visual'])

    vi.advanceTimersByTime(660) // 연출 종료
    expect(store.getState().running).toEqual([])
  })

  it('exclusive 효과는 앞선 병렬 효과가 끝난 뒤에야 혼자 시작한다', () => {
    const store = createEffectStore()
    store.getState().enqueueEffect(spec({ kind: 'par', durationMs: 500 }))
    store
      .getState()
      .enqueueEffect(spec({ kind: 'exc', exclusive: true, durationMs: 300 }))
    expect(store.getState().running.map((e) => e.kind)).toEqual(['par'])
    expect(store.getState().queue.map((e) => e.kind)).toEqual(['exc']) // exc 대기

    vi.advanceTimersByTime(500) // par 종료 → exc 시작
    expect(store.getState().running.map((e) => e.kind)).toEqual(['exc'])
    vi.advanceTimersByTime(300)
    expect(store.getState().running).toEqual([])
  })

  it('체이닝: 종료 시 next 가 큐에 들어가 이어서 실행된다', () => {
    const store = createEffectStore()
    store.getState().enqueueEffect(
      spec({
        kind: 'A',
        durationMs: 200,
        next: spec({ kind: 'B', durationMs: 200 }),
      }),
    )
    expect(store.getState().running.map((e) => e.kind)).toEqual(['A'])

    vi.advanceTimersByTime(200) // A 종료 → B 자동 시작
    expect(store.getState().running.map((e) => e.kind)).toEqual(['B'])
    vi.advanceTimersByTime(200)
    expect(store.getState().running).toEqual([])
  })
})

describe('effectStore — latestByKind(뷰 트리거: 시작만 발행, 종료는 유지)', () => {
  it('시작 시 kind 별 최신 효과가 기록되고, 종료돼도 남는다(참조 유지)', () => {
    const store = createEffectStore()
    store.getState().enqueueEffect(spec({ kind: 'burst', durationMs: 300 }))
    const first = store.getState().latestByKind.burst
    expect(first?.kind).toBe('burst')
    vi.advanceTimersByTime(300) // 종료 — running 에선 빠지지만 latestByKind 는 그대로
    expect(store.getState().running).toEqual([])
    expect(store.getState().latestByKind.burst).toBe(first)
  })

  it('같은 kind 의 새 시작만 참조를 바꾼다(다른 kind 의 시작·종료엔 불변)', () => {
    const store = createEffectStore()
    store.getState().enqueueEffect(spec({ kind: 'a', durationMs: 100 }))
    const a1 = store.getState().latestByKind.a
    store.getState().enqueueEffect(spec({ kind: 'b', durationMs: 100 }))
    expect(store.getState().latestByKind.a).toBe(a1)
    vi.advanceTimersByTime(100)
    expect(store.getState().latestByKind.a).toBe(a1)
    store.getState().enqueueEffect(spec({ kind: 'a', durationMs: 100 }))
    expect(store.getState().latestByKind.a).not.toBe(a1)
    expect(store.getState().latestByKind.a?.id).toBeGreaterThan(a1!.id)
  })
})
