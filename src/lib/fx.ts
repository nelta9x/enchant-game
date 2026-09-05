// 1회성 연출의 키프레임 → Web Animations API(WAAPI) 변환기(순수) + 재생 헬퍼.
//
// 왜 WAAPI 인가: motion(JS 프레임루프)은 x·y·scale·rotate 같은 개별 transform 값을 매 프레임 JS 로 합성해 인라인
// 스타일에 쓴다. 그러면 연출이 도는 내내 프레임마다 메인 스레드가 깨어 스타일 재계산·컴포지터 커밋을 치른다
// (홀드 연사 4.7s 실측: rAF 콜백 1,900회·스타일 재계산 570회). 같은 키프레임을 element.animate() 로 걸면
// transform·opacity 는 컴포지터가 단독으로 돌려(요소는 .fx-layer 로 승격돼 있다) 메인 스레드 비용이 0 이다.
//
// 모델(motion 의 키프레임 표기와 1:1):
//  - channels: x/y(px)·scale·rotate(deg)·opacity·filter 의 키프레임 배열(또는 상수). transform 채널은 motion 과 같은
//    순서(translate → scale → rotate)로 한 transform 문자열에 합성한다.
//  - times: 키프레임 오프셋(0~1). 채널마다 길이가 달라도 된다 — 모든 채널의 오프셋 합집합에서 선형 보간해 맞춘다
//    (짧은 채널의 구간 이징이 합집합 구간마다 적용되는 미세 차이는 있으나 값은 키프레임에서 정확히 일치).
//  - ease: 전체 하나 또는 구간별 배열(길이 = 키프레임 수 − 1). motion 의 이름 이징을 같은 cubic-bezier 로 옮겼다.
//  - fill 기본 'both': delay 동안 첫 키프레임을 유지하고(set 후 start 와 동일), 끝나면 마지막 키프레임에 머문다.
// 시간·DOM 을 모르는 buildFx 는 결정적(테스트), playFx 만 DOM 을 만진다.

export type EaseName =
  | 'linear'
  | 'easeIn'
  | 'easeOut'
  | 'easeInOut'
  | 'backIn'
  | 'backOut'

// motion-utils 의 정의를 CSS cubic-bezier 로 옮긴 값. backIn 은 backOut 의 반전(1−f(1−t)) = 제어점 반전.
export const EASING_CSS: Record<EaseName, string> = {
  linear: 'linear',
  easeIn: 'cubic-bezier(0.42, 0, 1, 1)',
  easeOut: 'cubic-bezier(0, 0, 0.58, 1)',
  easeInOut: 'cubic-bezier(0.42, 0, 0.58, 1)',
  backOut: 'cubic-bezier(0.33, 1.53, 0.69, 0.99)',
  backIn: 'cubic-bezier(0.31, 0.01, 0.67, -0.53)',
}

export type FxChannels = {
  x?: number[] | number
  y?: number[] | number
  scale?: number[] | number
  rotate?: number[] | number
  opacity?: number[] | number
  filter?: string[] | string
}

export type FxSpec = {
  channels: FxChannels
  durationSec: number
  delaySec?: number
  times?: number[] // 기본 등간격. 채널 길이가 다르면 각 채널은 자기 길이의 등간격, times 는 가장 긴 채널에 적용
  ease?: EaseName | EaseName[]
  fill?: FillMode
}

export type BuiltFx = {
  keyframes: Keyframe[]
  options: KeyframeEffectOptions
}

const TRANSFORM_KEYS = ['x', 'y', 'scale', 'rotate'] as const
type NumericKey = (typeof TRANSFORM_KEYS)[number] | 'opacity'

function evenTimes(n: number): number[] {
  if (n <= 1) return [0]
  return Array.from({ length: n }, (_, i) => i / (n - 1))
}

// 채널 하나를 (times, values) 로 정규화한다. 상수는 길이 1(모든 오프셋에서 그 값).
function normalize<T>(
  raw: T[] | T,
  longest: number,
  times: number[] | undefined,
): { t: number[]; v: T[] } {
  const v = Array.isArray(raw) ? raw : [raw]
  if (v.length === 0) throw new Error('fx: channel must have at least one keyframe')
  const t =
    v.length === longest && times ? times : evenTimes(v.length)
  if (t.length !== v.length)
    throw new Error(`fx: times length ${t.length} does not match channel length ${v.length}`)
  return { t, v }
}

// 채널을 오프셋 u 에서 선형 보간(숫자) — 합집합 오프셋에 맞추는 데 쓴다.
function sampleNumber(ch: { t: number[]; v: number[] }, u: number): number {
  if (ch.v.length === 1 || u <= ch.t[0]) return ch.v[0]
  for (let i = 1; i < ch.t.length; i++) {
    if (u <= ch.t[i]) {
      const span = ch.t[i] - ch.t[i - 1]
      const f = span > 0 ? (u - ch.t[i - 1]) / span : 1
      return ch.v[i - 1] + (ch.v[i] - ch.v[i - 1]) * f
    }
  }
  return ch.v[ch.v.length - 1]
}

