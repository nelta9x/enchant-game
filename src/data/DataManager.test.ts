import { describe, it, expect } from 'vitest'
import { DataManager } from './DataManager'
import { loadSwords } from './loadSwords'
import { ko } from '../i18n/locales/ko'

describe('DataManager', () => {
  it('load() 호출 전 조회하면 에러를 던진다', () => {
    const dm = new DataManager()
    expect(() => dm.getSwords()).toThrow()
    expect(() => dm.getSwordByLevel(0)).toThrow()
  })

  it('load() 후 전체 검 데이터를 조회할 수 있다', () => {
    const dm = new DataManager()
    dm.load()
    expect(dm.getSwords()).toHaveLength(loadSwords().length)
    expect(dm.getSwordByLevel(0)?.level).toBe(0)
    expect(dm.getSwordByLevel(29)?.level).toBe(29)
  })

  it('존재하지 않는 단계 조회 시 undefined를 반환한다', () => {
    const dm = new DataManager()
    dm.load()
    expect(dm.getSwordByLevel(999)).toBeUndefined()
  })
})

// seam 테스트: 데이터(언어 중립)와 i18n(표시)의 연결을 강제한다.
// 검 데이터의 모든 nameKey가 실제 번역 리소스에 존재해야 한다.
// → 데이터에 표시명을 박지 않는 구조(원칙1·2)를 런타임에서 검증한다.
describe('검 데이터 ↔ i18n 무결성', () => {
  it('모든 검 nameKey가 번역 리소스에 존재한다', () => {
    const dm = new DataManager()
    dm.load()
    const keys = Object.keys(ko)
    for (const sword of dm.getSwords()) {
      expect(keys).toContain(sword.nameKey)
    }
  })
})
