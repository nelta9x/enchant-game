// 연출(Effect) 큐의 "순수 전이 코어" — 타이머/모션/React 의존이 전혀 없다.
// 큐잉·배타성 스케줄링·lockCount 전이를 순수 함수로만 표현해 단위 테스트가 결정적이게 한다.
// 실제 타이머(durationMs 경과 → finish)는 effectStore 의 얇은 셸이 맡는다(로직은 여기, 시간은 거기).
//
// 모델:
//  - 효과는 큐(queue)에 쌓이고, 스케줄러가 배타성 규칙에 따라 running 으로 옮겨 동시 실행한다.
//  - exclusive 효과는 "혼자" 실행된다(running 이 비고 다른 것이 함께 시작되지 않을 때만 시작, 끝까지 점유).
//  - 병렬(비-exclusive) 효과는 서로 겹쳐 실행될 수 있다.
//  - 생명주기: 시작(locksEnhance 면 lockCount++) → 진행(durationMs, 뷰가 running 을 보고 연출) → 종료(lockCount--).
//  - 종료 시 next 가 있으면 그 후속 효과를 다시 큐에 넣는다(체이닝 — 다단계 시퀀스 구성용).

export type EffectPayload = {
  spriteUrl?: string // 파괴 잔상 스프라이트(파괴 전용)
  particleCount?: number // 분출할 파티클 수(파괴·성공 — 단계에 비례)
}

// 효과 명세(호출 측이 enqueue 에 넘기는 것 — id 는 시스템이 부여).
export type EffectSpec = {
  kind: string // 'destruction' | 'enhanceLock' | 'protectedShake' ... (뷰가 해석)
  exclusive: boolean // true = 혼자 실행(다른 효과를 막음), false = 병렬 허용
  locksEnhance: boolean // 실행 중 강화 버튼을 잠근다(lockCount 로 집계)
  durationMs: number // 진행(progress) 길이 — 이 시간 뒤 종료. 연출 길이 이상이어야 한다.
  payload?: EffectPayload // 뷰 렌더용 부가 정보(예: 파괴 잔상 스프라이트)
  next?: EffectSpec // 종료 시 다시 큐에 넣을 후속 효과(체이닝)
}

export type Effect = EffectSpec & { id: number }

export type EffectQueueState = {
  queue: Effect[]
  running: Effect[]
  lockCount: number
  nextId: number // 다음 효과에 부여할 id(1 부터 — 0 은 "없음" 센티넬로 뷰에서 쓰기 좋다)
}

export function emptyEffectQueue(): EffectQueueState {
  return { queue: [], running: [], lockCount: 0, nextId: 1 }
}

// 지금 시작할 수 있는 효과들을 큐 앞에서부터 고른다(배타성 규칙).
//  - running 에 exclusive 가 있으면(점유 중) 아무것도 시작하지 않는다.
//  - 큐를 앞에서부터 보며: 병렬 효과는 모아 시작하고, exclusive 를 만나면
//    (running 이 비었고 이번에 아무것도 시작 안 했을 때만 혼자 시작) 거기서 멈춘다.
export function startable(queue: Effect[], running: Effect[]): Effect[] {
  if (running.some((e) => e.exclusive)) return []
  const started: Effect[] = []
  for (const e of queue) {
    if (e.exclusive) {
      if (running.length === 0 && started.length === 0) started.push(e)
      break // exclusive 뒤로는 이번 턴에 시작할 수 없다(혼자거나, 병렬 뒤에서 대기).
    }
    started.push(e)
  }
  return started
}

// 큐에 효과를 추가(id 부여 + nextId 증가). 순수.
export function enqueue(
  state: EffectQueueState,
  spec: EffectSpec,
): EffectQueueState {
  const effect: Effect = { ...spec, id: state.nextId }
  return {
    ...state,
    queue: [...state.queue, effect],
    nextId: state.nextId + 1,
  }
}

// 시작 가능한 효과들을 running 으로 옮기고 잠금 효과만큼 lockCount 증가. 시작된 효과 목록도 반환
// (셸이 각 효과의 durationMs 타이머를 걸 수 있도록). 순수.
export function pump(state: EffectQueueState): {
  state: EffectQueueState
  started: Effect[]
} {
  const started = startable(state.queue, state.running)
  if (started.length === 0) return { state, started }
  const startedIds = new Set(started.map((e) => e.id))
  const lockAdds = started.filter((e) => e.locksEnhance).length
  return {
    state: {
      ...state,
      queue: state.queue.filter((e) => !startedIds.has(e.id)),
      running: [...state.running, ...started],
      lockCount: state.lockCount + lockAdds,
    },
    started,
  }
}

// 같은 kind 중 "가장 최근"(id 최댓값) running 효과를 고른다(없으면 null). id 는 단조 증가하므로
// 최댓값이 최신 — 뷰가 트리거를 뽑을 때 first-match(find) 대신 써야 겹친 새 효과가 유실되지 않는다.
export function latestRunning(running: Effect[], kind: string): Effect | null {
  let best: Effect | null = null
  for (const e of running) {
    if (e.kind === kind && (best === null || e.id > best.id)) best = e
  }
  return best
}

// 효과 종료: running 에서 제거 + 잠금 효과면 lockCount 감소 + next 가 있으면 큐에 다시 넣는다. 순수.
export function finish(state: EffectQueueState, id: number): EffectQueueState {
  const effect = state.running.find((e) => e.id === id)
  if (!effect) return state
  const ended: EffectQueueState = {
    ...state,
    running: state.running.filter((e) => e.id !== id),
    lockCount: state.lockCount - (effect.locksEnhance ? 1 : 0),
  }
  return effect.next ? enqueue(ended, effect.next) : ended
}
