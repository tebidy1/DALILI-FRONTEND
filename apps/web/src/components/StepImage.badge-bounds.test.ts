import { describe, expect, it } from 'vitest'
import { drawStepBadge } from './annotations-render'

/**
 * طلب المالك 2026-09-11 (تصحيح مكان الرقم/السهم): شارة الهدف تُرسم بحدود اللوحة
 * الظاهرة (cw×ch بعد القص) لا الصورة الأصلية. كان الاستدعاء يمرّر أبعاد الصورة
 * الأصلية بينما مستطيل الهدف بإحداثيات اللوحة، فينحرف الرقم والسهم في اللقطات
 * المقصوصة. نثبّت العقد: الرقم يبقى **داخل** الحدود الممرّرة مهما صغرت.
 */

function textCtx() {
  const fills: Array<{ text: string; x: number; y: number }> = []
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
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    closePath() {},
    stroke() {},
    fill() {},
    fillText(text: string, x: number, y: number) {
      fills.push({ text, x, y })
    },
    strokeText() {},
  }
  return { c: c as unknown as CanvasRenderingContext2D, fills }
}

describe('drawStepBadge — الرقم داخل الحدود الممرّرة (لا انحراف على القص)', () => {
  const color = '#e11d48'

  it('لقطة مقصوصة صغيرة: مركز الرقم يبقى داخل حدود اللوحة لا الصورة الأصلية', () => {
    const { c, fills } = textCtx()
    // هدف قرب حافة لوحة مقصوصة صغيرة (600×400) — الحدّ يجب أن يكون 600×400
    const rect = { x: 560, y: 360, w: 30, h: 20 }
    const bounds = { w: 600, h: 400 }
    drawStepBadge(c, rect, 2, color, bounds.w, bounds)
    const num = fills.find((f) => f.text === '2')!
    expect(num).toBeDefined()
    const r = Math.min(40, Math.max(16, bounds.w * 0.02))
    expect(num.x).toBeGreaterThanOrEqual(r * 1.6)
    expect(num.x).toBeLessThanOrEqual(bounds.w - r * 1.6)
    expect(num.y).toBeGreaterThanOrEqual(r * 1.6)
    expect(num.y).toBeLessThanOrEqual(bounds.h - r * 1.6 + r * 0.05)
  })

  it('إطار عريض (شريط بعرض الشاشة): الرقم قرب الشريط لا مقذوفًا بنصف عرضه', () => {
    // طلب المالك 2026-09-11: كان البُعد = نصف قطر الإطار القُطري، فيُقذف الشريط
    // العريض ~٩٠٠px بعيدًا (خارج امتداده الأفقي). الآن الرقم متمركز فوق الزر فيبقى قريبًا.
    const { c, fills } = textCtx()
    const rect = { x: 52, y: 565, w: 1276, h: 72 } // شريط بعرض الشاشة تقريبًا
    const bounds = { w: 1866, h: 1438 }
    drawStepBadge(c, rect, 3, color, bounds.w, bounds)
    const num = fills.find((f) => f.text === '3')!
    expect(num).toBeDefined()
    // داخل امتداد الشريط الأفقي لا مقذوفًا خارجه (كان cx≈1500 > الحافة اليمنى 1328)
    expect(num.x).toBeGreaterThanOrEqual(rect.x)
    expect(num.x).toBeLessThanOrEqual(rect.x + rect.w)
    // قريب من الإطار: أقرب من نصف عرضه (كان البُعد ≈ نصف القطر ⇒ بعيد جدًّا)
    const dCenter = Math.hypot(num.x - (rect.x + rect.w / 2), num.y - (rect.y + rect.h / 2))
    expect(dCenter).toBeLessThan(rect.w / 2)
  })

  it('علّة الجذر: زر قرب مركز الصورة ⇒ الرقم متمركز أفقيًّا فوقه لا مقذوفًا نحو مركز اللقطة', () => {
    // العطب القديم: الاتجاه = من مركز الزر نحو مركز الصورة، فيضطرب ويُقذف حين
    // يكون الزر وسط الشاشة (بلاغ المالك: «الوسط خطأ، الأطراف صحيحة»). الآن
    // الموضع مثبَّت على الزر نفسه: الرقم فوقه متمركزًا أفقيًّا مهما كان موقعه.
    const { c, fills } = textCtx()
    const rect = { x: 800, y: 700, w: 100, h: 40 } // قرب مركز اللقطة (1866×1438)
    const bounds = { w: 1866, h: 1438 }
    drawStepBadge(c, rect, 3, color, bounds.w, bounds)
    const num = fills.find((f) => f.text === '3')!
    const mcx = rect.x + rect.w / 2
    expect(Math.abs(num.x - mcx)).toBeLessThan(1) // متمركز على الزر تمامًا
    expect(num.y).toBeLessThan(rect.y) // فوق الزر (الوضع الافتراضي)
  })

  it('زر قرب أعلى اللقطة ⇒ الرقم يُقلب أسفله فلا يخرج من الحدّ', () => {
    const { c, fills } = textCtx()
    const rect = { x: 900, y: 5, w: 120, h: 40 } // ملاصق للحافة العليا
    const bounds = { w: 1866, h: 1438 }
    drawStepBadge(c, rect, 4, color, bounds.w, bounds)
    const num = fills.find((f) => f.text === '4')!
    expect(num.y).toBeGreaterThan(rect.y + rect.h) // أسفل الزر لا فوقه
  })

  it('يكتب الرقم الحقيقي الممرّر (لا يُبدّله)', () => {
    const { c, fills } = textCtx()
    drawStepBadge(c, { x: 100, y: 100, w: 40, h: 40 }, 5, color, 1200, { w: 1200, h: 800 })
    expect(fills.some((f) => f.text === '5')).toBe(true)
  })
})
