import type { CommissionConfig, ShopItem, SwordData } from './types'
import { loadSwords } from './loadSwords'
import { loadShop } from './loadShop'
import { loadCommission } from './loadCommission'

// 중앙 데이터 관리자.
// 게임이 켜질 때 load()로 데이터를 적재하고, 모든 게임 데이터는
// 이 매니저를 통해서만 접근한다(데이터의 단일 출처).
export class DataManager {
  private swords: readonly SwordData[] = []
  private shop: readonly ShopItem[] = []
  private commission: CommissionConfig | null = null
  private loaded = false

  // 데이터 파일(sources/*.json)을 검증·적재한다(동기).
  // 데이터 소스는 코드 상수가 아니라 별도 데이터 파일이며, loadSwords()/loadShop()이
  // 파일을 읽어 런타임 검증을 거친 도메인 타입으로 만든다.
  // 원격/비동기 로드가 필요해지면 이 메서드만 async로 전환하면 된다.
  load(): void {
    this.swords = loadSwords()
    this.shop = loadShop()
    this.commission = loadCommission()
    this.loaded = true
  }

  private ensureLoaded(): void {
    if (!this.loaded) {
      throw new Error(
        'DataManager is not loaded. Call load() at game startup first.',
      )
    }
  }

  getSwords(): readonly SwordData[] {
    this.ensureLoaded()
    return this.swords
  }

  // 검 식별자(id = 인벤토리 itemId)로 조회. 검의 정식(유일) 조회 경로 — 레벨을 문자열에서 파싱하지 않는다.
  getSwordById(id: string): SwordData | undefined {
    this.ensureLoaded()
    return this.swords.find((s) => s.id === id)
  }

  // 상점 판매 목록(데이터 순서 유지). 상점 UI가 그대로 순회해 렌더한다.
  getShopItems(): readonly ShopItem[] {
    this.ensureLoaded()
    return this.shop
  }

  // 특정 항목 id(SKU)의 상점 항목(없으면 undefined). 구매 검증/가격 조회에 사용.
  getShopItem(id: string): ShopItem | undefined {
    this.ensureLoaded()
    return this.shop.find((s) => s.id === id)
  }

  // 의뢰 시스템 튜닝 설정. commissionStore 셸이 읽어 순수 reducer 에 주입한다(load 이후 호출 보장).
  getCommissionConfig(): CommissionConfig {
    this.ensureLoaded()
    // loaded 면 commission 은 항상 채워져 있다(load 가 셋 다 적재). 방어적 non-null.
    return this.commission as CommissionConfig
  }
}

// 앱 전역에서 공유하는 단일 인스턴스. main.tsx에서 시작 시 load() 한다.
export const dataManager = new DataManager()
