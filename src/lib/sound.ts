// 사운드 매니저 — Web Audio API(AudioBuffer) 기반 효과음/BGM 재생.
//
// 왜 HTMLAudioElement 가 아닌가: <audio> 보이스는 하나마다 브라우저 미디어 파이프라인(미디어 스레드·비디오 프레임
// 컴포지터·GPU 컨텍스트)을 세운다. 이전 구현은 첫 재생 시점과 풀 확장 시점(최대 4개/효과음)에 lazy 로 요소를 만들어
// 강화 탭 직후 파이프라인 초기화가 프레임 정지와 겹쳤고, iOS 에선 play() 지연·비용이 특히 크다. Web Audio 는 부팅 때
// PCM 버퍼로 한 번 디코드해 두고 재생마다 AudioBufferSourceNode 만 만들므로(수십 µs) 폴리포니·풀·재사용 정책이
// 필요 없고, 지연 재생(망치 임팩트 동기)도 setTimeout 대신 샘플 정확한 start(when) 스케줄로 건다.
//
// 자산: 파일 바이트는 audioAssets(빌드 시 data URL 인라인)에서 온다 — file:// 에서 fetch 가 막히는 서버리스 제약 때문.
// 새 사운드는 public/audio/ 에 파일을 두고 SFX_FILES/BGM_FILES 에 이름을 등록한다(이름이 곧 타입).
//
// 생명주기: AudioContext 생성과 전 자산 디코드는 부팅 때(prime — main.tsx) 한다. 생성 비용이 크기 때문이다 —
// 오디오 장치·서비스 초기화가 동기적으로 수십~수백 ms(4x 스로틀 실측 178ms) 걸려, 첫 제스처에서 만들면 그 비용이
// 첫 강화 탭 핸들러 앞에 끼어 프레임을 통째로 떨군다. 제스처 밖에서 만든 컨텍스트는 autoplay 정책상 suspended 로
// 시작하므로(Chrome 이 개발자 콘솔에 경고 1줄을 남긴다 — 의도된 동작), 첫 사용자 제스처(installUnlock 이 window 에
// 캡처 리스너로 잡는 pointerdown/keydown)에서 resume 만 한다(수 µs). 디코드는 비동기라 첫 재생 요청이 디코드보다
// 빠르면 완료 즉시(예정 시각이 지났으면 바로) 재생한다. 백그라운드 전환·iOS 인터럽트로 suspended 되면 재생 시점에
// 다시 resume 한다.
import { audioAssets } from './audioAssets'

const SFX_FILES = {
  enhance: 'enhance_kang.wav', // 강화 '캉!' 타격음
  coin_pickup: 'coin_pickup.wav', // 코인 1개가 골드창에 흡수될 때(코인마다 1회)
  enchant_destroyed: 'enchant_destroyed.wav', // 강화 실패로 검이 파괴(폭발)되는 순간
  item_sold: 'item_sold.wav', // 검을 판매한 순간(차칭) — 코인 착지음(coin_pickup)과는 별개
} as const

// BGM 은 아직 없다(등록 시 이름이 곧 타입 — playBgm 인자). 파일은 public/audio/ 에.
const BGM_FILES = {} as const

export type SfxName = keyof typeof SFX_FILES
export type BgmName = keyof typeof BGM_FILES

export const SFX_NAMES = Object.keys(SFX_FILES) as SfxName[]
export const BGM_NAMES = Object.keys(BGM_FILES) as BgmName[]

// 레지스트리 이름 → 번들된 data URL. 등록만 하고 파일을 public/audio 에 안 두면 undefined(시작 시 assertAudioAssets 가 잡는다).
export function sfxAsset(name: SfxName): string | undefined {
  return audioAssets[SFX_FILES[name]]
}
export function bgmAsset(name: BgmName): string | undefined {
  return audioAssets[(BGM_FILES as Record<string, string>)[name]]
}

// 레지스트리의 모든 이름이 번들 자산으로 해석되는지 검사한다(부팅 1회). 등록·파일명 오타를 런타임 시작 시점에
// 즉시 드러낸다(assertNameKeysResolve 와 같은 원칙 — 조용히 무음이 되지 않게).
export function assertAudioAssets(): void {
  const missing = [
    ...SFX_NAMES.filter((n) => sfxAsset(n) === undefined).map((n) => `sfx:${n} (${SFX_FILES[n]})`),
    ...BGM_NAMES.filter((n) => bgmAsset(n) === undefined).map((n) => `bgm:${n}`),
  ]
  if (missing.length > 0)
    throw new Error(`audio assets missing from bundle: ${missing.join(', ')}`)
}

