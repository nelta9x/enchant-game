// 게임 사운드 중앙 관리자(SoundManager). 모든 오디오 자산은 public/audio/ 에 둔다.
//
// 새 사운드 추가는 아래 SFX_FILES / BGM_FILES 레지스트리에 "이름: '파일명'" 한 줄만 더하면 끝이다.
// 이름은 그대로 타입(SfxName/BgmName)이 되어, 오타로 없는 사운드를 재생하면 컴파일 단계에서 막힌다.
//
// 종류:
//   · SFX — 짧은 일회성 효과음(강화 타격음 등). 사운드별 보이스 풀에서 재사용해 연타로 겹쳐 울린다(무한 증식 없음).
//   · BGM — 배경음악(루프). 한 번에 한 곡만 재생되며, 새 곡을 틀면 이전 곡을 멈춘다.
//
// 자동재생 정책: 첫 사용자 상호작용 전에는 play()가 거부될 수 있다 — 거부·예외는 조용히 무시한다(연출용).
// 비-브라우저(SSR/테스트, Audio 미정의)에서는 모든 재생이 아무 일도 하지 않는다.

const AUDIO_DIR = 'audio/'

// ── 사운드 레지스트리 — 여기만 고치면 사운드가 늘어난다 ──────────────────────────
const SFX_FILES = {
  enhance: 'enhance_kang.wav', // 강화 '캉!' 타격음
} as const

const BGM_FILES = {
  // 예) main: 'bgm_main.mp3',
} as const
// ────────────────────────────────────────────────────────────────────────────

export type SfxName = keyof typeof SFX_FILES
export type BgmName = keyof typeof BGM_FILES

// 파일명 → 로드 가능한 URL. BASE_URL 은 항상 '/'로 끝난다(Vite 규약) — 하위 경로 배포에서도 동작.
function audioUrl(file: string): string {
  return `${import.meta.env.BASE_URL}${AUDIO_DIR}${file}`
}

// 이름 → URL(순수). 테스트·프리로드에서 쓰도록 노출한다(레지스트리/경로 오타를 잡는 지점).
export function sfxUrl(name: SfxName): string {
  return audioUrl(SFX_FILES[name])
}
export function bgmUrl(name: BgmName): string {
  return audioUrl(BGM_FILES[name])
}

// 볼륨은 항상 0~1 로 묶는다(밖에서 어떤 값이 와도 안전).
function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

// 개발 중에만 콘솔 경고(운영 빌드에선 침묵). 사운드는 연출이라 실패해도 게임은 멈추지 않는다.
function devWarn(message: string): void {
  if (import.meta.env.DEV) console.warn(`[sound] ${message}`)
}

// play() 거부 중 NotAllowedError(자동재생 정책)는 정상 — 첫 사용자 상호작용 후 풀린다. 그 외만 알린다.
function warnPlayFailure(kind: 'sfx' | 'bgm', name: string, e: unknown): void {
  const errName = (e as { name?: string } | null)?.name
  if (errName === 'NotAllowedError') return
  devWarn(`${kind} play failed: ${name} (${errName ?? 'unknown'})`)
}

// 같은 효과음의 동시 보이스 상한. 풀에서 이만큼까지 겹쳐 울리고(연타), 초과 시 가장 오래된 보이스를 재시작한다.
const SFX_POOL_SIZE = 4

// 풀에서 재생할 보이스 선택(순수 정책 — 부수효과는 인자 create/pool 로 한정해 단위 테스트 가능).
//   ① 멈춰 있는(끝났거나 미재생) 보이스 재사용 → ② 상한 미만이면 새 보이스 생성·추가
//   → ③ 상한 도달 시 가장 오래된 보이스 재사용(동시 보이스 수를 상한으로 고정).
export function acquireVoice<T extends { paused: boolean }>(
  pool: T[],
  maxSize: number,
  create: () => T,
): T {
  const free = pool.find((v) => v.paused)
  if (free) return free
  if (pool.length < maxSize) {
    const voice = create()
    pool.push(voice)
    return voice
  }
  return pool[0]
}

type PlayOptions = {
  // 이 재생 한 번의 상대 볼륨(0~1). 카테고리 마스터 볼륨과 곱해진다.
  volume?: number
}

