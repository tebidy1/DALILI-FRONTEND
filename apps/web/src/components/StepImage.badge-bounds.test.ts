import { describe, expect, it } from 'vitest'
import { lineWidthFor } from './annotations-render'
import { BADGE_TINT_ALPHA, drawStepBadge, loopArrowPath, stepBadgeLayout } from './step-badge'

/**
 * طلب المالك 2026-09-11 (تصحيح مكان الرقم/السهم): شارة الهدف تُرسم بحدود اللوحة
 * الظاهرة (cw×ch بعد القص) لا الصورة الأصلية. كان الاستدعاء يمرّر أبعاد الصورة
 * الأصلية بينما مستطيل الهدف بإحداثيات اللوحة، فينحرف الرقم والسهم في اللقطات
 * المقصوصة. نثبّت العقد: الرقم يبقى **داخل** الحدود الممرّرة مهما صغرت.
 *
 * طلب المالك 2026-10-02: الشارة **خفيفة** (لا تسرق الضوء من إطار الهدف)، والسهم
 * **ملتفّ حول نفسه بخط رفيع** يميل بزاوية تتبع موقع العنصر، ويُرسم ولو أُخفي الرقم.
 */

interface Op {
  fn: 'fill' | 'stroke' | 'fillText'
  fillStyle: string
  strokeStyle: string
  globalAlpha: number
  lineWidth: number
  text?: string
  x?: number
  y?: number
}

function textCtx() {
  const ops: Op[] = []
  const snap = (c: Record<string, unknown>, fn: Op['fn'], extra: Partial<Op> = {}): Op => ({
    fn,
    fillStyle: String(c.fillStyle),
    strokeStyle: String(c.strokeStyle),
    globalAlpha: Number(c.globalAlpha),
    lineWidth: Number(c.lineWidth),
    ...extra,
  })
  const c = {
    font: '',
    textAlign: '',
    textBaseline: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
    globalAlpha: 1,
    save() {},
    restore() {},
    beginPath() {},
    arc() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    closePath() {},
    stroke() {
      ops.push(snap(this as unknown as Record<string, unknown>, 'stroke'))
    },
    fill() {
      ops.push(snap(this as unknown as Record<string, unknown>, 'fill'))
    },
    fillText(text: string, x: number, y: number) {
      ops.push(snap(this as unknown as Record<string, unknown>, 'fillText', { text, x, y }))
    },
    strokeText() {},
  }
  const fills = () => ops.filter((o) => o.fn === 'fillText').map((o) => ({ text: o.text!, x: o.x!, y: o.y! }))
  return { c: c as unknown as CanvasRenderingContext2D, ops, fills }
}

