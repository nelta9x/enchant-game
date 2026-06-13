import { useLayoutEffect, useRef } from 'react'
import { drawSpriteContain, spriteStore } from '../lib/spriteStore'

// 스프라이트 1장을 canvas 로 그리는 정적 아이콘(검·아이템 공용) — <img> 대신 spriteStore 의 GPU 상주
// ImageBitmap 풀을 재사용한다. 강화로 장착검·비용·보상 스프라이트가 바뀔 때 <img src> 교체가 내던 재디코드·
// 재업로드(특히 모바일 WebKit) 없이 블릿만 하게 한다. 미적재면 적재 즉시 1회 재그리기(self-heal), 미존재/
// 실패면 default.png 폴백. backing store·object-contain·픽셀아트 보간은 drawSpriteContain 이 소유한다.
// (검 본체 SwordStage 와 달리 등장 애니메이션·FREEZE 진단이 없는 정적 아이콘 전용 — drawSpriteContain 의
//  freeze 인자를 쓰지 않아 진단 플래그의 영향을 받지 않는다.)
export function SpriteCanvas({
  url,
  alt,
  className,
}: {
  url: string
  alt?: string
  className?: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  // paint 전(useLayoutEffect)에 그려, 마운트 시 아이콘이 한 프레임 빈 캔버스로 깜빡이지 않게 한다
  // (상점·인벤토리 등 여러 아이콘 동시 마운트 — SwordStage 와 동일 이유).
  useLayoutEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    drawSpriteContain(canvas, url)
    let cancelled = false
    // 첫 페인트가 적재를 앞질러 폴백을 그렸으면 적재 즉시 한 번 더 그린다 — load 는 캐시 히트/완료에 resolve 하고
    // 동시 호출을 합친다(중복 디코드 없음). 시작 풀링에 없던 스프라이트도 이 on-demand 경로로 채워진다.
    if (!spriteStore.has(url)) {
      void spriteStore.load(url).then(() => {
        if (!cancelled) drawSpriteContain(canvas, url)
      })
    }
    // rem/뷰포트 스케일로 표시 크기가 바뀌면 backing store 를 맞춰 다시 그린다(현재 URL 유지).
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => drawSpriteContain(canvas, url))
        : null
    ro?.observe(canvas)
    return () => {
      cancelled = true
      ro?.disconnect()
    }
  }, [url])

  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      className={className}
      style={{ imageRendering: 'pixelated' }}
    />
  )
}
