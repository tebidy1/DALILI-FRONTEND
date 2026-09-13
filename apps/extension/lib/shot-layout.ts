/**
 * PNL-01: هندسة عرض لقطة مقصوصة بنِسَب مئوية بلا قياس — الطبقة تأخذ aspect-ratio
 * بأبعاد الإطار، فتصح نِسَب الصورة وصناديق الإطار/الطمس (markBoxStyle) مباشرةً.
 * تحذير RTL: left/top فيزيائيان عمدًا (الطبقة نفسها تُحوَّل بـtransform من 0 0).
 */
import type { MarkRect } from './mark-box'

export function toLocal(r: MarkRect, crop?: MarkRect): MarkRect {
  return crop ? { x: r.x - crop.x, y: r.y - crop.y, w: r.w, h: r.h } : r
}

export interface ShotLayout {
  /** بُعدا الإطار المعروض بالبكسل الطبيعي (القصّ أو الصورة كاملة) */
  frameW: number
  frameH: number
  img: { width: string; left: string; top: string }
}

export function shotLayout(natW: number, natH: number, crop?: MarkRect): ShotLayout | null {
  if (natW <= 0 || natH <= 0) return null
  const c = crop && crop.w > 0 && crop.h > 0 ? crop : { x: 0, y: 0, w: natW, h: natH }
  const pct = (v: number, whole: number) => `${(v / whole) * 100}%`
  // ‎-0 يطبع «0%» لا «-0%» — نطبّع الصفر كي تبقى المقارنات والأنماط نظيفة
  const off = (v: number, whole: number) => (v === 0 ? '0%' : pct(-v, whole))
  return { frameW: c.w, frameH: c.h, img: { width: pct(natW, c.w), left: off(c.x, c.w), top: off(c.y, c.h) } }
}
