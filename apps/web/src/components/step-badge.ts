import { DEFAULT_MARK_SHAPE, type MarkShape, type Rect } from '@dalili/core'
import { markLineWidthFor } from './annotations-render'

/**
 * شارة الخطوة على اللقطة: رقمٌ داخل دائرة + سهمٌ يدلّ على العنصر المحدَّد.
 * استُخرجت من `annotations-render` (قانون الحجم ٤٠٠) حين أعيد تصميمها.
 *
 * التاريخ الذي يحكمها:
 * - 2026-09-11 (العلاج الجذري): الموضع **مثبَّت على الزر نفسه** لا على مركز الصورة.
 *   العطب القديم حسب الاتجاه «من مركز الزر نحو مركز اللقطة» فاضطرب وقُذف حين كان
 *   الزر وسط الشاشة — والعارض أصلًا يمركز الزر في المنظار، فمرجع «مركز الصورة» لا
 *   علاقة له بما يُرى. الرقم فوق الزر، ويُقلب أسفله إن لاصق الزر أعلى اللقطة.
 * - 2026-09-28: الرقم داخل دائرة (لا رقم عارٍ)، والسهم بلونه بلا هالة بيضاء.
 * - 2026-10-02 (هذا التصميم): **الشارة خفيفة** — قاعدة بيضاء بصبغة من لون العلامة
 *   وحلقة رفيعة ورقم بلونها — كي لا تسرق الضوء من إطار الهدف (كانت برتقالية مصمتة
 *   أثقل من الإطار نفسه). **السهم ملتفّ حول نفسه بخط رفيع** برأس مفتوح، يكسر رتابة
 *   السهم القصير المستقيم، و**يميل بزاوية تتبع موقع العنصر** أفقيًّا: عنصر يسار
 *   اللقطة يأتيه السهم من يمينه (نحو فسحة الوسط) والعكس. الميل دالّة **متّصلة**
 *   تنعدم عند المنتصف — فلا يعود اضطراب 2026-09-11. والسهم يُرسم ولو أُخفي الرقم
 *   (مبدّل «إظهار الأرقام»)، بالموضع نفسه فلا يقفز عند التبديل.
 * معاينة حيّة لا محتوى محفوظًا.
 */

export interface Pt {
  x: number
  y: number
}

export interface StepBadgeLayout {
  /** نصف قطر دائرة الرقم */
  r: number
  /** مركز دائرة الرقم */
  badge: Pt
  /** بداية السهم (عند حلقة الدائرة) */
  tail: Pt
  /** رأس السهم — على حافة إطار الهدف المرسوم */
  tip: Pt
  /** الرقم أسفل العنصر (العنصر ملاصق لأعلى اللقطة) */
  below: boolean
  /** جهة اللفّة حول محور السهم */
  side: 1 | -1
}

/** صبغة دائرة الرقم فوق قاعدتها البيضاء — خفيفة كزجاج إطار الهدف */
export const BADGE_TINT_ALPHA = 0.16
/** أقصى ميل للسهم عن العمود — عند حافتَي اللقطة */
const LEAN_MAX = (38 * Math.PI) / 180
/** فسحة بين ذيل السهم ومركز الدائرة، بنسبة نصف قطرها */
const TAIL_GAP = 1.22
/** نصف قطر اللفّة بنسبة طول السهم */
const LOOP_RATIO = 0.17

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** خط السهم: رفيع يجاري خط إطار الهدف — لا سمك الريشة */
function arrowLineWidth(scale: number, r: number): number {
  return Math.max(markLineWidthFor(scale) * 1.15, r * 0.065)
}

/** أين تقع الدائرة والسهم لهدفٍ ما — نقية وقابلة للاختبار بلا لوحة */
export function stepBadgeLayout(
  rect: Rect,
  scale: number,
  bounds: { w: number; h: number },
  shape: MarkShape = DEFAULT_MARK_SHAPE,
): StepBadgeLayout {
  const r = Math.min(40, Math.max(16, scale * 0.02))
  // خارج هامش الإطار المرسوم (drawMark) وسمك خطه، بفسحة تنفّس لا تلامسه
  const m = Math.max(6, Math.round(scale * 0.004)) + arrowLineWidth(scale, r) + r * 0.18
  // طول يسع لفّةً تُرى: ~٤٨px معروضة في بطاقة القراءة (السهم القديم كان ~١٥px)
  const len = clamp(scale * 0.062, r * 3.2, r * 4.4)
  const mcx = rect.x + rect.w / 2
  const mcy = rect.y + rect.h / 2
  const hw = rect.w / 2 + m
  const hh = rect.h / 2 + m

  // الميل: موقع العنصر الأفقي ⇒ زاوية. يسار اللقطة ⇒ الرقم يمينه، ويمينها ⇒ يساره.
  // الأسّ ٠٫٧٥ يُظهر الميل مبكرًا (عنصر على ربع اللقطة يميل ~٢٣° لا ١٩°) ويبقى متّصلًا عند الصفر.
  const t = bounds.w > 0 ? clamp((mcx / bounds.w - 0.5) * 2, -1, 1) : 0
  const phi = -Math.sign(t) * Math.abs(t) ** 0.75 * LEAN_MAX
  const side: 1 | -1 = t > 0 ? -1 : 1

  const place = (dirY: 1 | -1) => {
    const d = { x: Math.sin(phi), y: dirY * Math.cos(phi) }
    // نقطة خروج الشعاع من حافة الشكل — صندوقًا كان أو قطعًا ناقصًا
    const k =
      shape === 'ellipse'
        ? 1 / Math.hypot(d.x / hw, d.y / hh)
        : Math.min(hw / Math.max(Math.abs(d.x), 1e-6), hh / Math.max(Math.abs(d.y), 1e-6))
    const tip = { x: mcx + d.x * k, y: mcy + d.y * k }
    const reach = len + r * TAIL_GAP
    return { tip, badge: { x: tip.x + d.x * reach, y: tip.y + d.y * reach } }
  }

  const edge = r * 1.6
  const above = place(-1)
  const under = place(1)
  const fitsAbove = above.badge.y >= edge
  const fitsUnder = under.badge.y <= bounds.h - edge
  // فوق العنصر افتراضًا؛ أسفله إن لم يتّسع فوقه؛ وإن ضاق الاثنان فالأوسع فسحةً
  const below = fitsAbove ? false : fitsUnder ? true : bounds.h - (rect.y + rect.h) > rect.y
  const pick = below ? under : above

  const badge = {
    x: clamp(pick.badge.x, edge, Math.max(edge, bounds.w - edge)),
    y: clamp(pick.badge.y, edge, Math.max(edge, bounds.h - edge)),
  }
  // الذيل على الخط الواصل فعلًا بين الدائرة (بعد حصرها في الحدود) ورأس السهم
  const dx = pick.tip.x - badge.x
  const dy = pick.tip.y - badge.y
  const dist = Math.hypot(dx, dy) || 1
  const tail = { x: badge.x + (dx / dist) * r * TAIL_GAP, y: badge.y + (dy / dist) * r * TAIL_GAP }
  return { r, badge, tail, tip: pick.tip, below, side }
}

