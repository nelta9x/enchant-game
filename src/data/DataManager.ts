import type { SwordData } from './types'
import { loadSwords } from './loadSwords'

// 중앙 데이터 관리자.
// 게임이 켜질 때 load()로 데이터를 적재하고, 모든 게임 데이터는
// 이 매니저를 통해서만 접근한다(데이터의 단일 출처).
export class DataManager {
  private swords: readonly SwordData[] = []
  private loaded = false

  // 데이터 파일(sources/swords.json)을 검증·적재한다(동기).
  // 데이터 소스는 코드 상수가 아니라 별도 데이터 파일이며, loadSwords()가
  // 파일을 읽어 런타임 검증을 거친 SwordData[]로 만든다.
  // 원격/비동기 로드가 필요해지면 이 메서드만 async로 전환하면 된다.
  load(): void {
    this.swords = loadSwords()
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
