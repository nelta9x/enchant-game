import { memo, useMemo, type RefObject } from 'react'
import { dataManager } from '../data/DataManager'
import type { SwordData } from '../data/types'
import { useT, type TranslationKey } from '../i18n'
import { latestOf, useEffectStore } from '../store/effectStore'
import type { Effect } from '../store/effectQueue'
import { useResultStore } from '../store/resultStore'
import { DestructionEffect, type DestructionEvent } from './DestructionEffect'
import { HammerStrike, type HammerStrikeEvent } from './HammerStrike'
import type { HammerShape } from './hammerTiming'
import { HitSparkTrigger } from './HitSparkTrigger'
import { EffectCanvas, EffectCanvasProvider } from './EffectCanvas'
import { FloatingTextEffect } from './FloatingTextEffect'
import { GoldGainText, type GoldGainEvent } from './GoldGainText'
import type { ProtectionState } from './protection'
import type { ProtectionWardProps } from './ProtectionWard'
import { SuccessEffect, type SuccessEvent } from './SuccessEffect'
import { ShakeAfterimage, type ShakeBurstEvent } from './ShakeBurstEffect'
import { SwordStage } from './SwordStage'

// 강화 결과를 스크린리더에 알릴 i18n 키(연출 kind → 결과 문구). 시각 연출은 aria-hidden 이라
// 별도의 sr-only 라이브 리전으로 결과를 음성 전달한다.
const ANNOUNCE_KEY: Record<string, TranslationKey> = {
  successBurst: 'toast.success',
  destruction: 'toast.destroyed',
  protectedShake: 'toast.protected',
  whiffShake: 'toast.whiff',
}

// 효과 1개를 버스트 이벤트(ShakeBurstEvent)로 투영한다 — sprite 없는 효과(자리만 있는 잠금 등)는 null.
// 성공·파괴가 동일 형태라 투영을 한 곳에 둔다 — 반환 타입을 그 명명 타입으로 두어 payload 필드를 늘릴 때
// 투영 누락이 컴파일에서 잡히게 한다. 파티클 emit(전부)·잔상(최신 1개) 양쪽이 이 투영을 공유한다.
function projectBurst(e: Effect): ShakeBurstEvent | null {
  return e.payload?.sprite
    ? {
        id: e.id,
        sprite: e.payload.sprite,
        particleCount: e.payload.particleCount ?? 0,
        impactMs: e.payload.impactMs ?? 0,
        shakeMs: e.payload.shakeMs ?? 0,
      }
    : null
}

type CenterStageProps = {
  // 현재(live) 검 — 스프라이트는 즉시 교체(떨림 동안 숨김), 이름·스탯은 아래 revealedSword 로 지연 반영.
  liveSword: SwordData | undefined
  // 보호 결계 순수 상태 — gold·items 의존이라 GameScreen 에서 계산해 내려준다(여기선 표시만).
  protection: ProtectionState
  onToggleProtection: () => void
  // 판매 코인·드롭 비행의 출발점(검 박스) 측정용 — GameScreen 이 소유하고 카드 오버레이와 공유한다.
  swordBoxRef: RefObject<HTMLDivElement | null>
  // 판매·의뢰 보상 "+금액" 텍스트(검 박스 위) — 판매/의뢰 경로 로컬 상태라 prop 으로 받는다.
  goldGain: GoldGainEvent | null
}

