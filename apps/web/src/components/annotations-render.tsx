import { DEFAULT_MARK_SHAPE, type Annotation, type MarkShape, type Rect } from '@dalili/core'
import { normalizeDrag, RESIZE_HANDLES, handleCenter } from '../editor/rectmath'

/**
 * ANNO-01/EDT-05: محرك رسم الشروحات — استُخلص من StepImage (قانون الحجم ٤٠٠)
 * بلا أي تغيير سلوك، وأُضيف رسم نصّ والرسم الحر ومسار السحب الحيّ.
 * كل الدوال ترسم بإحداثيات الصورة الطبيعية مع إزاحة القص.
 */

/** عرض خط الشرح متناسب مع عرض الصورة الطبيعي — يظل مرئيًا بعد تصغير العرض */
export function lineWidthFor(scale: number): number {
  return Math.min(6, Math.max(2.5, scale * 0.004))
}

/** معرّف قصير للشرح — crypto إن توفّر وإلا بديل زمني */
export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `a_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * صندوق النص (بلاغ المالك 2026-09-04: النص القائم يجب أن يُمسَك ويُحرَّك).
 * النص RTL يمتد يسارًا من مرساته (textAlign right) — التقدير 0.55em للحرف
 * كافٍ للإمساك، والهامش في hitTextAnnotation يعوّض فروق القياس.
 */
export function textBoxFor(a: Annotation, scale: number): Rect | null {
  if (a.type !== 'text' || !a.rect || !a.text) return null
  const size = Math.min(64, Math.max(22, scale * 0.028))
  const w = a.text.length * size * 0.55
  const h = size * 1.3
  return { x: a.rect.x - w, y: a.rect.y, w, h }
}

/** أول نص تحت نقطة طبيعية (الأعلى رسمًا يُمسَك أولًا) — بهامش رحيم يسهّل الإمساك */
export function hitTextAnnotation(annotations: Annotation[], nx: number, ny: number, scale: number): Annotation | null {
  for (let i = annotations.length - 1; i >= 0; i--) {
    const a = annotations[i]!
    const b = textBoxFor(a, scale)
    if (!b) continue
    const pad = Math.max(10, b.h * 0.3)
    if (nx >= b.x - pad && nx <= b.x + b.w + pad && ny >= b.y - pad && ny <= b.y + b.h + pad) return a
  }
  return null
}

/**
 * إطار الهدف: خط صلب واحد بسمك أدوات الريشة نفسه (طلب المالك 2026-09-01).
 * `alpha` مُضاعِف شفافية (١ للمحفوظ، ٠٫٥ لمعاينة التحريك)، و`shape` يبدّل
 * المسار بين مستطيل وقطع ناقص يتوسّط الإطار (طلب المالك 2026-09-04).
 * المستطيل **قائم الزوايا** لا مدوّر (طلب المالك 2026-09-10).
 */
export function drawMark(
  c: CanvasRenderingContext2D,
  r: Rect,
  color: string,
  scale: number,
  alpha = 1,
  shape: MarkShape = DEFAULT_MARK_SHAPE,
) {
  const pad = Math.max(6, Math.round(scale * 0.004))
  const b = { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 }
  c.save()
  c.strokeStyle = color
  c.globalAlpha = alpha
  c.lineWidth = lineWidthFor(scale)
  if (shape === 'ellipse') {
    // قطع ناقص محيط بالإطار — يصير دائرة تامّة حين يتساوى ضلعا الهدف
    c.beginPath()
    c.ellipse(b.x + b.w / 2, b.y + b.h / 2, Math.abs(b.w / 2), Math.abs(b.h / 2), 0, 0, Math.PI * 2)
  } else {
    roundRect(c, b, 0)
  }
  c.stroke()
  c.restore()
}

/** S3+: مقابض تحجيم إطار الهدف — مربّعات بيضاء محدّدة بلون الإطار عند أركانه */
export function drawHandles(c: CanvasRenderingContext2D, r: Rect, scale: number, color: string) {
  const s = Math.max(7, Math.round(scale * 0.007)) // نصف ضلع المربّع
  c.save()
  c.fillStyle = '#ffffff'
  c.strokeStyle = color
  c.lineWidth = Math.max(1.5, scale * 0.0016)
  for (const h of RESIZE_HANDLES) {
    const p = handleCenter(r, h)
    c.beginPath()
    c.rect(p.x - s, p.y - s, s * 2, s * 2)
    c.fill()
    c.stroke()
  }
  c.restore()
}

/** مسار مستطيل بزوايا دائرية — يسقط إلى مستطيل حادّ حيث لا roundRect */
function roundRect(c: CanvasRenderingContext2D, b: Rect, rad: number) {
  c.beginPath()
  if (typeof c.roundRect === 'function') c.roundRect(b.x, b.y, b.w, b.h, rad)
  else c.rect(b.x, b.y, b.w, b.h)
}

/** رسم شرح واحد بإحداثيات الصورة الطبيعية (مع إزاحة القص) */
export function drawAnnotation(c: CanvasRenderingContext2D, a: Annotation, crop: Rect | undefined, scale: number) {
  const ox = crop?.x ?? 0
  const oy = crop?.y ?? 0
  const lw = lineWidthFor(scale)
  c.save()
  c.strokeStyle = a.color
  c.fillStyle = a.color
  c.lineWidth = lw
  c.lineCap = 'round'
  c.lineJoin = 'round'

  if (a.type === 'number' && a.rect) {
    const r = Math.min(40, Math.max(16, scale * 0.02))
    const cx = a.rect.x - ox
    const cy = a.rect.y - oy
    c.beginPath()
    c.arc(cx, cy, r, 0, Math.PI * 2)
    c.fill()
    c.fillStyle = '#ffffff'
    c.font = `700 ${Math.round(r * 1.15)}px 'IBM Plex Sans Arabic', system-ui, sans-serif`
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillText(String(a.n ?? 1), cx, cy + r * 0.05)
    c.restore()
    return
  }

  // EDT-05: النص المكتوب — بالخط الأساسي المقروء، موضع rect زاويته العلوية
  if (a.type === 'text' && a.rect && a.text) {
    const size = Math.min(64, Math.max(22, scale * 0.028))
    c.fillStyle = a.color
    c.font = `700 ${size}px 'IBM Plex Sans Arabic', system-ui, sans-serif`
    c.textAlign = 'right'
    c.textBaseline = 'top'
    c.fillText(a.text, a.rect.x - ox, a.rect.y - oy)
    c.restore()
    return
  }

  // EDT-05: الرسم الحر — مسار نقطي بخط الريشة
  if (a.type === 'draw' && a.path && a.path.length > 1) {
    c.beginPath()
    a.path.forEach((p, i) => {
      const x = p.x - ox
      const y = p.y - oy
      if (i === 0) c.moveTo(x, y)
      else c.lineTo(x, y)
    })
    c.stroke()
    c.restore()
    return
  }

  if ((a.type === 'arrow' || a.type === 'curved-arrow') && a.from && a.to) {
    const fx = a.from.x - ox
    const fy = a.from.y - oy
    const tx = a.to.x - ox
    const ty = a.to.y - oy
    strokeArrow(c, fx, fy, tx, ty, lw, a.type === 'curved-arrow')
    c.restore()
    return
  }

  if (a.rect) {
    const x = a.rect.x - ox
    const y = a.rect.y - oy
    const { w, h } = a.rect
    if (a.type === 'rect') {
      c.strokeRect(x, y, w, h)
    } else if (a.type === 'ellipse') {
      c.beginPath()
      c.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2)
      c.stroke()
    } else if (a.type === 'oval') {
      strokeHandOval(c, x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2))
    }
  }
  c.restore()
}

/**
 * طلب المالك 2026-09-11 (العلاج الجذري): الرقم والسهم **مثبَّتان على الزر نفسه**
 * لا على مركز الصورة. العطب القديم كان يحسب الاتجاه «من مركز الزر نحو مركز اللقطة»
 * فيضطرب ويُقذف حين يكون الزر وسط الشاشة (بلاغ المالك: «الوسط خطأ، الأطراف صحيحة»)
 * — والعارض أصلاً يمركز الزر في المنظار، فمرجع «مركز الصورة» لا علاقة له بما يُرى.
 *
 * القاعدة الجديدة (متوقَّعة في كل الحالات): الرقم **فوق الزر** متمركزًا أفقيًّا عليه،
 * والسهم قصير من الرقم إلى حافة الزر العليا. وإن كان الزر ملاصقًا لأعلى اللقطة
 * يُقلب الرقم أسفله والسهم يشير صعودًا. **رقم عاري بلا إطار** (الدائرة تسرق ضوء
 * الزر — طلب سابق) بحدّ أبيض رفيع للقراءة، و**السهم بلونه فقط بلا هالة بيضاء**
 * (الهالة كانت كتلة بيضاء تشوّش على اللقطات الداكنة). معاينة حيّة لا محتوى محفوظًا.
 */
export function drawStepBadge(
  c: CanvasRenderingContext2D,
  rect: Rect,
  n: number,
  color: string,
  scale: number,
  bounds: { w: number; h: number },
) {
  const r = Math.min(40, Math.max(16, scale * 0.02))
  const gap = Math.max(r * 1.6, scale * 0.03) // فجوة الرقم عن حافة الزر
  const lw = Math.max(3, lineWidthFor(scale))
  const m = Math.max(6, Math.round(scale * 0.004)) + lw // خارج هامش الزر المرسوم وسمك خطه
  const mcx = rect.x + rect.w / 2

  // الوضع الافتراضي: الرقم فوق الزر. يُقلب أسفله إن لم يتّسع فوقه (زر قرب الحافة العليا).
  const aboveY = rect.y - gap - r
  const placeBelow = aboveY < r * 1.6
  const cx = Math.min(Math.max(r * 1.6, mcx), Math.max(r * 1.6, bounds.w - r * 1.6))
  const rawCy = placeBelow ? rect.y + rect.h + gap + r : aboveY
  const cy = Math.min(Math.max(r * 1.6, rawCy), Math.max(r * 1.6, bounds.h - r * 1.6))

  // السهم القصير: من طرف الرقم المواجه للزر إلى حافة الزر القريبة (بهامش لا يلامس خطه)
  const dirY = placeBelow ? -1 : 1 // رقم فوق ⇒ السهم ينزل للزر؛ رقم أسفل ⇒ يصعد إليه
  const sx = cx
  const sy = cy + dirY * r * 1.4
  const ex = mcx
  const ey = placeBelow ? rect.y + rect.h + m : rect.y - m

  c.save()
  // السهم بلون العلامة فقط — منحنٍ قليلًا (لا قوسًا)، بلا هالة بيضاء تشوّش الخلفية الداكنة
  c.strokeStyle = color
  c.fillStyle = color
  c.lineWidth = lw
  strokeArrow(c, sx, sy, ex, ey, lw, true, 0.14)
  c.restore()

  // الرقم العاري — بلون العلامة، وحدّ أبيض رفيع خلفه للقراءة على أي خلفية
  c.save()
  c.font = `700 ${Math.round(r * 1.05)}px 'IBM Plex Sans Arabic', system-ui, sans-serif`
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.lineWidth = Math.max(2, r * 0.14)
  c.strokeStyle = '#ffffff'
  c.strokeText(String(n), cx, cy + r * 0.05)
  c.fillStyle = color
  c.fillText(String(n), cx, cy + r * 0.05)
  c.restore()
}

/** رسم شكل قيد السحب (معاينة حيّة) بإحداثيات العرض المحوَّلة للطبيعية */
export function drawPreview(
  c: CanvasRenderingContext2D,
  d: { x0: number; y0: number; x1: number; y1: number },
  tool: string,
  color: string,
  scale: number,
) {
  const canvas = c.canvas
  const scaleX = canvas.width / canvas.getBoundingClientRect().width
  const scaleY = canvas.height / canvas.getBoundingClientRect().height
  const x0 = d.x0 * scaleX
  const y0 = d.y0 * scaleY
  const x1 = d.x1 * scaleX
  const y1 = d.y1 * scaleY
  const r = normalizeDrag({ x0, y0, x1, y1 })
  const lw = lineWidthFor(scale)
  c.save()
  c.strokeStyle = color
  c.fillStyle = color
  c.lineWidth = lw
  c.lineCap = 'round'
  c.lineJoin = 'round'
  c.globalAlpha = 0.9
  if (tool === 'rect') c.strokeRect(r.x, r.y, r.w, r.h)
  else if (tool === 'ellipse') {
    c.beginPath()
    c.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2)
    c.stroke()
  } else if (tool === 'oval') strokeHandOval(c, r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2)
  else if (tool === 'arrow' || tool === 'curved-arrow') strokeArrow(c, x0, y0, x1, y1, lw, tool === 'curved-arrow')
  else if (tool === 'number') {
    const rad = Math.min(40, Math.max(16, scale * 0.02))
    c.beginPath()
    c.arc(x1, y1, rad, 0, Math.PI * 2)
    c.fill()
  }
  c.restore()
}

/** EDT-05: معاينة مسار الرسم الحر أثناء السحب — نقاط معروضة تُحوَّل إلى فضاء اللوحة */
export function drawStrokePreview(
  c: CanvasRenderingContext2D,
  pts: Array<{ x: number; y: number }>,
  color: string,
  scale: number,
) {
  if (pts.length === 0) return
  const canvas = c.canvas
  const box = canvas.getBoundingClientRect()
  if (box.width === 0 || box.height === 0) return
  const scaleX = canvas.width / box.width
  const scaleY = canvas.height / box.height
  c.save()
  c.strokeStyle = color
  c.lineWidth = lineWidthFor(scale)
  c.lineCap = 'round'
  c.lineJoin = 'round'
  c.globalAlpha = 0.9
  c.beginPath()
  pts.forEach((p, i) => {
    const x = p.x * scaleX
    const y = p.y * scaleY
    if (i === 0) c.moveTo(x, y)
    else c.lineTo(x, y)
  })
  c.stroke()
  c.restore()
}

/** سهم مستقيم أو منحنٍ برأس مثلّث ممتلئ */
function strokeArrow(
  c: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  lw: number,
  curved: boolean,
  /** نسبة تقويس المسار من طوله — الافتراضي كفاية لأداة السهم المنحني */
  bendRatio = 0.25,
) {
  const head = Math.max(10, lw * 3.2)
  let angle: number
  c.beginPath()
  c.moveTo(x0, y0)
  if (curved) {
    // نقطة تحكّم منحرفة عموديًا عن منتصف المسار لتقويس السهم
    const mx = (x0 + x1) / 2
    const my = (y0 + y1) / 2
    const dx = x1 - x0
    const dy = y1 - y0
    const len = Math.hypot(dx, dy) || 1
    const bend = Math.min(60, len * bendRatio)
    const cx = mx + (-dy / len) * bend
    const cy = my + (dx / len) * bend
    c.quadraticCurveTo(cx, cy, x1, y1)
    angle = Math.atan2(y1 - cy, x1 - cx)
  } else {
    c.lineTo(x1, y1)
    angle = Math.atan2(y1 - y0, x1 - x0)
  }
  c.stroke()
  // رأس السهم
  c.beginPath()
  c.moveTo(x1, y1)
  c.lineTo(x1 - head * Math.cos(angle - Math.PI / 7), y1 - head * Math.sin(angle - Math.PI / 7))
  c.lineTo(x1 - head * Math.cos(angle + Math.PI / 7), y1 - head * Math.sin(angle + Math.PI / 7))
  c.closePath()
  c.fill()
}

/** بيضاوي «مرسوم باليد» — مساران متموّجان قليلًا بإزاحة محسوبة (لا عشوائية تهتزّ) */
function strokeHandOval(c: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number) {
  const steps = 48
  for (let pass = 0; pass < 2; pass++) {
    c.beginPath()
    for (let i = 0; i <= steps; i++) {
      const th = (i / steps) * Math.PI * 2 + pass * 0.12
      const wob = 1 + Math.sin(th * 3 + pass) * 0.03
      const x = cx + Math.cos(th) * rx * wob
      const y = cy + Math.sin(th) * ry * wob
      if (i === 0) c.moveTo(x, y)
      else c.lineTo(x, y)
    }
    c.stroke()
  }
}
