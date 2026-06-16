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
    expect(() => dm.getSwordById('sword_1')).toThrow()
  })

  it('load() 후 전체 검 데이터를 조회할 수 있다', () => {
    const dm = new DataManager()
    dm.load()
    expect(dm.getSwords()).toHaveLength(loadSwords().length)
  })

  it('id로 검을 조회한다(정식·유일 식별 경로) — 없는 id·잡템은 undefined', () => {
    const dm = new DataManager()
    dm.load()
    expect(dm.getSwordById('sword_1')?.id).toBe('sword_1')
    expect(dm.getSwordById('sword_1')?.level).toBe(1)
    // 최종 단계는 sword_30(엑스칼리버) — sword_29 는 +30 으로 강화된다.
    expect(dm.getSwordById('sword_30')?.level).toBe(30)
    expect(dm.getSwordById('sword_30')?.nextId).toBeNull()
    expect(dm.getSwordById('sword_29')?.nextId).toBe('sword_30')
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

  it('load() 후 아이템 카탈로그를 조회할 수 있다(검은 카탈로그가 아님)', () => {
    const dm = new DataManager()
    dm.load()
    expect(dm.getItems().length).toBeGreaterThan(0)
    expect(dm.getItemById('iron_scrap')?.basePrice).toBeGreaterThanOrEqual(0)
    expect(dm.getItemById('sword_3')).toBeUndefined() // 검은 카탈로그에 없다
    expect(dm.getItemById('nonexistent')).toBeUndefined()
  })

  it('getItemBasePrice: 검은 sellPrice, 재료는 basePrice, 둘 다 없으면 undefined', () => {
    const dm = new DataManager()
    dm.load()
    // 판매 가능 검 → sellPrice 가 기준가.
    expect(dm.getItemBasePrice('sword_3')).toBe(
      dm.getSwordById('sword_3')?.sellPrice,
    )
    // 재료 → 카탈로그 basePrice.
    expect(dm.getItemBasePrice('iron_scrap')).toBe(
      dm.getItemById('iron_scrap')?.basePrice,
    )
    // 판매 불가 검(sword_1 = 시작 검, sellPrice=null)·미지의 id → undefined.
    expect(dm.getItemBasePrice('sword_1')).toBeUndefined()
    expect(dm.getItemBasePrice('nonexistent')).toBeUndefined()
  })

  it('getMaxSwordLevel: 검 데이터의 최대 level 을 반환한다(진행도 바 칸 수·목표치)', () => {
    const dm = new DataManager()
    dm.load()
    const expected = dm
      .getSwords()
      .reduce((max, s) => Math.max(max, s.level), 0)
    expect(dm.getMaxSwordLevel()).toBe(expected)
  })

  it('getSwordByLevel: 레벨로 검을 조회한다(레벨↔검 1:1) — 범위 밖은 undefined', () => {
    const dm = new DataManager()
    dm.load()
    expect(dm.getSwordByLevel(0)).toBeUndefined() // 레벨 0(시작 검 이전)은 더 이상 없다
    expect(dm.getSwordByLevel(1)?.id).toBe('sword_1')
    expect(dm.getSwordByLevel(23)?.level).toBe(23)
    expect(dm.getSwordByLevel(30)?.id).toBe('sword_30')
    expect(dm.getSwordByLevel(31)).toBeUndefined()
    expect(dm.getSwordByLevel(-1)).toBeUndefined()
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
      if (sword.enchantCost?.kind === 'item') ids.add(sword.enchantCost.itemId)
      for (const d of sword.dropOnFail) ids.add(d.itemId)
    }
    for (const item of dataManager.getShopItems()) {
      ids.add(item.itemId)
      if (item.price.kind === 'item') ids.add(item.price.itemId)
    }
    // 거래에 등장하는 모든 아이템(아이템 비용의 납품 아이템 + 아이템 보상의 지급 아이템)도 아이콘으로 표시되므로 함께 검증한다.
    for (const bucket of dataManager.getCommissionConfig().buckets) {
      for (const e of bucket.items) {
        if (e.costKind !== 'gold') ids.add(e.itemId)
        if (e.rewardKind === 'item') ids.add(e.rewardItemId)
      }
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

// 검 아이콘 무결성: 라이브 데이터의 모든 검(SwordData.sprite)이 public/sprites/swords/ 에 실제 PNG 로
// 존재해야 한다. 위 아이템 블록은 검 스프라이트를 의도적으로 제외하므로, 검 파일명 오타·누락 → 깨진
// 이미지를 잡아줄 곳이 여기 외에 없다(스프라이트 전면 교체 시 회귀 가드).
describe('검 아이콘 ↔ 스프라이트 무결성', () => {
  it('라이브 데이터의 모든 검에 전용 스프라이트 파일이 존재한다', () => {
    dataManager.load()
    const swords = dataManager.getSwords()
    expect(swords.length).toBeGreaterThan(0) // 검증 대상이 비어 통과하는 일이 없게 가드
    for (const sword of swords) {
      expect(
        existsSync(resolve('public/sprites/swords', sword.sprite)),
        `'${sword.id}' 스프라이트 파일이 없다: ${sword.sprite}`,
      ).toBe(true)
    }
  })
})

// 강화 비용 점진성: 재료(item) 비용이 고단계 전용으로 "갑자기" 등장하지 않고 중반(10레벨대 이하)에도
// 한 번은 도입돼 있어야 한다 — 플레이어가 본격 재료 비용(고단계) 전에 "재료도 비용이 된다"를 학습할
// 자리를 보장하는 디자인 불변식. 도입 레벨·수량(count)은 디자이너 튜닝 영역이라 단언하지 않고(toBe 금지),
// "10레벨대 이하에 item 비용 검이 1개 이상 존재"라는 구조/방향만 검증한다.
describe('강화 비용 점진성', () => {
  it('재료(item) 비용이 10레벨대 이하(level <= 19)에 1개 이상 도입돼 있다', () => {
    dataManager.load()
    const midGameItemCost = dataManager
      .getSwords()
      .filter((s) => s.level <= 19 && s.enchantCost?.kind === 'item')
    expect(midGameItemCost.length).toBeGreaterThan(0)
  })

  // soft-lock 가드: 잡템(비-검) 재료를 비용으로 요구하는 검은, 그 재료를 도입 레벨 도달 전에 얻을 수단이
  // 반드시 있어야 한다 — 더 낮은 레벨의 실패 드랍(dropOnFail)에 등장하거나, 상점에서 구매 가능하거나.
  // 재료가 그 레벨 이상에서만 나오면 도착 즉시 막히는 데드락이 된다(검 itemId='재료검'은 드랍이 아니라
  // 강화·보관으로 얻으므로 이 가드 대상에서 제외).
  it('재료 비용으로 쓰는 잡템은 도입 레벨 이전에 드랍되거나 상점에서 살 수 있다', () => {
    dataManager.load()
    const swords = dataManager.getSwords()
    const buyable = new Set(
      dataManager
        .getShopItems()
        .map((s) => s.itemId)
        .filter((id) => dataManager.getSwordById(id) === undefined),
    )
    for (const sword of swords) {
      const cost = sword.enchantCost
      if (cost?.kind !== 'item') continue
      // 검 재료(재료검)는 드랍이 아니라 강화/보관으로 얻으므로 제외 — 잡템 재료만 검사.
      if (dataManager.getSwordById(cost.itemId) !== undefined) continue
      const dropsEarlier = swords.some(
        (s) =>
          s.level < sword.level &&
          s.dropOnFail.some((d) => d.itemId === cost.itemId),
      )
      expect(
        dropsEarlier || buyable.has(cost.itemId),
        `'${sword.id}'(level ${sword.level})의 재료 비용 '${cost.itemId}'를 도달 전에 얻을 수단이 없다`,
      ).toBe(true)
    }
  })
})

// 아이템 카탈로그(items.json)의 모든 nameKey 가 번역 리소스에 존재해야 한다(검 규약과 동일).
describe('아이템 카탈로그 ↔ i18n 무결성', () => {
  it('모든 ItemData nameKey 가 번역 리소스에 존재한다', () => {
    dataManager.load()
    const keys = Object.keys(ko)
    for (const item of dataManager.getItems()) {
      expect(keys).toContain(item.nameKey)
    }
  })
})

// 의뢰 버킷에 출제되는 모든 itemId 는 표시명으로 해석 가능해야 한다(검 또는 카탈로그 아이템).
describe('의뢰 데이터 ↔ 표시명 무결성', () => {
  it('모든 버킷의 모든 출제 itemId 가 표시 가능하다', () => {
    dataManager.load()
    for (const bucket of dataManager.getCommissionConfig().buckets) {
      for (const e of bucket.items) {
        if (e.costKind !== 'gold')
          expect(isDisplayableItemId(e.itemId), `'${e.itemId}'`).toBe(true)
        if (e.rewardKind === 'item')
          expect(
            isDisplayableItemId(e.rewardItemId),
            `'${e.rewardItemId}'`,
          ).toBe(true)
      }
    }
  })
})