// 중앙 검 스테이지 + 결과 연출 레이어. running(효과) 과 resultStore(공개 상태)를 자기 자신이 구독해,
// GameScreen 의 gold·lockCount·items 커밋과 분리된다 — 무거운 검 스테이지·오버레이 트리는 연출 트리거가
// 바뀔 때만 재조정된다(검 변경 리렌더 폭풍 차단의 핵심). memo 로 무관한 부모 커밋엔 bail 한다.
export const CenterStage = memo(function CenterStage({
  liveSword,
  protection,
  onToggleProtection,
  swordBoxRef,
  goldGain,
}: CenterStageProps) {
  const t = useT()
  // 연출 타이밍(망치 임팩트·모양·플레어) — animation.json 에서 1회 읽는다(load 이후라 안전).
  const anim = useMemo(() => dataManager.getAnimation(), [])
  const hammerShape: HammerShape = useMemo(
    () => ({
      snapSec: anim.hammerSnapMs / 1000,
      holdAfterSec: anim.hammerHoldAfterMs / 1000,
      fadeoutSec: anim.hammerFadeoutMs / 1000,
    }),
    [anim],
  )

  // 효과 store 의 kind 별 "최신 시작"만 구독한다 — 새 효과가 시작될 때만 참조가 바뀌고 종료는 발행되지 않으므로
  // 연출 종료 전이가 이 트리를 커밋시키지 않는다(각 연출은 트리거 id 로 자기 수명을 끝낸다).
  const hammerStrikeFx = useEffectStore(latestOf('hammerStrike'))
  const entranceFx = useEffectStore(latestOf('entranceSuppress'))
  const protectedFx = useEffectStore(latestOf('protectedShake'))
  const whiffFx = useEffectStore(latestOf('whiffShake'))
  const successLatestFx = useEffectStore(latestOf('successBurst'))
  const destructionLatestFx = useEffectStore(latestOf('destruction'))
  // 스크린리더 알림 대상(성공/파괴/방지/헛방) 중 가장 최근 시작(id 최대) — 별도 구독 없이 위 넷에서 도출.
  const announceFx = [protectedFx, whiffFx, successLatestFx, destructionLatestFx].reduce<Effect | null>(
    (best, e) => (e && (best === null || e.id > best.id) ? e : best),
    null,
  )

  // 결과 공개 상태(단일 출처) — heldSwordId 가 있으면 강화 전 검을 이름·스탯에 유지한다.
  const heldSwordId = useResultStore((s) => s.heldSwordId)
  const pricePopKey = useResultStore((s) => s.pricePopKey)
  const floatingText = useResultStore((s) => s.floatingText)
  const revealedSword =
    heldSwordId !== null ? dataManager.getSwordById(heldSwordId) : liveSword

  // 연출 트리거 투영 — 입력 효과 참조가 안정적이라 각 useMemo 는 해당 트리거가 바뀔 때만 새 값을 낸다.
  // 성공·파괴 버스트는 kind 별 최신 1개 — 겹친 옛 버스트의 emit 은 BurstEmitter 의 타이머 집합이 보존한다.
  const destructionEvent = useMemo<DestructionEvent | null>(
    () => (destructionLatestFx ? projectBurst(destructionLatestFx) : null),
    [destructionLatestFx],
  )
  const successEvent = useMemo<SuccessEvent | null>(
    () => (successLatestFx ? projectBurst(successLatestFx) : null),
    [successLatestFx],
  )
  // 잔상(떨림→팝업)은 영속 단일 노드가 성공·파괴를 합쳐 "가장 최근" 버스트 1개만 그린다(id 큰 쪽이 최신).
  const latestBurstEvent = useMemo<ShakeBurstEvent | null>(() => {
    const fx =
      successLatestFx && destructionLatestFx
        ? successLatestFx.id > destructionLatestFx.id
          ? successLatestFx
          : destructionLatestFx
        : (successLatestFx ?? destructionLatestFx)
    return fx ? projectBurst(fx) : null
  }, [successLatestFx, destructionLatestFx])
  const hammerStrikeEvent = useMemo<HammerStrikeEvent | null>(
    () => (hammerStrikeFx ? { id: hammerStrikeFx.id } : null),
    [hammerStrikeFx],
  )

  // 새 검 스프라이트 등장 지연 = 이번 강화의 burstAt(entranceSuppress payload).
  const entranceDelaySec = entranceFx?.payload?.entranceDelaySec ?? 0
  // 실제 검 떨림은 방지(protected)·헛방(whiff) 공통 — 둘 중 최신 효과로 구동(id 큰 쪽). 결계(파괴보호)
  // 플레어는 방지일 때만 번쩍이므로 protectedFx 만 따로 둔다(blockKey).
  const shakeFx =
    protectedFx && whiffFx
      ? protectedFx.id > whiffFx.id
        ? protectedFx
        : whiffFx
      : (protectedFx ?? whiffFx)
  const shakeKey = shakeFx?.id ?? 0
  const shakeImpactSec = (shakeFx?.payload?.impactMs ?? 0) / 1000
  // 떨림 길이는 효과 payload(GameScreen 이 검 데이터 shake[outcome]에서 도출)에서 온다. 활성 떨림 효과가
  // 없으면 shakeKey 가 0 이라 SwordStage 가 어차피 떨지 않으므로 길이값은 무의미(0).
  const shakeDurationSec = (shakeFx?.payload?.shakeMs ?? 0) / 1000
  const blockKey = protectedFx?.id ?? 0

  // 결과를 스크린리더에 알린다(시각 연출은 aria-hidden). 가장 최근 알림 대상 효과의 문구.
  const announcement = announceFx ? t(ANNOUNCE_KEY[announceFx.kind]) : ''

  const protectionProp = useMemo<ProtectionWardProps>(
    () => ({
      state: protection,
      onToggle: onToggleProtection,
      blockKey,
      flareDelaySec: anim.hammerImpactMs / 1000,
    }),
    [protection, onToggleProtection, blockKey, anim],
  )

  const spriteOverlay = useMemo(
    () => (
      <>
                {/* 버스트 emit — 영속 emitter 가 새 id 마다 burstAt 타이머를 건다(렌더 null·풀이 그림). */}
        <DestructionEffect event={destructionEvent} />
        <SuccessEffect event={successEvent} />
        {/* 잔상(떨림→팝업·소멸) — 영속 단일 캔버스가 최신 버스트를 그린다(레이어 churn 0, burstAt 에 교대). */}
        <ShakeAfterimage event={latestBurstEvent} />
        {/* 효과 캔버스(도트 버스트 + 임팩트 불꽃, 한 장) — 잔상 위에 둬 임팩트 불꽃이 검에 가려지지 않게(데이터 플래그).
            풀이 없으면 emit/burst 는 자동 no-op. */}
        {anim.enhanceParticlesEnabled && <EffectCanvas />}
        {/* 망치 — 결과 연출 위. impactMs 로 닿는 시점을 데이터에서 받는다(플래그로 on/off). */}
        {anim.hammerSwingEnabled && (
          <HammerStrike
            event={hammerStrikeEvent}
            impactMs={anim.hammerImpactMs}
            shape={hammerShape}
            smearEnabled={anim.hammerSmearEnabled}
          />
        )}
        {/* Hit 불꽃 — 임팩트에 1회 폭발. 망치보다 "위"(나중 형제)에 둬 화구·불혀가 가려지지 않게(플래그). */}
        {anim.enhanceParticlesEnabled && (
          <HitSparkTrigger
            event={hammerStrikeEvent}
            impactMs={anim.hammerImpactMs}
          />
        )}
        {/* 결과 텍스트("아이구!...")는 망치·결과 연출 위 최전면. */}
        <FloatingTextEffect event={floatingText} />
      </>
    ),
    [
      anim,
      destructionEvent,
      successEvent,
      latestBurstEvent,
      hammerStrikeEvent,
      hammerShape,
      floatingText,
    ],
  )

  return (
    <EffectCanvasProvider>
      <div className="relative flex min-h-0 w-full flex-1 items-center justify-center lg:w-auto lg:flex-none">
        <SwordStage
          sword={liveSword}
          level={liveSword?.level ?? null}
          // 스프라이트는 live 검(즉시 교체 → 떨림 동안 숨김), 이름·판매가·성공률은 공개된 검으로 그린다.
          displaySword={revealedSword}
          displayLevel={revealedSword?.level ?? null}
          protection={protectionProp}
          spriteOverlay={spriteOverlay}
          entranceDelay={entranceDelaySec}
          shakeKey={shakeKey}
          shakeImpactSec={shakeImpactSec}
          shakeDurationSec={shakeDurationSec}
          pricePopKey={pricePopKey}
          swordBoxRef={swordBoxRef}
        />
        {/* 골드 획득 텍스트("+금액") — 검 박스 위로 떠오르는 황금색 연출. 판매·의뢰완료 공유. */}
        <GoldGainText event={goldGain} anchorRef={swordBoxRef} />
        {/* 결과 음성 알림(시각 연출은 aria-hidden) — 화면엔 보이지 않는 라이브 리전. */}
        <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          {announcement}
        </div>
      </div>
    </EffectCanvasProvider>
  )
})