describe('drawStepBadge — الرقم داخل الحدود الممرّرة (لا انحراف على القص)', () => {
  const color = '#e11d48'

  it('لقطة مقصوصة صغيرة: مركز الرقم يبقى داخل حدود اللوحة لا الصورة الأصلية', () => {
    const { c, fills } = textCtx()
    // هدف قرب حافة لوحة مقصوصة صغيرة (600×400) — الحدّ يجب أن يكون 600×400
    const rect = { x: 560, y: 360, w: 30, h: 20 }
    const bounds = { w: 600, h: 400 }
    drawStepBadge(c, rect, 2, color, bounds.w, bounds)
    const num = fills().find((f) => f.text === '2')!
    expect(num).toBeDefined()
    const r = Math.min(40, Math.max(16, bounds.w * 0.02))
    expect(num.x).toBeGreaterThanOrEqual(r * 1.6)
    expect(num.x).toBeLessThanOrEqual(bounds.w - r * 1.6)
    expect(num.y).toBeGreaterThanOrEqual(r * 1.6)
    expect(num.y).toBeLessThanOrEqual(bounds.h - r * 1.6 + r * 0.05)
  })

  it('إطار عريض (شريط بعرض الشاشة): الرقم قرب الشريط لا مقذوفًا بنصف عرضه', () => {
    // طلب المالك 2026-09-11: كان البُعد = نصف قطر الإطار القُطري، فيُقذف الشريط
    // العريض ~٩٠٠px بعيدًا (خارج امتداده الأفقي). الرقم مثبَّت على الزر فيبقى قريبًا.
    const { c, fills } = textCtx()
    const rect = { x: 52, y: 565, w: 1276, h: 72 } // شريط بعرض الشاشة تقريبًا
    const bounds = { w: 1866, h: 1438 }
    drawStepBadge(c, rect, 3, color, bounds.w, bounds)
    const num = fills().find((f) => f.text === '3')!
    expect(num).toBeDefined()
    // داخل امتداد الشريط الأفقي لا مقذوفًا خارجه (كان cx≈1500 > الحافة اليمنى 1328)
    expect(num.x).toBeGreaterThanOrEqual(rect.x)
    expect(num.x).toBeLessThanOrEqual(rect.x + rect.w)
    // قريب من الإطار: أقرب من نصف عرضه (كان البُعد ≈ نصف القطر ⇒ بعيد جدًّا)
    const dCenter = Math.hypot(num.x - (rect.x + rect.w / 2), num.y - (rect.y + rect.h / 2))
    expect(dCenter).toBeLessThan(rect.w / 2)
  })

  it('علّة الجذر: زر قرب مركز الصورة ⇒ الرقم فوقه قريبًا منه، وموضعه **مستقرّ** لا يُقذف', () => {
    // العطب القديم: الاتجاه = من مركز الزر نحو مركز الصورة، فيضطرب ويُقذف حين
    // يكون الزر وسط الشاشة (بلاغ المالك: «الوسط خطأ، الأطراف صحيحة»). الميل الجديد
    // دالّة **متّصلة** لموقع الزر الأفقي — صفر عند المنتصف — فلا قفزة ولا اضطراب:
    // إزاحة الزر بكسلين تزيح الرقم بكسلات قليلة لا عشرات.
    const bounds = { w: 1866, h: 1438 }
    const rect = { x: 883, y: 700, w: 100, h: 40 } // مركزه = منتصف اللقطة تمامًا
    const a = stepBadgeLayout(rect, bounds.w, bounds)
    expect(Math.abs(a.badge.x - (rect.x + rect.w / 2))).toBeLessThan(1) // المنتصف ⇒ بلا ميل
    expect(a.badge.y).toBeLessThan(rect.y) // فوق الزر (الوضع الافتراضي)
    const b = stepBadgeLayout({ ...rect, x: rect.x + 2 }, bounds.w, bounds)
    expect(Math.hypot(b.badge.x - a.badge.x, b.badge.y - a.badge.y)).toBeLessThan(6)
  })

  it('زر قرب أعلى اللقطة ⇒ الرقم يُقلب أسفله فلا يخرج من الحدّ', () => {
    const { c, fills } = textCtx()
    const rect = { x: 900, y: 5, w: 120, h: 40 } // ملاصق للحافة العليا
    const bounds = { w: 1866, h: 1438 }
    drawStepBadge(c, rect, 4, color, bounds.w, bounds)
    const num = fills().find((f) => f.text === '4')!
    expect(num.y).toBeGreaterThan(rect.y + rect.h) // أسفل الزر لا فوقه
  })

  it('يكتب الرقم الحقيقي الممرّر (لا يُبدّله)', () => {
    const { c, fills } = textCtx()
    drawStepBadge(c, { x: 100, y: 100, w: 40, h: 40 }, 5, color, 1200, { w: 1200, h: 800 })
    expect(fills().some((f) => f.text === '5')).toBe(true)
  })
})

describe('طلب المالك 2026-10-02: السهم يميل بزاوية تتبع موقع العنصر', () => {
  const bounds = { w: 1866, h: 1438 }

  it('عنصر يسار اللقطة ⇒ الرقم يمينه (نحو فسحة الوسط)، وعنصر يمينها ⇒ الرقم يساره', () => {
    const left = { x: 120, y: 700, w: 100, h: 40 }
    const right = { x: 1640, y: 700, w: 100, h: 40 }
    const l = stepBadgeLayout(left, bounds.w, bounds)
    const r = stepBadgeLayout(right, bounds.w, bounds)
    expect(l.badge.x).toBeGreaterThan(left.x + left.w / 2 + 10)
    expect(r.badge.x).toBeLessThan(right.x + right.w / 2 - 10)
    // الميل زاويةٌ لا انقلاب: كلاهما يبقى فوق العنصر والسهم ينزل إليه
    expect(l.badge.y).toBeLessThan(left.y)
    expect(r.badge.y).toBeLessThan(right.y)
  })

  it('رأس السهم على حافة الإطار المرسوم لا داخله — مستطيلًا كان أو دائرة ديسكتوب', () => {
    const box = { x: 800, y: 600, w: 72, h: 72 }
    for (const shape of ['rect', 'ellipse'] as const) {
      const lay = stepBadgeLayout({ ...box, x: 300 }, bounds.w, bounds, shape)
      const cx = 300 + box.w / 2
      const cy = box.y + box.h / 2
      const d = Math.hypot(lay.tip.x - cx, lay.tip.y - cy)
      expect(d).toBeGreaterThan(box.w / 2) // خارج الشكل
      expect(d).toBeLessThan(box.w * 1.2) // وملاصق له لا بعيد
    }
  })
})

