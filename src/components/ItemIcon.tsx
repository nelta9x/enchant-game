import { dataManager } from '../data/DataManager'
import { itemSpriteName } from '../lib/items'
import { defaultSpriteUrl, itemSpriteUrl, swordSpriteUrl } from '../lib/sprites'
import { SpriteCanvas } from './SpriteCanvas'

// 아이템 한 칸의 아이콘 — 검은 전용 스프라이트, 그 외(파괴보호장치·잡템)도 전용 스프라이트가 있으면 그것을,
// 없으면 default.png 로 폴백한다(모든 아이템에 스프라이트가 있다는 전제 — 누락 시 default). canvas(SpriteCanvas)로
// 그려 spriteStore 의 ImageBitmap 풀을 재사용한다(<img src> 교체 디코드/업로드 회피 — 강화로 장착검·비용·보상이
// 바뀔 때 이득). "검이냐 / 스프라이트가 있냐" 결정을 한 곳에 둔다(원칙 2: 검 조회는 DataManager, 아이템
// 스프라이트는 lib/items 매핑). 크기는 className(h-*/w-*)으로 지정. alt 는 스프라이트의 대체 텍스트 —
// 인접 텍스트가 이름을 이미 읽어 주는 곳에선 빈 문자열로 둔다.
type ItemIconProps = { itemId: string; alt?: string; className?: string }

export function ItemIcon({
  itemId,
  alt = '',
  className = 'h-7 w-7',
}: ItemIconProps) {
  const sword = dataManager.getSwordById(itemId)
  const itemSprite = sword ? undefined : itemSpriteName(itemId)
  // 검 → 검 스프라이트, 그 외 → 아이템 스프라이트, 둘 다 없으면 default.png(스토어 폴백과 동일 이미지).
  const url = sword
    ? swordSpriteUrl(sword.sprite)
    : itemSprite
      ? itemSpriteUrl(itemSprite)
      : defaultSpriteUrl()
  return <SpriteCanvas url={url} alt={alt} className={`${className} shrink-0`} />
}
