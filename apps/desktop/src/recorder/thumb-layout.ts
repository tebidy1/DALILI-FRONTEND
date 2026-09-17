/**
 * تخطيط مصغّرة الخطوة الأحدث (المرحلة ١) — رياضيّات PreviewShot (الإضافة)
 * مُستخلَصةً نقيّةً: zoomFrame يوسّط العلامة ويكبّرها، وmarkBoxRect يعطي نسبتها
 * (٠–١٠٠) على الصورة الطبيعيّة. بلا DOM — العرض يبني العناصر من الناتج.
 * العلامة تُرسَم حلقةً (border-radius) في CSS لا هنا: البيانات مستطيل،
 * والشكل قرار عرض — قرار المالك: دائرة للديسكتوب بدل مستطيل الإضافة.
 */
import { markBoxRect, zoomFrame, type MarkRect } from '@dalili/core'

export function thumbLayout(
  mark: MarkRect,
  natW: number,
  natH: number,
  viewW: number,
  viewH: number,
): { layerTransform: string; markPct: { left: number; top: number; width: number; height: number } } | null {
  const frame = zoomFrame(mark, natW, natH, viewW, viewH)
  const box = markBoxRect(mark, natW, natH)
  if (!frame || !box) return null
  return {
    layerTransform: `translate(${frame.translateX}px, ${frame.translateY}px) scale(${frame.scale})`,
    markPct: { left: box.left, top: box.top, width: box.width, height: box.height },
  }
}