describe('طلب المالك 2026-10-02: سهم ملتفّ حول نفسه بخط رفيع', () => {
  /** هل تتقاطع القطعتان (p1p2) و(p3p4) تقاطعًا حقيقيًّا؟ */
  function crosses(p1: Pt, p2: Pt, p3: Pt, p4: Pt): boolean {
    const o = (a: Pt, b: Pt, c: Pt) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x))
    return o(p1, p2, p3) !== o(p1, p2, p4) && o(p3, p4, p1) !== o(p3, p4, p2)
  }
  type Pt = { x: number; y: number }

  it('المسار يبدأ عند الذيل وينتهي عند الرأس ويقطع نفسه مرة (لفّة حقيقية)', () => {
    const tail = { x: 400, y: 100 }
    const tip = { x: 430, y: 220 }
    const pts = loopArrowPath(tail, tip, 1)
    expect(pts[0]!.x).toBeCloseTo(tail.x, 5)
    expect(pts[0]!.y).toBeCloseTo(tail.y, 5)
    expect(pts[pts.length - 1]!.x).toBeCloseTo(tip.x, 5)
    expect(pts[pts.length - 1]!.y).toBeCloseTo(tip.y, 5)
    let hits = 0
    for (let i = 0; i < pts.length - 1; i++)
      for (let j = i + 2; j < pts.length - 1; j++)
        if (crosses(pts[i]!, pts[i + 1]!, pts[j]!, pts[j + 1]!)) hits++
    expect(hits).toBe(1)
  })

  it('اللفّة تنقلب جهتها مع `side` — زوايا مختلفة لا قالب واحد', () => {
    const tail = { x: 400, y: 100 }
    const tip = { x: 400, y: 220 }
    const a = loopArrowPath(tail, tip, 1)
    const b = loopArrowPath(tail, tip, -1)
    const maxDx = (pts: Pt[]) => pts.reduce((m, p) => (Math.abs(p.x - 400) > Math.abs(m) ? p.x - 400 : m), 0)
    expect(Math.sign(maxDx(a))).toBe(-Math.sign(maxDx(b)))
  })

  it('خط السهم رفيع — أرفع من سمك الريشة — وبلون العلامة', () => {
    const { c, ops } = textCtx()
    drawStepBadge(c, { x: 800, y: 700, w: 100, h: 40 }, 3, '#ea580c', 1866, { w: 1866, h: 1438 })
    const arrow = ops.filter((o) => o.fn === 'stroke' && o.strokeStyle === '#ea580c')
    expect(arrow.length).toBeGreaterThan(0)
    for (const s of arrow) expect(s.lineWidth).toBeLessThan(lineWidthFor(1866))
  })

  it('الرقم اختياري (مبدّل «إظهار الأرقام»): بلا رقم يبقى السهم ولا يُكتب نص ولا تُرسم دائرة', () => {
    const { c, ops } = textCtx()
    drawStepBadge(c, { x: 800, y: 700, w: 100, h: 40 }, null, '#ea580c', 1866, { w: 1866, h: 1438 })
    expect(ops.some((o) => o.fn === 'fillText')).toBe(false)
    expect(ops.some((o) => o.fn === 'fill')).toBe(false)
    expect(ops.some((o) => o.fn === 'stroke')).toBe(true)
  })
})

describe('طلب المالك 2026-10-02: شارة الرقم خفيفة — لا تسرق الضوء من إطار الهدف', () => {
  it('الدائرة قاعدة بيضاء فوقها صبغة خفيفة بلون العلامة — لا تعبئة برتقالية مصمتة', () => {
    const { c, ops } = textCtx()
    drawStepBadge(c, { x: 800, y: 700, w: 100, h: 40 }, 3, '#ea580c', 1866, { w: 1866, h: 1438 })
    const fills = ops.filter((o) => o.fn === 'fill')
    expect(fills.some((f) => f.fillStyle === '#ffffff' && f.globalAlpha === 1)).toBe(true)
    const tinted = fills.filter((f) => f.fillStyle === '#ea580c')
    expect(tinted).toHaveLength(1)
    expect(tinted[0]!.globalAlpha).toBeCloseTo(BADGE_TINT_ALPHA)
    expect(BADGE_TINT_ALPHA).toBeLessThanOrEqual(0.25)
  })

  it('الرقم بلون العلامة نفسه (كان أبيض على برتقالي مصمت)', () => {
    const { c, ops } = textCtx()
    drawStepBadge(c, { x: 800, y: 700, w: 100, h: 40 }, 3, '#ea580c', 1866, { w: 1866, h: 1438 })
    const num = ops.find((o) => o.fn === 'fillText')!
    expect(num.fillStyle).toBe('#ea580c')
    expect(num.globalAlpha).toBe(1)
  })
})
