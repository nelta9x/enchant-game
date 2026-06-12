// 스프라이트 프리디코더 — 곧 표시될 가능성이 높은 이미지를 미리 로드+디코드해 둔다.
// <img src> 교체 순간(강화 성공·파괴 후 새 검 등장) 브라우저가 메인 스레드에서 동기 디코드를
// 하면 그 프레임이 통째로 끊긴다(대형 PNG·모바일 WebKit 에서 특히 큼) — 검이 정해진 직후의
// 한가한 시점에 미리 받아 디코드까지 끝내 두면 교체 프레임엔 그릴 일만 남는다.
//
// Image 참조를 캐시에 붙들어 두는 이유: 참조가 사라지면 브라우저가 디코드 결과를 버릴 수 있어
// 정작 표시 시점에 다시 디코드하게 된다. URL 키로 중복 요청도 막는다(재호출은 no-op).
// DOM(Image)을 만지므로 순수 URL 변환(lib/sprites.ts — vitest node 환경에서도 안전해야 함)과
// 분리된 모듈로 둔다.

const cache = new Map<string, HTMLImageElement>()

export function preloadImage(url: string): void {
  if (typeof Image === 'undefined' || cache.has(url)) return
  const img = new Image()
  img.src = url
  cache.set(url, img)
  // decode 실패(미지원·손상)는 무해 — 로드만으로도 HTTP 캐시는 데워지고, 표시는 <img>가 알아서 한다.
  img.decode().catch(() => {})
}
