import { describe, it, expect } from 'vitest'
import { ko } from '../i18n/locales/ko'
import {
  assertFloatingTextKeysResolve,
  loadFloatingText,
  parseFloatingText,
} from './loadFloatingText'

describe('parseFloatingText — 구조 검증(순수)', () => {
  it('정상 데이터: 이벤트 키 → 엔트리 배열(빈 배열 통과)', () => {
    const data = parseFloatingText({
      enhanceFail: [{ text: 'floatingText.enhanceFail.slip', weight: 1 }],
      enhanceSuccess: [],
    })
    expect(data.enhanceFail).toEqual([
      { text: 'floatingText.enhanceFail.slip', weight: 1 },
    ])
    expect(data.enhanceSuccess).toEqual([]) // 빈 슬롯 = 아직 안 채운 타이밍
  })

  it('루트가 객체가 아니면 throw', () => {
    expect(() => parseFloatingText([])).toThrow(/root must be an object/)
    expect(() => parseFloatingText(null)).toThrow()
  })

  it('이벤트 값이 배열이 아니면 throw', () => {
    expect(() => parseFloatingText({ e: {} })).toThrow(/must be an array/)
  })

  it('weight 가 0 이하/비유한이면 throw', () => {
    expect(() => parseFloatingText({ e: [{ text: 'k', weight: 0 }] })).toThrow(
      /weight/,
    )
    expect(() =>
      parseFloatingText({ e: [{ text: 'k', weight: Number.NaN }] }),
    ).toThrow(/weight/)
  })

  it('text 가 빈 문자열이면 throw', () => {
    expect(() => parseFloatingText({ e: [{ text: '', weight: 1 }] })).toThrow(
      /text/,
    )
  })
})

describe('assertFloatingTextKeysResolve — i18n 키 존재 검증', () => {
  it('존재하지 않는 키면 throw', () => {
    const data = parseFloatingText({ e: [{ text: 'no.such.key', weight: 1 }] })
    expect(() =>
      assertFloatingTextKeysResolve(data, new Set(Object.keys(ko))),
    ).toThrow(/missing from translation resources/)
  })

  it('실제 ko 키면 통과', () => {
    const data = parseFloatingText({ e: [{ text: 'app.title', weight: 1 }] })
    expect(() =>
      assertFloatingTextKeysResolve(data, new Set(Object.keys(ko))),
    ).not.toThrow()
  })
})

describe('loadFloatingText — 실제 데이터 무결성(통합)', () => {
  it('번들 데이터가 검증을 통과하고 모든 문구 키가 ko 에 존재한다', () => {
    const data = loadFloatingText()
    const keys = new Set(Object.keys(ko))
    for (const entries of Object.values(data))
      for (const e of entries) expect(keys.has(e.text)).toBe(true)
  })
})
