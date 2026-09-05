import { describe, it, expect } from 'vitest'
import {
  SFX_NAMES,
  BGM_NAMES,
  sfxAsset,
  bgmAsset,
  assertAudioAssets,
  decodeDataUrl,
  scheduleAt,
} from './sound'

// SoundManager 의 재생은 Web Audio 사이드이펙트라 단위 테스트 대상이 아니다(sprites 와 동일한 경계).
// 대신 "레지스트리 이름 → 번들 자산" 해석과 순수 헬퍼(base64 디코드·스케줄 환산)를 검증해 등록·파일명 오타와
// 타이밍 산식 회귀를 잡는다.
describe('오디오 레지스트리 — 번들 자산 해석', () => {
  it('모든 효과음 이름이 번들된 data URL 로 해석된다', () => {
    expect(SFX_NAMES.length).toBeGreaterThan(0)
    for (const name of SFX_NAMES) {
      const asset = sfxAsset(name)
      expect(asset, name).toBeDefined()
      expect(asset!.startsWith('data:')).toBe(true)
    }
  })

  it('BGM 레지스트리도 같은 규약으로 해석된다(현재 비어 있어도 무해)', () => {
    for (const name of BGM_NAMES) expect(bgmAsset(name)).toBeDefined()
  })

  it('assertAudioAssets 는 레지스트리가 전부 해석되면 throw 하지 않는다', () => {
    expect(() => assertAudioAssets()).not.toThrow()
  })
})

describe('decodeDataUrl — base64 data URL → 바이트(순수)', () => {
  it('base64 본문을 원래 바이트로 복원한다', () => {
    const bytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 255, 7])
    const b64 = Buffer.from(bytes).toString('base64')
    const out = new Uint8Array(decodeDataUrl(`data:audio/wav;base64,${b64}`))
    expect([...out]).toEqual([...bytes])
  })

  it('base64 가 아닌 data URL 은 거부한다', () => {
    expect(() => decodeDataUrl('data:text/plain,hello')).toThrow()
  })
})

describe('scheduleAt — 예정 시각 → AudioContext 시간축(순수)', () => {
  it('미래 예정은 남은 시간만큼 뒤에 건다', () => {
    expect(scheduleAt(10, 1000, 1325)).toBeCloseTo(10.325)
  })

  it('이미 지난 예정은 지금(ctxNow)이다 — 늦은 디코드는 즉시 재생', () => {
    expect(scheduleAt(10, 2000, 1325)).toBe(10)
  })
})
