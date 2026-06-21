import type {
  AnimationConfig,
  CommissionConfig,
  FloatingTextData,
  FloatingTextEntry,
  ItemData,
  SwordData,
} from './types'
import { PROTECTION_TICKET_ID } from '../game/enhancer'
import { loadSwords } from './loadSwords'
import { loadItems } from './loadItems'
import { loadCommission } from './loadCommission'
import { loadFloatingText } from './loadFloatingText'
import { loadAnimation } from './loadAnimation'

// 중앙 데이터 관리자.
// 게임이 켜질 때 load()로 데이터를 적재하고, 모든 게임 데이터는
// 이 매니저를 통해서만 접근한다(데이터의 단일 출처).
export class DataManager {
  private swords: readonly SwordData[] = []
  private items: readonly ItemData[] = []
  private commission: CommissionConfig | null = null
  private floatingText: FloatingTextData = {}
  private animation: AnimationConfig | null = null
  private loaded = false

  // 데이터 파일(public/data/*.json)을 검증·적재한다(동기).
  // 데이터 소스는 코드 상수가 아니라 별도 데이터 파일이며, loadSwords()/loadItems()이
  // 파일을 읽어 런타임 검증을 거친 도메인 타입으로 만든다.
  // 원격/비동기 로드가 필요해지면 이 메서드만 async로 전환하면 된다.
  //
  // 로드 순서: 검·아이템 카탈로그를 먼저, 의뢰를 나중에 — loadCommission 검증이
  // "의뢰 itemId 가 판매 가능한 검이거나 아이템 카탈로그에 존재하는가"를 강제하므로
  // 알려진 itemId 집합(knownItemIds)을 먼저 만들어 주입한다(sword_1 등 비판매 검 출제 차단).
  load(): void {
    this.swords = loadSwords()
    this.items = loadItems()
    const knownItemIds = new Set<string>()
    for (const s of this.swords)
      if (s.sellPrice !== null) knownItemIds.add(s.id)
    for (const it of this.items) knownItemIds.add(it.id)
    // 파괴보호장치(파괴방지권)는 재료 카탈로그(items.json)에 없는 특수 소비재지만(lib/items 의 carve-out),
    // 거래 제안 보상으로 정당히 지급되므로 출제 집합에 명시적으로 등록한다(기준가 없는 고정 지급 아이템).
    knownItemIds.add(PROTECTION_TICKET_ID)
    this.commission = loadCommission(knownItemIds)
    // 플로팅 텍스트 연출 데이터 — 검·아이템·의뢰와 무관(이벤트 키 → 문구만)이라 순서 제약 없음.
    this.floatingText = loadFloatingText()
    // 강화 연출 타이밍 설정(망치 임팩트·떨림 범위·재강화 가드) — 다른 데이터와 무관한 독립 스칼라라 순서 제약 없음.
    this.animation = loadAnimation()
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

  // 도달 가능한 최고 강화 레벨(검 데이터의 최대 level). 진행도 바의 "칸 수"이자 목표치 — 상수(30) 대신
  // 데이터에서 도출한다(검 단계를 늘리면 칸 수도 자동으로 따라간다).
  getMaxSwordLevel(): number {
    this.ensureLoaded()
    return this.swords.reduce((max, s) => Math.max(max, s.level), 0)
  }

  // 레벨로 검을 조회한다(레벨↔검은 1:1 — loadSwords 가 중복 레벨을 막는다). "최고 도달치"(레벨)만으로
  // 그 기록을 세운 검을 되찾는 데 쓴다 — 별도 상태를 저장할 필요 없이 maxLevelReached 에서 파생한다.
  // id 에서 레벨을 파싱하지 않는 정식 경로(getSwordById 의 짝). 범위 밖 레벨은 undefined.
  getSwordByLevel(level: number): SwordData | undefined {
    this.ensureLoaded()
    return this.swords.find((s) => s.level === level)
  }

  // 아이템 카탈로그(검이 아닌 재료 등). 표시명/스프라이트 해석(lib/items)이 검 다음으로 조회한다.
  getItems(): readonly ItemData[] {
    this.ensureLoaded()
    return this.items
  }

  // itemId 로 카탈로그 아이템 조회(검·미지의 id 는 undefined).
  getItemById(id: string): ItemData | undefined {
    this.ensureLoaded()
    return this.items.find((i) => i.id === id)
  }

  // 의뢰 보상 산정 기준가. 검은 sellPrice(판매 가능 검만 non-null), 그 외는 카탈로그 basePrice.
  // 둘 다 없으면 undefined(의뢰 풀 구성 시 방어적으로 제외된다).
  getItemBasePrice(itemId: string): number | undefined {
    this.ensureLoaded()
    const sword = this.getSwordById(itemId)
    if (sword && sword.sellPrice !== null) return sword.sellPrice
    return this.getItemById(itemId)?.basePrice
  }

  // 의뢰 시스템 튜닝 설정. commissionStore 셸이 읽어 순수 reducer 에 주입한다(load 이후 호출 보장).
  getCommissionConfig(): CommissionConfig {
    this.ensureLoaded()
    // loaded 면 commission 은 항상 채워져 있다(load 가 셋 다 적재). 방어적 non-null.
    return this.commission as CommissionConfig
  }

  // 이벤트 타이밍 키(예: 'enhanceFail')의 플로팅 텍스트 후보 목록. 미설정 키·빈 슬롯은 빈 배열
  // (호출 측 pickFloatingText 가 빈 배열 → null 로 처리해 아무것도 안 띄운다).
  getFloatingTexts(eventKey: string): readonly FloatingTextEntry[] {
    this.ensureLoaded()
    return this.floatingText[eventKey] ?? []
  }

  // 강화 연출 타이밍 설정(망치 임팩트·떨림 범위·재강화 가드). GameScreen 셸이 읽어 강화 1회의 연출
  // 타임라인을 도출한다(enhanceTimeline). load 이후 호출 보장.
  getAnimation(): AnimationConfig {
    this.ensureLoaded()
    // loaded 면 animation 은 항상 채워져 있다(load 가 적재). 방어적 non-null(commission 패턴 동일).
    return this.animation as AnimationConfig
  }
}

// 앱 전역에서 공유하는 단일 인스턴스. main.tsx에서 시작 시 load() 한다.
export const dataManager = new DataManager()
