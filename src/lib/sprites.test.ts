import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { UI_SPRITES, uiSpritePath, uiSpriteUrl } from './sprites'

// UI 스프라이트 무결성: UI_SPRITES 에 등록된 모든 파일이 public/sprites/ui/ 에 실제 PNG 로 존재해야 한다
// (아이템·검 스프라이트 무결성 테스트(DataManager.test)와 같은 취지 — 파일명 오타·누락 → 깨진 아이콘 방지).
describe('UI 스프라이트 ↔ 파일 무결성', () => {
  it('등록된 모든 UI 스프라이트 파일이 존재한다', () => {
    const names = Object.keys(UI_SPRITES) as (keyof typeof UI_SPRITES)[]
    expect(names.length).toBeGreaterThan(0)
    for (const name of names) {
      expect(
        existsSync(resolve('public', uiSpritePath(name))),
        `'${name}' 스프라이트 파일이 없다: ${uiSpritePath(name)}`,
      ).toBe(true)
    }
  })

  it('URL 은 BASE_URL 뒤에 public 상대 경로를 그대로 잇는다', () => {
    expect(uiSpriteUrl('shop').endsWith(uiSpritePath('shop'))).toBe(true)
  })
})
