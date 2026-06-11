// 로더 공통의 기초 검증 유틸 — 각 로더(load*.ts)가 똑같이 복제하던 fail/isRecord 보일러플레이트를
// 한 곳에 둔다. 도메인별 에러 접두사는 makeFail(domain) 으로 유지해 기존 에러 메시지 형식
// ("<domain> validation failed: ...")이 변하지 않는다. 필드별 의미 검증(숫자 범위·관계 등)은
// 도메인마다 제약이 달라 각 로더가 계속 소유한다.

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// 도메인 접두사가 붙은 검증 실패 thrower 를 만든다.
// 사용처는 반환값을 `(msg: string) => never` 로 명시 선언해야 TS 제어 흐름 분석이
// fail() 호출 뒤를 도달 불가로 좁힌다(never 반환 인식 규칙).
export function makeFail(domain: string): (msg: string) => never {
  return (msg) => {
    throw new Error(`${domain} validation failed: ${msg}`)
  }
}
