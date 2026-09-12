import type { Rect } from '@dalili/core'

/**
 * رياضيات منظار اللقطة — نقية وقابلة للاختبار بلا DOM.
 * المنظار صندوق ثابت (boxW×boxH) واللوحة داخله بحجمها الطبيعي (imgW×imgH)
 * مزاحة بـ transform: translate(tx,ty) scale(scale) وأصلها الزاوية العليا.
 * نقطة طبيعية (nx,ny) تظهر عند (nx*scale + tx, ny*scale + ty) داخل المنظار.
 */

export interface Viewport {
  scale: number
  tx: number
  ty: number
}

/** أقصى تكبير — أبعد من هذا يصير البكسل عجينة بلا فائدة */
export const MAX_SCALE = 4

/** طلب المالك 2026-09-10: الزوم الافتتاحي — ١٠٪ فوق ملء العرض كي يظهر محتوى
 *  الشاشة أوضح فور الفتح بلا زوم يدوي، والقاعدة محفوظة: الركن الذي به الزر
 *  المحدد هو الذي يظهر (التبؤير على الهدف مع حصرٍ يحمّل القصّ نحوه) */
export const OPENING_ZOOM = 1.1

/** أكبر مقياس يُظهر الصورة كاملة داخل المنظار، وبلا تكبير فوق الطبيعي */
export function fitScale(imgW: number, imgH: number, boxW: number, boxH: number): number {
  if (imgW <= 0 || imgH <= 0) return 1
  return Math.min(1, boxW / imgW, boxH / imgH)
}

/**
 * يحصر الإزاحة: إن غطّت الصورة المنظار مُنعت الفجوات عند الحواف،
 * وإن صغرت عنه تُتوسَّط. يمنع «الانزلاق إلى الفراغ» الذي يربك المستخدم.
 */
export function clampViewport(v: Viewport, imgW: number, imgH: number, boxW: number, boxH: number): Viewport {
  const w = imgW * v.scale
  const h = imgH * v.scale
  const tx = w <= boxW ? (boxW - w) / 2 : Math.min(0, Math.max(boxW - w, v.tx))
  const ty = h <= boxH ? (boxH - h) / 2 : Math.min(0, Math.max(boxH - h, v.ty))
  return { scale: v.scale, tx, ty }
}

/**
 * منظر افتتاحي للخطوة: ملء العرض ثم **زوم افتتاحي ١٠٪** (طلب المالك 2026-09-10)
 * — محتوى الشاشة أوضح افتراضيًا بلا زوم يدوي. والقاعدة المعمّلة سابقًا محفوظة:
 * الإطار يُبؤَّر على الهدف المُعلَّم، و`clampViewport` يحمل القصّ نحوه فيبقى
 * الركن الذي به الزر المحدد هو الظاهر للمستخدم. بلا هدف (لقطة قديمة/خطوة
 * تنقّل) نفس المقياس والقصّ محمول على **أعلى** الشاشة — أول ما يُقرأ.
 */
export function focusViewport(
  mark: Rect | undefined,
  imgW: number,
  imgH: number,
  boxW: number,
  boxH: number,
): Viewport {
  const fit = fitScale(imgW, imgH, boxW, boxH)
  const scale =
    imgW > 0 ? Math.min(MAX_SCALE, Math.max(fit, boxW / imgW) * OPENING_ZOOM) : fit
  if (!mark || mark.w <= 0 || mark.h <= 0) {
    return clampViewport(
      { scale, tx: (boxW - imgW * scale) / 2, ty: 0 },
      imgW,
      imgH,
      boxW,
      boxH,
    )
  }
  const cx = mark.x + mark.w / 2
  const cy = mark.y + mark.h / 2
  return clampViewport(
    { scale, tx: boxW / 2 - cx * scale, ty: boxH / 2 - cy * scale },
    imgW,
    imgH,
    boxW,
    boxH,
  )
}

/**
 * إزاحة المنظار بمقدار سحب (dx,dy) بالبكسل المعروض ثم حصره — مقبض اليد (Pan).
 * حين تلائم الصورة المنظار يعيدها `clampViewport` للتوسّط، فالسحب بلا أثر — لا
 * تتحرّك لقطة لا تفيض عن إطارها (سلوك متوقّع، لا خلل).
 */
export function panViewport(
  v: Viewport,
  dx: number,
  dy: number,
  imgW: number,
  imgH: number,
  boxW: number,
  boxH: number,
): Viewport {
  return clampViewport({ scale: v.scale, tx: v.tx + dx, ty: v.ty + dy }, imgW, imgH, boxW, boxH)
}

/** تكبير/تصغير مع تثبيت النقطة التي تحت مركز المنظار — لا تقفز الصورة تحت العين */
export function zoomAround(
  v: Viewport,
  factor: number,
  boxW: number,
  boxH: number,
  imgW: number,
  imgH: number,
): Viewport {
  const fit = fitScale(imgW, imgH, boxW, boxH)
  const scale = Math.min(MAX_SCALE, Math.max(fit, v.scale * factor))
  const natX = (boxW / 2 - v.tx) / v.scale
  const natY = (boxH / 2 - v.ty) / v.scale
  return clampViewport(
    { scale, tx: boxW / 2 - natX * scale, ty: boxH / 2 - natY * scale },
    imgW,
    imgH,
    boxW,
    boxH,
  )
}
