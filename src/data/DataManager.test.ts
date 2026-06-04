import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { DataManager, dataManager } from './DataManager'
import { loadSwords } from './loadSwords'
import { ko } from '../i18n/locales/ko'
import { isDisplayableItemId, itemSpriteName } from '../lib/items'

describe('DataManager', () => {
  it('load() 호출 전 조회하면 에러를 던진다', () => {
    const dm = new DataManager()
    expect(() => dm.getSwords()).toThrow()
    expect(() => dm.getSwordById('sword_0')).toThrow()
  })

  it('load() 후 전체 검 데이터를 조회할 수 있다', () => {
    const dm = new DataManager()
    dm.load()
    expect(dm.getSwords()).toHaveLength(loadSwords().length)
  })

  it('id로 검을 조회한다(정식·유일 식별 경로) — 없는 id·잡템은 undefined', () => {
    const dm = new DataManager()
    dm.load()
    expect(dm.getSwordById('sword_0')?.id).toBe('sword_0')
    expect(dm.getSwordById('sword_0')?.level).toBe(0)
    expect(dm.getSwordById('sword_29')?.level).toBe(29)
    expect(dm.getSwordById('sword_29')?.nextId).toBeNull()
    expect(dm.getSwordById('sword_999')).toBeUndefined()
    expect(dm.getSwordById('protection_ticket')).toBeUndefined()
  })

  it('load() 호출 전 상점 조회하면 에러를 던진다', () => {
    const dm = new DataManager()
    expect(() => dm.getShopItems()).toThrow()
    expect(() => dm.getShopItem('protection_ticket')).toThrow()
  })

  it('load() 후 상점 항목을 항목 id(SKU)로 조회할 수 있다', () => {
    const dm = new DataManager()
    dm.load()
    expect(dm.getShopItems().length).toBeGreaterThan(0)
    expect(dm.getShopItem('protection_ticket_gold')?.itemId).toBe(
      'protection_ticket',
    )
    // itemId는 항목 id가 아니므로 조회되지 않는다.
    expect(dm.getShopItem('protection_ticket')).toBeUndefined()
    expect(dm.getShopItem('nonexistent')).toBeUndefined()
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

// 상점 itemId 도 표시명으로 해석 가능해야 한다(검 규약 또는 알려진 아이템 키).
// loadShop 은 구조 검증만 하므로(데이터→뷰 결합 회피), 표시명 무결성은 이 시드 테스트가
// 강제한다 — 미해석 itemId 는 런타임에 원문이 노출되어 원칙1(다국어)을 위반한다.
describe('상점 데이터 ↔ i18n 무결성', () => {
  it('모든 상점 itemId(지급 + 아이템 가격)가 표시명으로 해석 가능하다', () => {
    // isDisplayableItemId 의 검 경로는 공유 DataManager 인스턴스를 참조하므로 적재한다.
    dataManager.load()
    for (const item of dataManager.getShopItems()) {
      expect(isDisplayableItemId(item.itemId)).toBe(true)
      if (item.price.kind === 'item')
        expect(isDisplayableItemId(item.price.itemId)).toBe(true)
    }
  })
})

// 아이콘 무결성: 라이브 데이터에 등장하는 모든 비-검 아이템(강화 재료·실패 드랍·상점 지급/가격)은
// 전용 스프라이트로 표시돼야 한다(원칙1: 토큰 폴백이 아닌 실제 아이콘). itemSpriteName 매핑이 있는지
// + 그 PNG 가 public/sprites/items/ 에 실제로 존재하는지까지 검증한다(파일명 오타·누락 → 깨진 이미지 방지).
// 검 itemId 는 SwordData.sprite 로 표시되므로 제외한다.
describe('아이템 아이콘 ↔ 스프라이트 무결성', () => {
  it('라이브 데이터의 모든 비-검 아이템에 전용 스프라이트 파일이 존재한다', () => {
    dataManager.load()
    const ids = new Set<string>()
    for (const sword of dataManager.getSwords()) {
      if (sword.enhanceCost?.kind === 'item') ids.add(sword.enhanceCost.itemId)
      if (sword.dropOnFail) ids.add(sword.dropOnFail.itemId)
    }
    for (const item of dataManager.getShopItems()) {
      ids.add(item.itemId)
      if (item.price.kind === 'item') ids.add(item.price.itemId)
    }
    const nonSword = [...ids].filter(
      (id) => dataManager.getSwordById(id) === undefined,
    )
    expect(nonSword.length).toBeGreaterThan(0) // 검증 대상이 비어 통과하는 일이 없게 가드
    for (const id of nonSword) {
      const file = itemSpriteName(id)
      expect(file, `'${id}' 에 매핑된 스프라이트가 없다`).toBeDefined()
      expect(
        existsSync(resolve('public/sprites/items', file as string)),
        `'${id}' 스프라이트 파일이 없다: ${file}`,
      ).toBe(true)
    }
  })
})