/**
 * مسار السهم الملتفّ: يسير من الذيل نحو الرأس، يدور دورةً كاملة حول نفسه في
 * منتصفه، ثم يستقيم إلى الرأس — فاتجاهه العام هو اتجاه السهم المستقيم القديم.
 * معادلته: تقدّمٌ خطّي على المحور + دائرة تُفتح وتُغلق بنعومة (smoothstep)؛ حين
 * تسبق سرعةُ الدوران سرعةَ التقدّم يرتدّ المسار ويقطع نفسه = اللفّة.
 */
export function loopArrowPath(tail: Pt, tip: Pt, side: 1 | -1, samples = 56): Pt[] {
  const L = Math.hypot(tip.x - tail.x, tip.y - tail.y)
  if (L === 0) return [tail, tip]
  const ax = (tip.x - tail.x) / L
  const ay = (tip.y - tail.y) / L
  const nx = -ay * side
  const ny = ax * side
  const R = L * LOOP_RATIO
  const pts: Pt[] = []
  for (let i = 0; i <= samples; i++) {
    const tau = i / samples
    const s = clamp((tau - 0.1) / 0.76, 0, 1)
    const th = Math.PI * 2 * s * s * (3 - 2 * s)
    const u = L * tau + R * Math.sin(th)
    const v = R * (1 - Math.cos(th))
    pts.push({ x: tail.x + ax * u + nx * v, y: tail.y + ay * u + ny * v })
  }
  return pts
}

/**
 * يرسم سهم الخطوة، ودائرة رقمها إن طُلب (`n` ليس null).
 * الحدود والمقياس بإحداثيات اللوحة الظاهرة (بعد القص) — لا الصورة الأصلية.
 */
export function drawStepBadge(
  c: CanvasRenderingContext2D,
  rect: Rect,
  n: number | null,
  color: string,
  scale: number,
  bounds: { w: number; h: number },
  shape: MarkShape = DEFAULT_MARK_SHAPE,
) {
  const { r, badge, tail, tip, side } = stepBadgeLayout(rect, scale, bounds, shape)
  const L = Math.hypot(tip.x - tail.x, tip.y - tail.y)

  c.save()
  c.strokeStyle = color
  c.lineWidth = arrowLineWidth(scale, r)
  c.lineCap = 'round'
  c.lineJoin = 'round'
  // مسافة أقصر من أن تسع لفّة (لقطة مقصوصة ضيّقة حُصرت دائرتها) ⇒ خط مستقيم صادق
  const pts = L >= r * 1.4 ? loopArrowPath(tail, tip, side) : [tail, tip]
  c.beginPath()
  pts.forEach((p, i) => (i === 0 ? c.moveTo(p.x, p.y) : c.lineTo(p.x, p.y)))
  c.stroke()
  // رأس مفتوح (شيفرون) بالخط الرفيع نفسه — لا مثلّث ممتلئ يثقل على العنصر
  const prev = pts[pts.length - 2]!
  const ang = Math.atan2(tip.y - prev.y, tip.x - prev.x)
  const head = clamp(L * 0.24, 7, r * 0.62)
  const half = Math.PI / 6.4
  c.beginPath()
  c.moveTo(tip.x - head * Math.cos(ang - half), tip.y - head * Math.sin(ang - half))
  c.lineTo(tip.x, tip.y)
  c.lineTo(tip.x - head * Math.cos(ang + half), tip.y - head * Math.sin(ang + half))
  c.stroke()
  c.restore()

  if (n == null) return

  // دائرة الرقم: قاعدة بيضاء (تُقرأ فوق أي لقطة) ⇒ صبغة خفيفة ⇒ حلقة رفيعة ⇒ رقم بلون العلامة
  c.save()
  c.beginPath()
  c.arc(badge.x, badge.y, r, 0, Math.PI * 2)
  c.fillStyle = '#ffffff'
  c.fill()
  c.fillStyle = color
  c.globalAlpha = BADGE_TINT_ALPHA
  c.fill()
  c.globalAlpha = 1
  c.lineWidth = arrowLineWidth(scale, r)
  c.strokeStyle = color
  c.stroke()
  c.font = `700 ${Math.round(r * 1.05)}px 'IBM Plex Sans Arabic', system-ui, sans-serif`
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.fillStyle = color
  c.fillText(String(n), badge.x, badge.y + r * 0.05)
  c.restore()
}
