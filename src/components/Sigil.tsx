// 마법진 룬 — 바깥 링(8방향 눈금)만 남긴 정적 결계. 색은 currentColor 로 받는다
// (부모가 상태색으로 물들인다) → 보호 결계(ProtectionWard)·성공률 결계(SuccessRateSigil)·망치
// 거치대(HammerStation)가 같은 마법진을 공유한다. 64x64 viewBox 기준(부모 박스 크기에 맞춰 스케일).
// 회전 애니메이션은 제거됐다(정적) — 이전엔 CSS(.fx-spin — index.css)가 상시 회전을 소유했다.
// 안쪽 두 원(점선 r=22·실선 r=15)도 제거돼 바깥 링만 남는다.
export function SigilRunes() {
  return (
    <div aria-hidden className="absolute inset-0">
      <svg
        viewBox="0 0 64 64"
        className="h-full w-full"
        fill="none"
        stroke="currentColor"
      >
        <circle cx="32" cy="32" r="29" strokeWidth="1.4" opacity="0.85" />
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i * Math.PI) / 4
          return (
            <line
              key={i}
              x1={32 + 25 * Math.cos(a)}
              y1={32 + 25 * Math.sin(a)}
              x2={32 + 29 * Math.cos(a)}
              y2={32 + 29 * Math.sin(a)}
              strokeWidth="1.4"
            />
          )
        })}
      </svg>
    </div>
  )
}
