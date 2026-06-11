import { useState } from 'react'

// DEV 전용 망치/강화 타이밍 튜닝 패널 — 디자이너·개발자가 브라우저에서 망치 내려치기 연출의 시간값을
// 라이브로 맞춰 보는 도구다. import.meta.env.DEV 로 게이팅돼 프로덕션(GitHub Pages) 빌드에서는 Vite 가
// 통째로 dead-code 제거한다(GameScreen 의 렌더 게이트 참고). DEV 전용이라 플레이어 노출 텍스트 규칙
// (i18n)을 따르지 않고 한국어 라벨을 직접 박는다.
//
// 값은 GameScreen 의 useState(단일 출처)가 들고, 이 패널은 표시·편집만 한다(뷰=렌더만). 슬라이더가 바뀌면
// onChange 로 새 튜닝을 올려 보내고, GameScreen 이 그 값으로 effectiveAnim·HammerShape 를 만들어 연출에 흘린다.
//
// 떨림(shake)은 검 레벨대별 밴드(animation.json shakeBands)로 데이터에 두므로 단일 글로벌 슬라이더로는
// 표현할 수 없다 — 이 패널은 글로벌 망치 타이밍(임팩트·스냅·정지·페이드·가드)만 라이브로 만진다. 레벨별
// 떨림은 JSON 에서 튜닝한다(밴드별 슬라이더는 이 도구가 다루지 않는다).

// 망치 내려치기 타이밍의 편집 가능한 값(전부 ms). impact/guard 는 AnimationConfig 로,
// windup/holdAfter/fadeout 은 HammerShape 로 변환돼 흐른다(GameScreen 이 조립).
export type HammerTuning = {
  impactMs: number // 강화 클릭~망치가 검에 닿기까지(윈드업 전체)
  windupMs: number // 닿기 직전 빠른 스냅 길이(holdUntil→impact)
  holdAfterMs: number // 임팩트 후 자세를 유지하는 정지 시간
  fadeoutMs: number // 정지 후 제자리에서 사라지는 페이드아웃 길이
  guardMs: number // 떨림 끝난 뒤 재강화 입력 잠금(가드)
}

type Field = {
  key: keyof HammerTuning
  label: string
  max: number
}

// 각 슬라이더의 범위(0~max, 1ms 단위). max 는 튜닝 도구로 충분히 넓게 — 극단까지 끌어도 깨지지 않도록
// GameScreen 이 shakeMin≤shakeMax 를 클램프한다.
const FIELDS: Field[] = [
  { key: 'impactMs', label: '임팩트(내려치기)', max: 1500 },
  { key: 'windupMs', label: '스냅 속도', max: 600 },
  { key: 'holdAfterMs', label: '임팩트 후 정지', max: 1000 },
  { key: 'fadeoutMs', label: '페이드아웃', max: 1000 },
  { key: 'guardMs', label: '재강화 가드', max: 1000 },
]

export function HammerTuningPanel({
  value,
  defaults,
  onChange,
}: {
  value: HammerTuning
  defaults: HammerTuning // 데이터(animation.json) 기본값 — 리셋 대상
  onChange: (next: HammerTuning) => void
}) {
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-3 right-3 z-50 rounded-md bg-panel/90 px-3 py-1.5 text-xs font-semibold text-on-dark shadow-lg ring-1 ring-panel-edge"
      >
        ⚙ 타이밍
      </button>
    )
  }

  const set = (key: keyof HammerTuning, n: number) =>
    onChange({ ...value, [key]: n })

  return (
    <div className="fixed bottom-3 right-3 z-50 w-72 rounded-lg bg-panel/95 p-3 text-on-dark shadow-2xl ring-1 ring-panel-edge backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-bold tracking-wide">망치 타이밍 (DEV)</span>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => onChange(defaults)}
            className="rounded bg-panel-soft px-2 py-0.5 text-[11px] text-on-dark-soft hover:text-on-dark"
          >
            리셋
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded bg-panel-soft px-2 py-0.5 text-[11px] text-on-dark-soft hover:text-on-dark"
          >
            닫기
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col gap-0.5">
            <span className="flex items-center justify-between text-[11px] text-on-dark-soft">
              <span>{f.label}</span>
              <span className="tabular-nums text-on-dark">{value[f.key]}ms</span>
            </span>
            <input
              type="range"
              min={0}
              max={f.max}
              step={5}
              value={value[f.key]}
              onChange={(e) => set(f.key, Number(e.target.value))}
              className="accent-enhance-glow"
            />
          </label>
        ))}
      </div>
    </div>
  )
}
