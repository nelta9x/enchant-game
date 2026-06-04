// 검 재료 itemId 규약: `sword_<level>` (레벨이 곧 정체성, 로케일 독립).
// 검 인벤토리 표시(lib/items)와 검 데이터 무결성 검증(loadSwords)이 함께 쓰는 단일 출처 —
// 정규식을 양쪽에서 따로 선언하지 않는다. 파싱 방향만 둔다(코드가 sword_<level> 를
// *생성*하는 곳은 없어 빌더는 두지 않는다). 의존이 없는 leaf 라, loadSwords 가 이 모듈을
// import 해도 lib→data 방향 순환이 생기지 않는다.
const SWORD_ITEM_RE = /^sword_(\d+)$/

// itemId 가 검 재료(sword_<level>)면 해당 레벨, 아니면 null.
export function swordItemLevel(itemId: string): number | null {
  const m = SWORD_ITEM_RE.exec(itemId)
  return m ? Number(m[1]) : null
}