// 문자열 채널(filter)은 보간 없이 "직전 키프레임 이하 최댓값" 규칙 — 합집합 오프셋이 자기 키프레임과 일치할 때 정확.
function sampleString(ch: { t: number[]; v: string[] }, u: number): string {
  let out = ch.v[0]
  for (let i = 0; i < ch.t.length; i++) if (ch.t[i] <= u + 1e-9) out = ch.v[i]
  return out
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(4).replace(/\.?0+$/, ''))

// 키프레임 값들 → CSS transform 문자열(motion 의 합성 순서: translate → scale → rotate). 채널이 없으면 null.
export function composeTransform(v: {
  x?: number
  y?: number
  scale?: number
  rotate?: number
}): string | null {
  const parts: string[] = []
  if (v.x !== undefined || v.y !== undefined)
    parts.push(`translate(${fmt(v.x ?? 0)}px, ${fmt(v.y ?? 0)}px)`)
  if (v.scale !== undefined) parts.push(`scale(${fmt(v.scale)})`)
  if (v.rotate !== undefined) parts.push(`rotate(${fmt(v.rotate)}deg)`)
  return parts.length ? parts.join(' ') : null
}

// FxSpec → WAAPI 키프레임·옵션. 순수·결정적.
export function buildFx(spec: FxSpec): BuiltFx {
  const { channels } = spec
  const keys = (Object.keys(channels) as (keyof FxChannels)[]).filter(
    (k) => channels[k] !== undefined,
  )
  if (keys.length === 0) throw new Error('fx: no channels')
  const longest = Math.max(
    ...keys.map((k) => (Array.isArray(channels[k]) ? (channels[k] as unknown[]).length : 1)),
  )
  if (spec.times && spec.times.length !== longest)
    throw new Error(`fx: times length ${spec.times.length} must equal the longest channel (${longest})`)

  const numeric = new Map<NumericKey, { t: number[]; v: number[] }>()
  for (const k of [...TRANSFORM_KEYS, 'opacity'] as NumericKey[]) {
    const raw = channels[k]
    if (raw !== undefined) numeric.set(k, normalize(raw as number[] | number, longest, spec.times))
  }
  const filter =
    channels.filter !== undefined
      ? normalize(channels.filter as string[] | string, longest, spec.times)
      : null

  // 오프셋 합집합(정렬·중복 제거)
  const union = new Set<number>()
  for (const ch of numeric.values()) for (const t of ch.t) union.add(t)
  if (filter) for (const t of filter.t) union.add(t)
  const offsets = [...union].sort((a, b) => a - b)
  if (offsets[0] !== 0 || offsets[offsets.length - 1] !== 1)
    throw new Error('fx: keyframe times must start at 0 and end at 1')

  const easeList = Array.isArray(spec.ease) ? spec.ease : null
  if (easeList && easeList.length !== offsets.length - 1)
    throw new Error(`fx: ease array length ${easeList.length} must equal segments (${offsets.length - 1})`)

  const keyframes: Keyframe[] = offsets.map((u, i) => {
    const kf: Keyframe = { offset: u }
    const tv: { x?: number; y?: number; scale?: number; rotate?: number } = {}
    for (const k of TRANSFORM_KEYS) {
      const ch = numeric.get(k)
      if (ch) tv[k] = sampleNumber(ch, u)
    }
    const transform = composeTransform(tv)
    if (transform !== null) kf.transform = transform
    const op = numeric.get('opacity')
    if (op) kf.opacity = sampleNumber(op, u)
    if (filter) kf.filter = sampleString(filter, u)
    if (easeList && i < offsets.length - 1) kf.easing = EASING_CSS[easeList[i]]
    return kf
  })

  const options: KeyframeEffectOptions = {
    duration: Math.max(0, spec.durationSec) * 1000,
    delay: Math.max(0, spec.delaySec ?? 0) * 1000,
    fill: spec.fill ?? 'both',
    easing: typeof spec.ease === 'string' ? EASING_CSS[spec.ease] : 'linear',
  }
  return { keyframes, options }
}

// 요소당 진행 중인 연출 1개 — 새 재생은 이전 것을 취소하고 처음부터 튼다(연사 하드 컷, motion controls.set+start 와 동일).
const active = new WeakMap<Element, Animation>()

// 연출 재생. WAAPI 미지원 환경(테스트·구형)은 null — 호출자는 완료 콜백만 즉시 처리하면 된다.
export function playFx(el: Element | null, spec: FxSpec): Animation | null {
  if (!el || typeof el.animate !== 'function') return null
  active.get(el)?.cancel()
  const { keyframes, options } = buildFx(spec)
  const anim = el.animate(keyframes, options)
  active.set(el, anim)
  return anim
}

// 진행 중인 연출을 즉시 끊고 요소를 스타일 기본값으로 되돌린다.
export function stopFx(el: Element | null): void {
  if (!el) return
  active.get(el)?.cancel()
  active.delete(el)
}

// 완료 콜백 — 취소(cancel)로 끝난 경우엔 부르지 않는다(AbortError 무시). 미지원(null)이면 즉시 호출.
export function onFxDone(anim: Animation | null, cb: () => void): void {
  if (!anim) {
    cb()
    return
  }
  anim.finished.then(cb, () => {})
}