class SoundManager {
  // SFX 는 사운드별 보이스 풀(HTMLAudioElement 배열)을 두고 재사용한다 — 무한 복제 없이 겹침을 허용한다.
  private readonly sfxPools = new Map<SfxName, HTMLAudioElement[]>()
  private bgm: HTMLAudioElement | null = null
  private currentBgm: BgmName | null = null
  private muted = false
  private sfxVolume = 0.5
  private bgmVolume = 0.5

  // 짧은 효과음 재생. 풀에서 보이스를 빌려(없으면 상한까지 생성) 연타해도 끊기지 않게 겹쳐 튼다.
  playSfx(name: SfxName, opts: PlayOptions = {}): void {
    if (typeof Audio === 'undefined') return
    let pool = this.sfxPools.get(name)
    if (!pool) {
      // 첫 호출에 보이스 하나를 미리 만들어 로드를 데운다(음소거여도 프리로드).
      pool = [this.createSfxVoice(name)]
      this.sfxPools.set(name, pool)
    }
    if (this.muted) return
    const voice = acquireVoice(pool, SFX_POOL_SIZE, () => this.createSfxVoice(name))
    voice.volume = clamp01((opts.volume ?? 1) * this.sfxVolume)
    try {
      // 끝났거나 재생 중인 보이스를 처음부터 다시 튼다(아직 로드 전이면 throw → currentTime 은 이미 0 이라 무시).
      voice.currentTime = 0
    } catch {
      /* 메타데이터 미로드 — 되감을 필요 없음 */
    }
    void voice.play().catch((e: unknown) => warnPlayFailure('sfx', name, e))
  }

  // 풀에 넣을 새 보이스(같은 src). 로드 실패(파일명 오타·404)는 개발 중 경고로 드러낸다.
  private createSfxVoice(name: SfxName): HTMLAudioElement {
    const el = new Audio(sfxUrl(name))
    el.preload = 'auto'
    el.addEventListener('error', () =>
      devWarn(`sfx load failed: ${name} (${sfxUrl(name)})`),
    )
    return el
  }

  // 배경음악 재생(루프). 같은 곡이 이미 재생 중이면 볼륨만 갱신하고 끊지 않는다.
  playBgm(name: BgmName, opts: PlayOptions = {}): void {
    if (typeof Audio === 'undefined') return
    const volume = clamp01((opts.volume ?? 1) * this.bgmVolume)
    if (this.currentBgm === name && this.bgm) {
      this.bgm.volume = volume
      return
    }
    this.stopBgm()
    const el = new Audio(bgmUrl(name))
    el.loop = true
    el.preload = 'auto'
    el.volume = volume
    el.addEventListener('error', () =>
      devWarn(`bgm load failed: ${name} (${bgmUrl(name)})`),
    )
    this.bgm = el
    this.currentBgm = name
    if (!this.muted) void el.play().catch((e: unknown) => warnPlayFailure('bgm', name, e))
  }

  // 배경음악 정지(처음으로 되감음).
  stopBgm(): void {
    if (this.bgm) {
      this.bgm.pause()
      this.bgm.currentTime = 0
    }
    this.bgm = null
    this.currentBgm = null
  }

  // 음소거 토글 — BGM 은 즉시 멈추거나 이어서 재생한다(SFX 는 다음 재생부터 적용).
  setMuted(muted: boolean): void {
    this.muted = muted
    if (!this.bgm) return
    if (muted) this.bgm.pause()
    else void this.bgm.play().catch(() => {})
  }

  toggleMuted(): boolean {
    this.setMuted(!this.muted)
    return this.muted
  }

  get isMuted(): boolean {
    return this.muted
  }

  // 카테고리별 마스터 볼륨(0~1). BGM 은 재생 중이면 즉시 반영한다.
  setSfxVolume(volume: number): void {
    this.sfxVolume = clamp01(volume)
  }
  setBgmVolume(volume: number): void {
    this.bgmVolume = clamp01(volume)
    if (this.bgm) this.bgm.volume = this.bgmVolume
  }
}

// 앱 전역에서 공유하는 단일 인스턴스(스토어 싱글톤과 같은 패턴) — 어디서든 sound.playSfx(...) 로 제어한다.
export const sound = new SoundManager()
