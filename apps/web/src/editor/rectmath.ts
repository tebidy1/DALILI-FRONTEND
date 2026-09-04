import type { Rect } from '@dalili/core'

/** رياضيات مستطيلات الرسم على canvas — نقية وقابلة للاختبار */

export interface DragPoints {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** من نقطتي سحب إلى مستطيل موجب الأبعاد */
export function normalizeDrag(d: DragPoints): Rect {
  return {
    x: Math.min(d.x0, d.x1),
    y: Math.min(d.y0, d.y1),
    w: Math.abs(d.x1 - d.x0),
    h: Math.abs(d.y1 - d.y0),
  }
}

/** حصر داخل حدود */
export function clampRect(r: Rect, w: number, h: number): Rect {
  const x = Math.max(0, Math.min(r.x, w))
  const y = Math.max(0, Math.min(r.y, h))
  return {
    x,
    y,
    w: Math.max(0, Math.min(r.w, w - x)),
    h: Math.max(0, Math.min(r.h, h - y)),
  }
}

/**
 * تحويل من إحداثيات العرض (CSS px على اللوحة) إلى إحداثيات الصورة الطبيعية.
 * crop بالإحداثيات الطبيعية الأصلية يُزاح داخليًا لأن كل المستطيلات تُخزن أصلية دومًا.
 */
export function displayToNatural(r: Rect, scaleX: number, scaleY: number, crop?: Rect): Rect {
  const ox = crop?.x ?? 0
  const oy = crop?.y ?? 0
  return {
    x: Math.round(r.x * scaleX) + ox,
    y: Math.round(r.y * scaleY) + oy,
    w: Math.round(r.w * scaleX),
    h: Math.round(r.h * scaleY),
  }
}

/** أصغر حجم مقبول لمستطيل رسم (يمنع المستطيلات النقطية العرضية) */
export const MIN_RECT = 8

/**
 * S3+: التحكّم المباشر بإطار الهدف في وضع التحريك — مقابض الحواف/الأركان + الجسم.
 * ثمانية اتجاهات (n/s/e/w وأركانها) + 'move' للجسم كله.
 */
export type MarkHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'move'

/** كل المقابض عدا التحريك — لرسمها كمربّعات على الإطار */
export const RESIZE_HANDLES: Exclude<MarkHandle, 'move'>[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

/**
 * موضع مركز مقبضٍ ما على مستطيل معروض r (بإحداثيات العرض) — لرسم المربّعات
 * واختبار الإصابة بالمنطق نفسه فلا يفترقان.
 */
export function handleCenter(r: Rect, h: Exclude<MarkHandle, 'move'>): { x: number; y: number } {
  const cx = h.includes('w') ? r.x : h.includes('e') ? r.x + r.w : r.x + r.w / 2
  const cy = h.includes('n') ? r.y : h.includes('s') ? r.y + r.h : r.y + r.h / 2
  return { x: cx, y: cy }
}

/**
 * أي مقبض عند نقطة العرض (px,py) على مستطيل معروض r ضمن هامش tol؟
 * الأركان والحواف أولًا (أدقّ)، ثم الجسم (تحريك)، وإلا null (خارج الإطار).
 *
 * `withHandles=false` لشكلٍ **غير منشَّط**: مقابضه ليست مرسومة بعد، فلا يجوز أن
 * تصطاد نقرةً عندها — يبقى جسمه وحده ممسوكًا (نمط وورد: انقر لتنشّط، ثم حجّم).
 */
export function hitMarkHandle(r: Rect, px: number, py: number, tol: number, withHandles = true): MarkHandle | null {
  if (px < r.x - tol || px > r.x + r.w + tol || py < r.y - tol || py > r.y + r.h + tol) return null
  if (withHandles) {
    for (const h of RESIZE_HANDLES) {
      const c = handleCenter(r, h)
      if (Math.abs(px - c.x) <= tol && Math.abs(py - c.y) <= tol) return h
    }
  }
  if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return 'move'
  return null
}

/**
 * مؤشّر CSS المناسب لكل مقبض — يوضّح للمستخدم أن الإطار قابل للتحريك/التحجيم.
 * لغة الإمساك كما في وورد/فيغما (طلب المالك 2026-09-04): يد **مفتوحة** فوق جسم
 * الإطار و**مقبوضة** أثناء سحبه؛ أما المقابض الاتجاهية فسهم تحجيمها ثابت لا
 * يتبدّل بالسحب كي لا يقفز شكل المؤشّر في منتصف الحركة.
 */
export function cursorForHandle(h: MarkHandle | null, dragging = false): string {
  switch (h) {
    case 'nw':
    case 'se':
      return 'nwse-resize'
    case 'ne':
    case 'sw':
      return 'nesw-resize'
    case 'n':
    case 's':
      return 'ns-resize'
    case 'e':
    case 'w':
      return 'ew-resize'
    case 'move':
      return dragging ? 'grabbing' : 'grab'
    default:
      return ''
  }
}

/**
 * يطبّق تحريكًا/تحجيمًا بمقدار إزاحة طبيعية (dx,dy) على مستطيل الهدف، محصورًا داخل
 * الصورة وبأدنى حجم. 'move' يزيح الإطار كله؛ الحواف تحرّك حافتها وتثبّت مقابلتها.
 */
export function resizeRect(
  r: Rect,
  handle: MarkHandle,
  dx: number,
  dy: number,
  imgW: number,
  imgH: number,
  min = MIN_RECT,
): Rect {
  if (handle === 'move') {
    return {
      x: Math.round(Math.max(0, Math.min(imgW - r.w, r.x + dx))),
      y: Math.round(Math.max(0, Math.min(imgH - r.h, r.y + dy))),
      w: r.w,
      h: r.h,
    }
  }
  let { x, y, w, h } = r
  const right = x + w
  const bottom = y + h
  if (handle.includes('w')) {
    x = Math.min(right - min, Math.max(0, x + dx))
    w = right - x
  }
  if (handle.includes('e')) {
    w = Math.max(min, Math.min(imgW - x, w + dx))
  }
  if (handle.includes('n')) {
    y = Math.min(bottom - min, Math.max(0, y + dy))
    h = bottom - y
  }
  if (handle.includes('s')) {
    h = Math.max(min, Math.min(imgH - y, h + dy))
  }
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) }
}
