import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch'

/**
 * A single image, pinch/double-tap/drag zoomable -- for the full-screen
 * photo viewer opened from a Clock In/Out selfie thumbnail
 * (JourneyTimeline.tsx). Lazy-loaded by its only caller so this dependency
 * never lands in the main bundle for the common case where nobody opens a
 * photo.
 */
export function PhotoZoomViewer({ src, alt }: { src: string; alt: string }) {
  return (
    <TransformWrapper minScale={1} maxScale={4} doubleClick={{ mode: 'toggle' }} centerOnInit>
      <TransformComponent
        wrapperStyle={{ width: '100%', height: '100%' }}
        contentStyle={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <img src={src} alt={alt} className="max-h-full max-w-full object-contain" />
      </TransformComponent>
    </TransformWrapper>
  )
}
