import { useLayoutEffect, useRef } from 'react'
import { SpriteCanvasBinding } from '../lib/spriteStore'

// 스프라이트 1장을 canvas 로 그리는 정적 아이콘(검·아이템 공용) — <img> 대신 spriteStore 의 GPU 상주
// ImageBitmap 풀을 재사용한다. 강화로 장착검·비용·보상 스프라이트가 바뀔 때 <img src> 교체가 내던 재디코드·
// 재업로드(특히 모바일 WebKit) 없이 블릿만 하게 한다. 크기 측정·자가 치유·중복 방지는 SpriteCanvasBinding 이
// 소유한다(SwordStage·잔상과 공유 — 이 컴포넌트는 캔버스 엘리먼트와 URL 을 바인딩에 넘길 뿐이다).
// (검 본체 SwordStage 와 달리 등장 애니메이션이 없는 정적 아이콘 전용.)
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
  const bindingRef = useRef<SpriteCanvasBinding | null>(null)

  // 바인딩은 마운트 1회 — 첫 그림은 ResizeObserver 초기 콜백(레이아웃 뒤·페인트 전)이 그려 마운트 시 아이콘이
  // 한 프레임 빈 캔버스로 깜빡이지 않는다. 언마운트에 RO 해제.
  useLayoutEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const binding = new SpriteCanvasBinding(canvas)
    bindingRef.current = binding
    return () => {
      binding.dispose()
      bindingRef.current = null
    }
  }, [])

  // URL 교체는 캐시된 크기로 즉시 블릿(강제 레이아웃 없음). 위 effect 가 먼저 선언돼 같은 커밋에서 바인딩이 먼저 생긴다.
  useLayoutEffect(() => {
    bindingRef.current?.setSprite(url)
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
