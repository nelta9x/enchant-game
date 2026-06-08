import { useEffect, useRef } from 'react'
import { motion, useAnimationControls } from 'motion/react'
import { dataManager } from '../data/DataManager'
import { useGameStore } from '../store/gameStore'
import { useT } from '../i18n'
import { ItemIcon } from './ItemIcon'

// 상단바 가운데의 "역대 최고 강화 기록" 게이지(프레젠테이션 전용). 두 줄로 쌓는다:
//   1줄: 최고 기록 [검 아이콘] +N
//   2줄: 레벨당 한 칸인 진행도 바. 칸 색으로 두 가지를 동시에 보여준다 — 0..현재(i<currentLevel)는 밝은
//        gold 채움(현재 얼마나 올라왔나), 현재..최고(i<best)는 어두운 금색(frame, 지난 기록), 그 너머는 빈 칸(ink/15).
// 현재 장착 검의 +레벨(SwordStage)과 별개로, 한 번이라도 도달한 최고치(maxLevelReached, 단조)를 보여준다.
// 기록을 세운 "검"은 별도 상태가 아니라 maxLevelReached(레벨)에서 파생한다(레벨↔검 1:1 — getSwordByLevel).
// gold 채움 끝(현재 위치)은 currentSwordId 의 레벨을 따라간다 — 강화로 늘고, 더 낮은 검 장착·판매로 줄며
// 늘 best 이하다(현재 ≤ 최고). 현재 < 최고면 그 사이가 frame 으로 남아 "잃은 만큼"이 보인다(현재 +0 은 채움 없음).
// 가운데 칸(TopControls)에서 전체 폭으로 stretch 되며 위(라벨)→아래(바) 순으로 중앙상단에 앵커된다.
// 최고치가 갱신될 때만 숫자가 한 번 통 튄다(상승 시에만 — 첫 마운트·무관한 리렌더에는 조용).
export function RecordGauge() {
  const t = useT()
  const best = useGameStore((s) => s.maxLevelReached)
  const goal = dataManager.getMaxSwordLevel()
  // 레벨↔검은 1:1 → 최고 도달치(레벨)만으로 "그 기록을 세운 검"이 유일하게 결정된다(추가 상태 불필요).
  const recordSword = dataManager.getSwordByLevel(best)
  const recordName = recordSword ? t(recordSword.nameKey) : ''
  // 현재 장착 검의 레벨(없으면 null) — 인벤토리 교체·판매로 오르내리므로 진행도 축의 그 지점에 화살표를 둔다.
  const currentSwordId = useGameStore((s) => s.currentSwordId)
  const currentLevel =
    currentSwordId != null
      ? (dataManager.getSwordById(currentSwordId)?.level ?? null)
      : null

  // 최고치가 "오를 때만" +N 숫자가 한 번 통 튄다(명령형 — GoldDisplay 의 punch 와 동일 idiom).
  // 직전 best 는 effect 에서만 읽고 쓴다(렌더 중 ref 접근 금지). 첫 마운트엔 prev==best 라 조용.
  const popControls = useAnimationControls()
  const prevBest = useRef(best)
  useEffect(() => {
    if (best > prevBest.current) {
      popControls.start({
        scale: [1.7, 1],
        filter: ['brightness(2)', 'brightness(1)'],
        transition: { duration: 0.45, ease: 'backOut' },
      })
    }
    prevBest.current = best
  }, [best, popControls])

  return (
    <div className="flex w-full flex-col items-center gap-1 text-ink-soft">
      {/* 1줄: 라벨 + 무기 아이콘 + 강화 정도(가운데) */}
      <div className="flex items-center gap-2">
        <span className="text-[0.6875rem] font-semibold whitespace-nowrap">
          {t('record.best')}
        </span>
        {recordSword && (
          <ItemIcon
            itemId={recordSword.id}
            alt={recordName}
            className="h-5 w-5 shrink-0"
          />
        )}
        {/* +강화 정도 — 최고치가 오를 때 popControls 로 한 번 통 튄다(위 effect). */}
        <motion.span
          animate={popControls}
          className="inline-block text-sm font-extrabold tabular-nums text-gold"
        >
          +{best}
        </motion.span>
      </div>

      {/* 2줄: 진행도 바 — 레벨당 한 칸(전체 폭 stretch). 칸 i(0-base)의 색:
          0..현재(i < currentLevel) → gold(밝은 현재 채움), 현재..최고(i < best) → frame(지난 기록, 어두운 금색),
          그 너머 → 빈 칸(ink/15). 현재 ≤ 최고라 gold 구간 ⊆ 기록 구간. 장식이라 aria-hidden(숫자는 위에서 읽힘). */}
      <div className="flex w-full gap-px" aria-hidden>
        {Array.from({ length: goal }, (_, i) => {
          const filled = currentLevel !== null && i < currentLevel
          const record = i < best
          return (
            <span
              key={i}
              className={`h-2 flex-1 rounded-[1px] ${
                filled ? 'bg-gold' : record ? 'bg-frame' : 'bg-ink/15'
              }`}
            />
          )
        })}
      </div>
    </div>
  )
}
