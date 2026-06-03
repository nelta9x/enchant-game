import type { SwordData } from './types'
import { SWORDS } from './sources/swords'

// 중앙 데이터 관리자.
// 게임이 켜질 때 load()로 데이터를 적재하고, 모든 게임 데이터는
// 이 매니저를 통해서만 접근한다(데이터의 단일 출처).
export class DataManager {
  private swords: readonly SwordData[] = []
  private loaded = false

  // 번들된 데이터 소스를 적재한다(동기).
  // 외부 JSON/원격 로드가 필요해지면 이 메서드만 async로 전환하면 된다.
  load(): void {
    this.swords = SWORDS
    this.loaded = true
  }

  private ensureLoaded(): void {
    if (!this.loaded) {
      throw new Error(
        'DataManager가 로드되지 않았습니다. 게임 시작 시 load()를 먼저 호출하세요.',
      )
    }
  }

  getSwords(): readonly SwordData[] {
    this.ensureLoaded()
    return this.swords
  }

  getSwordByLevel(level: number): SwordData | undefined {
    this.ensureLoaded()
    return this.swords.find((s) => s.level === level)
  }
}

// 앱 전역에서 공유하는 단일 인스턴스. main.tsx에서 시작 시 load() 한다.
export const dataManager = new DataManager()
