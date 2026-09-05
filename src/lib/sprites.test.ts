import { describe, it, expect } from 'vitest'
import { uiSpritePath, uiSpriteUrl } from './sprites'

// UI 스프라이트 URL 조립 — 파일 존재 검증은 데이터(상점 티어 sprite) 쪽 테스트(DataManager.test)가 맡는다.
describe('uiSpriteUrl', () => {
  it('URL 은 BASE_URL 뒤에 public 상대 경로(sprites/ui/<파일명>)를 그대로 잇는다', () => {
    expect(uiSpritePath('shop_lv1.png')).toBe('sprites/ui/shop_lv1.png')
    expect(uiSpriteUrl('shop_lv1.png').endsWith('sprites/ui/shop_lv1.png')).toBe(true)
  })
})
