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

/**
 * طلب المالك 2026-10-02 — **تكبير القراءة**: ملء العرض يصغّر لقطة ١٩٢٠px إلى ~٣٩٪
 * فتصير نصوصها ~٥px «تحتاج تركيزًا». الخطوة ذات الهدف تُفتح بمقياس **مطلق**:
 * كل بكسل صورة = ٠٫٦ بكسل معروض. لقطات المالك بكثافة ١٫٥ (١٩٢٠ بكسل = ١٢٨٠
 * منطقيّة) فحجمها الطبيعي ٠٫٦٧ — و٠٫٦ = ٩٠٪ منه: «الحقل بحجمه الطبيعي أو أصغر
 * قليلًا» كي تسع البطاقة محتوى أكثر والنص ~١٢px يُقرأ بلا تركيز. المقياس مطلق
 * لا نسبةً لعرض الصندوق عمدًا: الجوال يقرأ النص بالحجم نفسه بدل لقطة مصغّرة.
 * (كثافة الالتقاط غير مخزَّنة مع اللقطة؛ لقطة بكثافة ١ تظهر ٦٠٪ من طبيعيّها —
 * أصغر من المراد لكنها أوضح مرة ونصف مما كانت.)
 */
export const READING_SCALE = 0.6
/** أقصى ما يشغله إطار الهدف من المنظار بمقياس القراءة — يبقى حوله سياق، وفوقه
 *  متّسع لرقم الخطوة وسهمها */
const MARK_MAX_W = 0.8
const MARK_MAX_H = 0.45

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
 * منظر افتتاحي للخطوة.
 * - **بهدف مُعلَّم:** تكبير القراءة (`READING_SCALE`) مبؤَّرًا على الهدف —
 *   يرى القارئ جزءًا من الشاشة بحجم قريب من الطبيعي والزرّ وسطه. ينزل المقياس
 *   إن كان الإطار أعرض/أطول من أن يظهر كاملًا، ولا ينزل أبدًا تحت «ملء العرض +١٠٪»
 *   (القاعدة السابقة 2026-09-10) فلا فراغ حول اللقطة ولا تصغير للقطة صغيرة أصلًا.
 *   `clampViewport` يحمل القصّ نحو الهدف فيبقى الركن الذي به الزر هو الظاهر.
 * - **بلا هدف** (فتح موقع، خطوة تنقّل، لقطة قديمة إطارها محروق في البكسل): ملء
 *   العرض +١٠٪ والقصّ محمول على **أعلى** الشاشة — لا نقطة نبؤّر عليها، والتكبير
 *   الأعمى قد يُخرج الإطار المحروق من المنظار.
 */
export function focusViewport(
  mark: Rect | undefined,
  imgW: number,
  imgH: number,
  boxW: number,
  boxH: number,
): Viewport {
  const fit = fitScale(imgW, imgH, boxW, boxH)
  const base = imgW > 0 ? Math.min(MAX_SCALE, Math.max(fit, boxW / imgW) * OPENING_ZOOM) : fit
  if (!mark || mark.w <= 0 || mark.h <= 0) {
    const scale = base
    return clampViewport(
      { scale, tx: (boxW - imgW * scale) / 2, ty: 0 },
      imgW,
      imgH,
      boxW,
      boxH,
    )
  }
  const markFits = Math.min((boxW * MARK_MAX_W) / mark.w, (boxH * MARK_MAX_H) / mark.h)
  const scale = Math.min(MAX_SCALE, Math.max(base, Math.min(READING_SCALE, markFits)))
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
