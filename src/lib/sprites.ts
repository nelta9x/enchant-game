// 스프라이트 파일명 → 실제 로드 가능한 URL 변환(뷰/런타임 경계).
//
// 검 스프라이트는 public/sprites/swords/ 에 정적 자산으로 둔다.
// 데이터 레이어(SwordData.sprite)는 파일명만 들고 있고, 디렉토리 경로와
// 배포 베이스 경로(import.meta.env.BASE_URL)는 여기서 해석한다.
// → 데이터/로직은 환경 비의존(테스트 용이)으로 유지하고, URL 조립만 뷰 경계에서 처리.

const SWORD_SPRITE_DIR = 'sprites/swords/'

// BASE_URL 은 항상 '/'로 끝난다(Vite 규약). GitHub Pages 등 하위 경로 배포에서도 동작.
export function swordSpriteUrl(filename: string): string {
  return `${import.meta.env.BASE_URL}${SWORD_SPRITE_DIR}${filename}`
}
