import { describe, it, expect } from 'vitest'
import { sfxUrl, acquireVoice } from './sound'

// SoundManager 의 재생은 HTMLAudio 사이드이펙트라 단위 테스트 대상이 아니다(sprites 와 동일한 경계).
// 대신 "이름 → 자산 경로" 순수 해석을 검증해, 레지스트리 파일명·디렉토리·BASE_URL 조립의 오타를 잡는다.
describe('sfxUrl — 효과음 자산 경로(순수)', () => {
  it('레지스트리 이름을 public/audio 경로로 해석(BASE_URL 접두)', () => {
    expect(sfxUrl('enhance')).toBe(
      `${import.meta.env.BASE_URL}audio/enhance_kang.wav`,
    )
  })

  it('항상 BASE_URL 로 시작하고 audio/ 디렉토리를 포함한다', () => {
    const url = sfxUrl('enhance')
    expect(url.startsWith(import.meta.env.BASE_URL)).toBe(true)
    expect(url).toContain('audio/')
  })
})

// SFX 풀 보이스 선택 정책 — 재사용/증식/상한을 결정하는 부분. (paused=멈춤 → 빌릴 수 있는 보이스)
describe('acquireVoice — SFX 풀 보이스 선택(순수)', () => {
  const voice = (paused: boolean, id: number) => ({ paused, id })

  it('빈 풀이면 새 보이스를 만들어 추가한다', () => {
    const pool: { paused: boolean; id: number }[] = []
    let made = 0
    const v = acquireVoice(pool, 4, () => voice(true, ++made))
    expect(pool).toHaveLength(1)
    expect(v).toBe(pool[0])
  })

  it('멈춘 보이스가 있으면 새로 만들지 않고 재사용한다', () => {
    const pool = [voice(false, 1), voice(true, 2)]
    let made = 0
    const v = acquireVoice(pool, 4, () => {
      made++
      return voice(true, 99)
    })
    expect(made).toBe(0)
    expect(v).toBe(pool[1]) // 멈춰 있던 보이스
    expect(pool).toHaveLength(2)
  })

  it('모두 재생 중이고 상한 미만이면 보이스를 늘린다', () => {
    const pool = [voice(false, 1), voice(false, 2)]
    const v = acquireVoice(pool, 4, () => voice(true, 3))
    expect(pool).toHaveLength(3)
    expect(v).toBe(pool[2])
  })

  it('모두 재생 중이고 상한 도달이면 가장 오래된 보이스를 재사용한다(증식 없음)', () => {
    const pool = [voice(false, 1), voice(false, 2)]
    const v = acquireVoice(pool, 2, () => voice(true, 3))
    expect(pool).toHaveLength(2) // 안 늘어남
    expect(v).toBe(pool[0]) // 가장 오래된 것
  })
})
