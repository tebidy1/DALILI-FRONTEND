import { describe, expect, it } from 'vitest'
import { clampRect, cursorForHandle, displayToNatural, hitMarkHandle, normalizeDrag, resizeRect } from './rectmath'

describe('رياضيات مستطيلات المحرر', () => {
  it('السحب بأي اتجاه يعطي مستطيلًا موجبًا', () => {
    const r = normalizeDrag({ x0: 100, y0: 80, x1: 40, y1: 120 })
    expect(r).toEqual({ x: 40, y: 80, w: 60, h: 40 })
  })

  it('الحصر داخل حدود اللوحة', () => {
    const r = clampRect({ x: -10, y: 200, w: 900, h: 50 }, 800, 600)
    expect(r).toEqual({ x: 0, y: 200, w: 800, h: 50 })
    expect(clampRect({ x: 700, y: 500, w: 50, h: 50 }, 100, 100)).toEqual({ x: 100, y: 100, w: 0, h: 0 })
  })

  it('تحويل عرض → طبيعي مع إزاحة القص', () => {
    // لوحة عرض 400px تمثل صورة طبيعية 1600px بلا قص: scale = 4
    const r = displayToNatural({ x: 50, y: 25, w: 100, h: 50 }, 4, 4)
    expect(r).toEqual({ x: 200, y: 100, w: 400, h: 200 })
    // مع قص مسبق عند (100, 200): الإحداثيات الأصلية تنزاح بمقدار القص
    const rc = displayToNatural({ x: 50, y: 25, w: 100, h: 50 }, 4, 4, { x: 100, y: 200, w: 800, h: 600 })
    expect(rc).toEqual({ x: 300, y: 300, w: 400, h: 200 })
  })
})

describe('تحكّم إطار الهدف — إصابة المقابض ومؤشّراتها والتحجيم', () => {
  const r = { x: 100, y: 100, w: 200, h: 100 } // مستطيل معروض

  it('نقطة قرب ركن تُصيب المقبض الركني، وقرب حافة تُصيب الحافة', () => {
    expect(hitMarkHandle(r, 100, 100, 8)).toBe('nw')
    expect(hitMarkHandle(r, 300, 200, 8)).toBe('se')
    expect(hitMarkHandle(r, 200, 100, 8)).toBe('n') // منتصف الحافة العليا
    expect(hitMarkHandle(r, 300, 150, 8)).toBe('e') // منتصف الحافة اليمنى
  })

  it('داخل الجسم = تحريك، وخارج الإطار كليًّا = لا مقبض', () => {
    expect(hitMarkHandle(r, 200, 150, 8)).toBe('move')
    expect(hitMarkHandle(r, 500, 500, 8)).toBeNull()
  })

  it('شكل غير منشَّط: لا مقابض تُصطاد — جسمه وحده يُمسك (انقر لتنشّط ثم حجّم)', () => {
    expect(hitMarkHandle(r, 100, 100, 8, false)).toBe('move') // ركن nw صار جسمًا
    expect(hitMarkHandle(r, 300, 200, 8, false)).toBe('move')
    expect(hitMarkHandle(r, 96, 96, 8, false)).toBeNull() // خارج الجسم رغم قربه من الركن
  })

  it('كل مقبض يعطي مؤشّر CSS المتوقّع', () => {
    expect(cursorForHandle('nw')).toBe('nwse-resize')
    expect(cursorForHandle('ne')).toBe('nesw-resize')
    expect(cursorForHandle('n')).toBe('ns-resize')
    expect(cursorForHandle('e')).toBe('ew-resize')
    expect(cursorForHandle(null)).toBe('')
  })

  /**
   * طلب المالك 2026-09-04: «لتحريك موضع الشكل يتحول المؤشر إلى مقبض» — لغة
   * الإمساك في وورد/فيغما: يد مفتوحة فوق الجسم، ومقبوضة أثناء السحب. المقابض
   * الاتجاهية لا تتبدّل بالسحب (سهم التحجيم يظل هو نفسه أثناءه).
   */
  it('جسم الإطار مقبض يد: مفتوحة بالمرور ومقبوضة أثناء السحب', () => {
    expect(cursorForHandle('move')).toBe('grab')
    expect(cursorForHandle('move', true)).toBe('grabbing')
    expect(cursorForHandle('se', true)).toBe('nwse-resize')
  })

  it('التحريك يزيح الإطار ويُحصر داخل الصورة', () => {
    const nat = { x: 100, y: 100, w: 200, h: 100 }
    expect(resizeRect(nat, 'move', 50, -30, 1000, 800)).toEqual({ x: 150, y: 70, w: 200, h: 100 })
    // لا يخرج عن الحافة العليا/اليسرى
    expect(resizeRect(nat, 'move', -500, -500, 1000, 800)).toEqual({ x: 0, y: 0, w: 200, h: 100 })
  })

  it('سحب الركن SE يكبّر العرض والارتفاع؛ الحافة W تحرّك اليسار وتثبّت اليمين', () => {
    const nat = { x: 100, y: 100, w: 200, h: 100 }
    expect(resizeRect(nat, 'se', 40, 20, 1000, 800)).toEqual({ x: 100, y: 100, w: 240, h: 120 })
    // W: اليسار +30 فيصير x=130 والعرض ينقص بنفس القدر (اليمين ثابت عند 300)
    expect(resizeRect(nat, 'w', 30, 0, 1000, 800)).toEqual({ x: 130, y: 100, w: 170, h: 100 })
  })

  it('التحجيم يحترم أدنى حجم فلا ينقلب المستطيل', () => {
    const nat = { x: 100, y: 100, w: 200, h: 100 }
    const shrunk = resizeRect(nat, 'e', -1000, 0, 1000, 800)
    expect(shrunk.w).toBeGreaterThanOrEqual(8)
    expect(shrunk.x).toBe(100)
  })
})