// data URL(base64) → 바이트. 순수(브라우저 API 는 atob 만). fetch 를 쓰지 않는 이유는 파일 머리 주석 참고.
export function decodeDataUrl(dataUrl: string): ArrayBuffer {
  const comma = dataUrl.indexOf(',')
  if (comma < 0 || !dataUrl.slice(0, comma).includes(';base64'))
    throw new Error('decodeDataUrl: expected a base64 data URL')
  const bin = atob(dataUrl.slice(comma + 1))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

// 재생 예정 시각(performance.now 기준 절대 ms)을 AudioContext 시간축의 start(when) 값으로 환산한다(순수).
// 예정이 이미 지났으면 지금(ctxNow) — 디코드가 늦어 예정을 놓친 재생은 즉시 나간다.
export function scheduleAt(
  ctxNowSec: number,
  perfNowMs: number,
  dueAtMs: number,
): number {
  return ctxNowSec + Math.max(0, (dueAtMs - perfNowMs) / 1000)
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

function devWarn(message: string): void {
  if (import.meta.env.DEV) console.warn(`[sound] ${message}`)
}

type PlayOptions = {
  volume?: number // 0~1, 기본 1(카테고리 볼륨에 곱해짐)
  delayMs?: number // 재생 지연(ms) — 샘플 정확한 스케줄(setTimeout 아님)
}

// 브라우저 AudioContext 생성자(Safari 구형은 webkit 접두). 없으면 null(테스트·비브라우저 → 전부 no-op).
function audioContextCtor(): (typeof AudioContext) | null {
  if (typeof window === 'undefined') return null
  const w = window as Window & { webkitAudioContext?: typeof AudioContext }
  return window.AudioContext ?? w.webkitAudioContext ?? null
}

class SoundManager {
  private ctx: AudioContext | null = null
  private sfxGain: GainNode | null = null
  private bgmGain: GainNode | null = null
  private readonly buffers = new Map<string, AudioBuffer>() // 파일명 → 디코드된 PCM
  private readonly decoding = new Map<string, Promise<AudioBuffer | null>>()
  private bgmSource: AudioBufferSourceNode | null = null
  private currentBgm: BgmName | null = null
  private muted = false
  private sfxVolume = 0.5
  private bgmVolume = 0.5
  private unlockInstalled = false

  // 첫 사용자 제스처에서 부팅 때 만든(suspended) 컨텍스트를 resume 한다(부팅 시 1회 호출 — main.tsx). 캡처 단계라
  // 게임 핸들러(강화 등)보다 먼저 돌아 같은 제스처 안에서 running 이 된다. 컨텍스트 생성은 여기서 하지 않는다(파일
  // 머리 주석 — 생성 비용이 첫 탭을 떨군다). 한 번 실행되면 해제.
  installUnlock(target: Window = window): void {
    if (this.unlockInstalled || audioContextCtor() === null) return
    this.unlockInstalled = true
    const unlock = () => {
      target.removeEventListener('pointerdown', unlock, true)
      target.removeEventListener('keydown', unlock, true)
      const ctx = this.ensureContext()
      if (ctx) this.resumeIfNeeded(ctx)
    }
    target.addEventListener('pointerdown', unlock, true)
    target.addEventListener('keydown', unlock, true)
  }

  // 컨텍스트 생성 + 전체 자산 디코드 시작(멱등). 부팅 때 부른다 — 제스처 밖이라 suspended 로 생성되고 installUnlock/
  // 첫 재생이 resume 한다. 생성·디코드 비용을 첫 탭에서 로딩 시점으로 옮기는 것이 목적.
  prime(): void {
    const ctx = this.ensureContext()
    if (!ctx) return
    for (const name of SFX_NAMES) void this.bufferFor(SFX_FILES[name])
    for (const name of BGM_NAMES) void this.bufferFor((BGM_FILES as Record<string, string>)[name])
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx
    const Ctor = audioContextCtor()
    if (!Ctor) return null
    const ctx = new Ctor()
    const sfx = ctx.createGain()
    const bgm = ctx.createGain()
    sfx.connect(ctx.destination)
    bgm.connect(ctx.destination)
    this.ctx = ctx
    this.sfxGain = sfx
    this.bgmGain = bgm
    this.applyVolumes()
    return ctx
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.sfxGain || !this.bgmGain) return
    const t = this.ctx.currentTime
    this.sfxGain.gain.setValueAtTime(this.muted ? 0 : this.sfxVolume, t)
    this.bgmGain.gain.setValueAtTime(this.muted ? 0 : this.bgmVolume, t)
  }

  // 백그라운드 복귀·iOS 인터럽트 뒤 suspended 인 컨텍스트를 깨운다(제스처 안이면 즉시, 아니면 허용 시점에).
  private resumeIfNeeded(ctx: AudioContext): void {
    if (ctx.state !== 'running') void ctx.resume().catch(() => {})
  }

  // 파일명 → 디코드 버퍼(캐시). 동시 요청은 하나의 디코드로 합친다. 실패(자산 없음·디코드 오류)는 null — 개발 모드 경고.
  private bufferFor(file: string): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(file)
    if (cached) return Promise.resolve(cached)
    const inflight = this.decoding.get(file)
    if (inflight) return inflight
    const ctx = this.ctx
    const dataUrl = audioAssets[file]
    if (!ctx || dataUrl === undefined) {
      devWarn(`audio asset unavailable: ${file}`)
      return Promise.resolve(null)
    }
    const p = ctx
      .decodeAudioData(decodeDataUrl(dataUrl))
      .then((buf) => {
        this.buffers.set(file, buf)
        return buf
      })
      .catch((e: unknown) => {
        devWarn(`audio decode failed: ${file} (${(e as Error)?.name ?? 'unknown'})`)
        return null
      })
      .finally(() => this.decoding.delete(file))
    this.decoding.set(file, p)
    return p
  }

  private startSource(
    ctx: AudioContext,
    buffer: AudioBuffer,
    out: GainNode,
    gain: number,
    when: number,
    loop: boolean,
  ): AudioBufferSourceNode {
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = loop
    let node: AudioNode = source
    if (gain !== 1) {
      const g = ctx.createGain()
      g.gain.value = gain
      source.connect(g)
      node = g
    }
    node.connect(out)
    source.start(when)
    return source
  }

  // 효과음 1회 재생. delayMs 는 요청 시점 기준 절대 시각으로 고정해(dueAt) 디코드·resume 대기와 무관하게 같은 순간을
  // 겨냥한다 — 놓쳤으면 즉시. 음소거면 스케줄하지 않는다(카테고리 gain 0 이지만 소스 생성 자체를 건너뛴다).
  playSfx(name: SfxName, opts: PlayOptions = {}): void {
    const ctx = this.ensureContext()
    if (!ctx || !this.sfxGain || this.muted) return
    this.resumeIfNeeded(ctx)
    const dueAt = performance.now() + Math.max(0, opts.delayMs ?? 0)
    const gain = clamp01(opts.volume ?? 1)
    const out = this.sfxGain
    const file = SFX_FILES[name]
    const cached = this.buffers.get(file)
    if (cached) {
      this.startSource(ctx, cached, out, gain, scheduleAt(ctx.currentTime, performance.now(), dueAt), false)
      return
    }
    void this.bufferFor(file).then((buffer) => {
      if (!buffer || this.muted) return
      this.startSource(ctx, buffer, out, gain, scheduleAt(ctx.currentTime, performance.now(), dueAt), false)
    })
  }

  // BGM 루프 재생(같은 곡이면 볼륨만 갱신). 음소거 중엔 카테고리 gain 이 0 이라 소리 없이 돌다가 해제 시 이어진다.
  playBgm(name: BgmName, opts: PlayOptions = {}): void {
    const ctx = this.ensureContext()
    if (!ctx || !this.bgmGain) return
    this.resumeIfNeeded(ctx)
    const gain = clamp01(opts.volume ?? 1)
    if (this.currentBgm === name && this.bgmSource) return
    this.stopBgm()
    this.currentBgm = name
    const out = this.bgmGain
    void this.bufferFor((BGM_FILES as Record<string, string>)[name]).then((buffer) => {
      if (!buffer || this.currentBgm !== name) return
      this.bgmSource = this.startSource(ctx, buffer, out, gain, ctx.currentTime, true)
    })
  }

  stopBgm(): void {
    if (this.bgmSource) {
      try {
        this.bgmSource.stop()
      } catch {
        /* 이미 멈춤 */
      }
      this.bgmSource.disconnect()
    }
    this.bgmSource = null
    this.currentBgm = null
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    this.applyVolumes()
  }

  toggleMuted(): boolean {
    this.setMuted(!this.muted)
    return this.muted
  }

  get isMuted(): boolean {
    return this.muted
  }

  setSfxVolume(volume: number): void {
    this.sfxVolume = clamp01(volume)
    this.applyVolumes()
  }
  setBgmVolume(volume: number): void {
    this.bgmVolume = clamp01(volume)
    this.applyVolumes()
  }
}

export const sound = new SoundManager()
