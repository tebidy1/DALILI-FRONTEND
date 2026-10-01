import { describe, expect, it } from 'vitest'
import { drawMark, lineWidthFor, markLineWidthFor, MARK_GLASS_ALPHA } from './annotations-render'

/**
 * طلب المالك 2026-09-01: إطار الهدف كان «متوهّجًا» (هالة شفافة عريضة + خط) —
 * صار خطًا احترافيًا واحدًا رفيعًا بسمك أدوات الريشة نفسه، بلا توهّج.
 * طلب المالك 2026-09-27: **طبقة زجاجية** داخل الشكل بلون الإطار نفسه —
 * تعبئة خفيفة تميّز دون إخفاء، والخط الصلب فوقها.
 * نختبر منطق الرسم بسياق مزيّف يسجّل كل نداء fill/stroke بحالته اللحظية.
 */

interface StrokeRecord {
  lineWidth: number
  globalAlpha: number
  strokeStyle: string
}

function fakeCtx() {
  const strokes: StrokeRecord[] = []
  const fills: Array<{ globalAlpha: number; fillStyle: string }> = []
  const c = {
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    globalAlpha: 1,
    save() {},
    restore() {},
    beginPath() {},
    rect() {},
    roundRect() {},
    fill() {
      fills.push({ globalAlpha: this.globalAlpha, fillStyle: this.fillStyle })
    },
    stroke() {
      strokes.push({ lineWidth: this.lineWidth, globalAlpha: this.globalAlpha, strokeStyle: this.strokeStyle })
    },
  }
  return { c: c as unknown as CanvasRenderingContext2D, strokes, fills }
}

describe('drawMark — خط واحد رفيع مع طبقة زجاجية بلون الإطار', () => {
  const rect = { x: 100, y: 100, w: 120, h: 40 }
  const scale = 1400

  it('يرسم تمريرة خط واحدة فقط — لا هالة شفافة عريضة خلفها', () => {
    const { c, strokes } = fakeCtx()
    drawMark(c, rect, '#e11d48', scale)
    expect(strokes).toHaveLength(1)
  })

  it('السمك خطًّا رفيعًا مستقلًّا (markLineWidthFor) أرفع من سمك الريشة (طلب 2026-09-29)', () => {
    const { c, strokes } = fakeCtx()
    drawMark(c, rect, '#e11d48', scale)
    expect(strokes[0]!.lineWidth).toBe(markLineWidthFor(scale))
    expect(strokes[0]!.lineWidth).toBeLessThan(lineWidthFor(scale))
  })

  it('الخط صلب معتم وبلون الإطار الصريح', () => {
    const { c, strokes } = fakeCtx()
    drawMark(c, rect, '#e11d48', scale)
    expect(strokes[0]!.globalAlpha).toBe(1)
    expect(strokes[0]!.strokeStyle).toBe('#e11d48')
  })

  it('الطبقة الزجاجية: تعبئة واحدة بنفس اللون وشفافية خفيفة قبل الخط (طلب 2026-09-27)', () => {
    const { c, fills } = fakeCtx()
    drawMark(c, rect, '#ea580c', scale)
    expect(fills).toHaveLength(1)
    expect(fills[0]!.fillStyle).toBe('#ea580c')
    expect(fills[0]!.globalAlpha).toBeCloseTo(MARK_GLASS_ALPHA)
  })

  it('معاينة التحريك الحيّة (alpha=0.5): الزجاجية تتبعها والخط يبقى بنصف الشفافية', () => {
    const { c, strokes, fills } = fakeCtx()
    drawMark(c, rect, '#e11d48', scale, 0.5)
    expect(strokes).toHaveLength(1)
    expect(strokes[0]!.globalAlpha).toBe(0.5)
    expect(fills[0]!.globalAlpha).toBeCloseTo(0.5 * MARK_GLASS_ALPHA)
  })
})

/** يسجّل أي مسار استُعمل (مستطيل مدوّر أم قطع ناقص) مع وسائطه */
function pathCtx() {
  const calls: Array<{ fn: string; args: number[] }> = []
  const c = {
    strokeStyle: '',
    lineWidth: 0,
    globalAlpha: 1,
    save() {},
    restore() {},
    beginPath() {},
    stroke() {},
    fill() {},
    rect(...args: number[]) {
      calls.push({ fn: 'rect', args })
    },
    roundRect(...args: number[]) {
      calls.push({ fn: 'roundRect', args })
    },
    ellipse(...args: number[]) {
      calls.push({ fn: 'ellipse', args })
    },
  }
  return { c: c as unknown as CanvasRenderingContext2D, calls }
}

/**
 * طلب المالك 2026-09-04: الإطار يقبل شكلًا بيضاويًا/دائريًا كما في وورد.
 * الشكل يتبع مستطيل الهدف نفسه (بهامشه) فيصير دائرة حين تتساوى أبعاده.
 */
describe('drawMark — شكل الإطار: مستطيل أو بيضاوي', () => {
  const rect = { x: 100, y: 100, w: 120, h: 40 }
  const scale = 1400

  it('الافتراضي (بلا شكل) مستطيل مدوّر — سلوك اللقطات القديمة بحرفه', () => {
    const { c, calls } = pathCtx()
    drawMark(c, rect, '#e11d48', scale)
    expect(calls.map((k) => k.fn)).toEqual(['roundRect'])
  })

  it('شكل ellipse يرسم قطعًا ناقصًا لا مستطيلًا', () => {
    const { c, calls } = pathCtx()
    drawMark(c, rect, '#e11d48', scale, 1, 'ellipse')
    expect(calls.map((k) => k.fn)).toEqual(['ellipse'])
  })

  it('القطع الناقص يتوسّط الإطار بهامشه ويأخذ نصفَي قطريه منه', () => {
    const { c, calls } = pathCtx()
    drawMark(c, rect, '#e11d48', scale, 1, 'ellipse')
    const pad = Math.max(6, Math.round(scale * 0.004))
    const [cx, cy, rx, ry] = calls[0]!.args
    expect(cx).toBe(rect.x + rect.w / 2)
    expect(cy).toBe(rect.y + rect.h / 2)
    expect(rx).toBe(rect.w / 2 + pad)
    expect(ry).toBe(rect.h / 2 + pad)
  })

  it('إطار مربّع الأبعاد يعطي دائرة تامّة (نصفا القطرين متساويان)', () => {
    const { c, calls } = pathCtx()
    drawMark(c, { x: 0, y: 0, w: 80, h: 80 }, '#e11d48', scale, 1, 'ellipse')
    const [, , rx, ry] = calls[0]!.args
    expect(rx).toBe(ry)
  })
})
