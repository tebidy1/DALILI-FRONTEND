import { useEffect, useRef, useState } from 'react'
import { CAPTURE_ZOOM, markBoxRect, shotLayout, toLocal, zoomFrame, type MarkRect, type MarkRectPct, type ZoomLimits } from '@dalili/core'

/** النواة تعيد أرقامًا نسبية (٠–١٠٠) — تنسيق CSS شأن العرض ويبقى هنا */
const pct = (n: number) => `${n}%`
const asStyle = (r: MarkRectPct) => ({ left: pct(r.left), top: pct(r.top), width: pct(r.width), height: pct(r.height) })

/**
 * لقطة خطوة واحدة — مشتركة بين قائمة الالتقاط والقارئ (PNL-01).
 * طبقة واحدة تضم الصورة والإطار والطمس معًا، فتبقى كلها منطبقة بعد التكبير.
 * العنصر الخارجي ثابت دائمًا (ref واحد لـResizeObserver) ويتبدّل صنفه zoom فقط.
 */
export function PreviewShot({
  src,
  mark,
  crop,
  blur = [],
  alt,
  zoom = CAPTURE_ZOOM,
  canToggle = false,
}: {
  src: string
  mark?: MarkRect
  crop?: MarkRect
  /** مناطق الطمس — تُرسم معتمة إلزاميًا: الملف المخزَّن غير مطموس */
  blur?: MarkRect[]
  alt: string
  zoom?: ZoomLimits
  /** القارئ: زر «اللقطة كاملة / تكبير العنصر» */
  canToggle?: boolean
}) {
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null)
  const [view, setView] = useState<{ w: number; h: number } | null>(null)
  const [full, setFull] = useState(false)
  const boxRef = useRef<HTMLDivElement | null>(null)
  // علة «التحديد لا يظهر أبدًا»: صورة data:URL تُفكّ متزامنةً قبل ربط onLoad —
  // نقرأ الأبعاد فور توفر العنصر (complete) عبر callback ref، وonLoad للحالة غير المتزامنة
  const readNat = (img: HTMLImageElement | null) => {
    if (img && img.complete && img.naturalWidth > 0) {
      setNat((prev) =>
        prev && prev.w === img.naturalWidth && prev.h === img.naturalHeight ? prev : { w: img.naturalWidth, h: img.naturalHeight },
      )
    }
  }
  useEffect(() => setNat(null), [src])
  useEffect(() => {
    const el = boxRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setView({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const layout = nat ? shotLayout(nat.w, nat.h, crop) : null
  const boxOf = (r: MarkRect) => {
    const b = layout ? markBoxRect(toLocal(r, crop), layout.frameW, layout.frameH) : null
    return b ? asStyle(b) : null
  }
  const zoomed = !!mark && !full
  const frame = zoomed && mark && layout && view ? zoomFrame(toLocal(mark, crop), layout.frameW, layout.frameH, view.w, view.h, zoom) : null
  const markBox = mark ? boxOf(mark) : null

  const layerStyle = {
    ...(crop && layout ? { aspectRatio: `${layout.frameW} / ${layout.frameH}` } : {}),
    ...(frame
      ? { transform: `translate(${frame.translateX}px, ${frame.translateY}px) scale(${frame.scale})`, transformOrigin: '0 0' }
      : {}),
  }

  return (
    <div className={`step-shot${zoomed ? ' zoom' : ''}`} ref={boxRef}>
      <div className={`shot-zoom${crop ? ' cropped' : ''}`} style={layerStyle}>
        <img
          ref={readNat}
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          style={crop && layout ? { width: pct(layout.img.widthPct), left: pct(layout.img.leftPct), top: pct(layout.img.topPct) } : undefined}
          onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
        />
        {blur.map((r, i) => {
          const b = boxOf(r)
          return b ? <span key={i} className="shot-blur" style={b} aria-hidden="true" /> : null
        })}
        {markBox && <span className="shot-mark" style={markBox} aria-hidden="true" />}
      </div>
      {canToggle && mark && (
        <button type="button" className="shot-toggle" aria-pressed={full} onClick={() => setFull((v) => !v)}>
          {full ? 'تكبير العنصر' : 'اللقطة كاملة'}
        </button>
      )}
    </div>
  )
}

/** عنصر نائب «يرسم التحديد…» — يملأ نافذة البطاقة الأحدث أثناء انتظار وصول اللقطة المكبّرة (طلب المالك 2026-09-11) */
export function PendingShot() {
  return (
    <div className="step-shot pending" role="img" aria-label="يجري رسم التحديد">
      <span className="pending-sheen" aria-hidden="true" />
      <span className="pending-cap">يرسم التحديد…</span>
    </div>
  )
}
