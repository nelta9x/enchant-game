// @theme 색 토큰(--color-*, index.css)을 런타임에 1회 해석해 구체 색 문자열로 돌려준다.
// motion 의 색 키프레임처럼 var(...) 문자열을 보간하지 못하는 소비처가, 토큰과 동기화된 실제 값을
// hex 재하드코딩 없이 쓰게 한다(색의 단일 출처는 index.css — CLAUDE.md 규약).
//
// 캐시는 정적이다 — 현재 코드베이스에 런타임 테마 전환 경로가 없다(hitSparks 의 팔레트 캐시와 동일 전제).
// 테마 토글을 도입하면 캐시 무효화가 필요하다.
//
// 해석 불가(비브라우저·미정의 토큰)면 var(...) 문자열로 폴백한다 — 정적 색으로는 그대로 동작하고,
// 키프레임 보간만 끊겨(점프) 연출이 저하될 뿐 깨지지 않는다(폴백 hex 를 두면 그게 또 사본이 된다).
const cache = new Map<string, string>()

export function cssColorToken(name: string): string {
  const hit = cache.get(name)
  if (hit !== undefined) return hit
  const fallback = `var(${name})`
  if (typeof document === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
  const resolved = value || fallback
  cache.set(name, resolved)
  return resolved
}
