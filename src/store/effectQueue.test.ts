import { describe, it, expect } from 'vitest'
import {
  emptyEffectQueue,
  enqueue,
  finish,
  latestRunning,
  pump,
  startable,
  type Effect,
  type EffectSpec,
} from './effectQueue'

// 테스트용 효과 명세 헬퍼(필요한 필드만 덮어쓴다).
function spec(over: Partial<EffectSpec> = {}): EffectSpec {
  return {
    kind: 'test',
    exclusive: false,
    locksEnhance: false,
    durationMs: 100,
    ...over,
  }
}

// startable 입력용 — id 가 부여된 Effect 를 직접 만든다.
function fx(id: number, over: Partial<EffectSpec> = {}): Effect {
  return { ...spec(over), id }
}

describe('startable — 배타성 스케줄링', () => {
  it('running 에 exclusive 가 있으면 아무것도 시작하지 않는다', () => {
    const running = [fx(1, { exclusive: true })]
    expect(startable([fx(2), fx(3)], running)).toEqual([])
  })

  it('빈 running + 큐 앞 exclusive → 그 하나만(혼자) 시작', () => {
    const queue = [fx(1, { exclusive: true }), fx(2), fx(3)]
    expect(startable(queue, []).map((e) => e.id)).toEqual([1])
  })

  it('병렬 효과들은 함께 시작하되 첫 exclusive 앞에서 멈춘다', () => {
    const queue = [fx(1), fx(2), fx(3, { exclusive: true }), fx(4)]
    expect(startable(queue, []).map((e) => e.id)).toEqual([1, 2])
  })

  it('running 에 병렬이 있을 때 큐 앞 exclusive 는 대기(시작 안 함)', () => {
    const running = [fx(1)]
    expect(startable([fx(2, { exclusive: true })], running)).toEqual([])
  })

  it('running 에 병렬이 있으면 큐의 병렬 효과는 합류한다', () => {
    const running = [fx(1)]
    expect(startable([fx(2), fx(3)], running).map((e) => e.id)).toEqual([2, 3])
  })
})

describe('enqueue — id 부여', () => {
  it('id 를 부여하고 nextId 를 증가시킨다', () => {
    let s = emptyEffectQueue()
    s = enqueue(s, spec({ kind: 'a' }))
    s = enqueue(s, spec({ kind: 'b' }))
    expect(s.queue.map((e) => [e.id, e.kind])).toEqual([
      [1, 'a'],
      [2, 'b'],
    ])
    expect(s.nextId).toBe(3)
  })
})

describe('pump — 시작 전이 + lockCount', () => {
  it('startable 을 running 으로 옮기고 잠금 효과만큼 lockCount 를 올린다', () => {
    let s = emptyEffectQueue()
    s = enqueue(s, spec({ kind: 'visual', locksEnhance: false }))
    s = enqueue(s, spec({ kind: 'lock', locksEnhance: true }))
    const { state, started } = pump(s)
    expect(started.map((e) => e.kind)).toEqual(['visual', 'lock'])
    expect(state.queue).toEqual([])
    expect(state.running.map((e) => e.kind)).toEqual(['visual', 'lock'])
    expect(state.lockCount).toBe(1) // 잠금 효과는 하나뿐
  })

  it('시작할 것이 없으면 상태를 그대로 둔다', () => {
    const s = emptyEffectQueue()
    const { state, started } = pump(s)
    expect(started).toEqual([])
    expect(state).toBe(s)
  })
})

describe('latestRunning — 같은 kind 중 최신(id 최댓값)', () => {
  it('같은 kind 가 겹쳐 있으면 가장 최근(최대 id)을 고른다', () => {
    const running = [
      fx(3, { kind: 'shake' }),
      fx(7, { kind: 'shake' }),
      fx(5, { kind: 'other' }),
    ]
    expect(latestRunning(running, 'shake')?.id).toBe(7)
  })

  it('해당 kind 가 없으면 null', () => {
    expect(latestRunning([fx(1, { kind: 'a' })], 'b')).toBeNull()
    expect(latestRunning([], 'a')).toBeNull()
  })
})

describe('finish — 종료 전이 + lockCount 동시성', () => {
  it('running 에서 제거하고 잠금 효과면 lockCount 를 내린다', () => {
    let s = pump(
      enqueue(emptyEffectQueue(), spec({ locksEnhance: true })),
    ).state
    expect(s.lockCount).toBe(1)
    s = finish(s, 1)
    expect(s.running).toEqual([])
    expect(s.lockCount).toBe(0)
  })

  it('잠그는 효과 2개 동시 실행 → lockCount 2, 각 finish 마다 1씩 줄어 0', () => {
    let s = emptyEffectQueue()
    s = enqueue(s, spec({ kind: 'lockA', locksEnhance: true }))
    s = enqueue(s, spec({ kind: 'lockB', locksEnhance: true }))
    s = pump(s).state
    expect(s.lockCount).toBe(2)
    s = finish(s, 1)
    expect(s.lockCount).toBe(1) // 한쪽이 끝나도 다른 잠금이 남아 있다
    s = finish(s, 2)
    expect(s.lockCount).toBe(0)
  })

  it('존재하지 않는 id 를 finish 하면 무변화', () => {
    const s = pump(enqueue(emptyEffectQueue(), spec())).state
    expect(finish(s, 999)).toBe(s)
  })
})

describe('finish — 체이닝(next 재큐잉)', () => {
  it('종료 시 next 가 있으면 큐에 다시 넣는다', () => {
    const withNext = spec({
      kind: 'phaseA',
      next: spec({ kind: 'phaseB' }),
    })
    let s = pump(enqueue(emptyEffectQueue(), withNext)).state
    expect(s.running.map((e) => e.kind)).toEqual(['phaseA'])
    s = finish(s, 1)
    expect(s.running).toEqual([]) // phaseA 종료
    expect(s.queue.map((e) => e.kind)).toEqual(['phaseB']) // phaseB 가 큐에 들어감
    expect(s.queue[0].id).toBe(2) // 새 id 부여
  })

  it('next 가 없으면 큐에 아무것도 추가하지 않는다', () => {
    const s = pump(enqueue(emptyEffectQueue(), spec())).state
    expect(finish(s, 1).queue).toEqual([])
  })
})
