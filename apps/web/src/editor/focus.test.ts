import { describe, expect, it } from 'vitest'
import { clampViewport, fitScale, focusViewport, MAX_SCALE, panViewport, zoomAround } from './focus'

/** صورة 2000×1200 داخل منظار 800×500 — النسب واقعية للقطات شاشة فعلية */
const IMG_W = 2000
const IMG_H = 1200
const BOX_W = 800
const BOX_H = 500

describe('fitScale — ملاءمة الصورة كاملة داخل المنظار', () => {
  it('يختار أصغر النسبتين فلا يُقصّ شيء', () => {
    expect(fitScale(IMG_W, IMG_H, BOX_W, BOX_H)).toBeCloseTo(0.4, 5)
  })

  it('صورة أصغر من المنظار لا تُكبَّر فوق حجمها الطبيعي', () => {
    expect(fitScale(400, 300, BOX_W, BOX_H)).toBe(1)
  })

  it('أبعاد صفرية لا تُنتج قسمة على صفر', () => {
    expect(Number.isFinite(fitScale(0, 0, BOX_W, BOX_H))).toBe(true)
  })
})

describe('clampViewport — لا فراغ ولا انزلاق خارج الصورة', () => {
  it('حين تملأ الصورة المنظار: الإزاحة محصورة فلا تظهر فجوة عند الحواف', () => {
    const v = clampViewport({ scale: 1, tx: 500, ty: 500 }, IMG_W, IMG_H, BOX_W, BOX_H)
    expect(v.tx).toBe(0)
    expect(v.ty).toBe(0)
    const v2 = clampViewport({ scale: 1, tx: -9999, ty: -9999 }, IMG_W, IMG_H, BOX_W, BOX_H)
    expect(v2.tx).toBe(BOX_W - IMG_W)
    expect(v2.ty).toBe(BOX_H - IMG_H)
  })

  it('حين تصغر الصورة عن المنظار: تُتوسَّط لا تُلصق بحافة', () => {
    const v = clampViewport({ scale: 0.2, tx: -300, ty: -300 }, IMG_W, IMG_H, BOX_W, BOX_H)
    expect(v.tx).toBeCloseTo((BOX_W - IMG_W * 0.2) / 2, 5)
    expect(v.ty).toBeCloseTo((BOX_H - IMG_H * 0.2) / 2, 5)
  })
})

describe('focusViewport — المنظر الافتتاحي: الصورة كاملة تملأ العرض (قرار «بطاقة ونصف»)', () => {
  const mark = { x: 1500, y: 900, w: 120, h: 40 }

  it('يضع مركز الهدف في مركز المنظار (أو أقرب موضع مسموح)', () => {
    const v = focusViewport(mark, IMG_W, IMG_H, BOX_W, BOX_H)
    const cx = (mark.x + mark.w / 2) * v.scale + v.tx
    const cy = (mark.y + mark.h / 2) * v.scale + v.ty
    expect(cx).toBeGreaterThan(0)
    expect(cx).toBeLessThan(BOX_W)
    expect(cy).toBeGreaterThan(0)
    expect(cy).toBeLessThan(BOX_H)
  })

  it('لا تكبيق على الزر: مقياس الخطوة المُعلَّمة = مقياس غير المُعلَّمة تمامًا (ملء العرض)', () => {
    // طلب المالك 2026-09-01 (اللاحق): اللقطة دائمًا لكامل الشاشة، فبطاقة ثابتة
    // تعرض الصورة كلها؛ العلامة ظاهرة تلقائيًا ولا حاجة لنافذة تكبيق حول الزر.
    const withMark = focusViewport(mark, IMG_W, IMG_H, BOX_W, BOX_H)
    const without = focusViewport(undefined, IMG_W, IMG_H, BOX_W, BOX_H)
    expect(withMark.scale).toBeCloseTo(without.scale, 5)
  })

  it('الصورة كاملة معروضة عرضًا وارتفاعًا — لا جزء مخفي عند فتح الدليل', () => {
    const v = focusViewport(mark, IMG_W, IMG_H, BOX_W, BOX_H)
    const visibleW = BOX_W / v.scale
    const visibleH = BOX_H / v.scale
    expect(visibleW).toBeCloseTo(IMG_W, 3) // ملء العرض: كل عرض الصورة داخل المنظار
    expect(visibleH).toBeGreaterThanOrEqual(IMG_H - 1) // وارتفاعها كاملًا أيضًا (16:9 في صندوق أعرض نسبةً)
  })

  it('بلا هدف (لقطة قديمة أو خطوة تنقّل): يعود لملاءمة الصورة كاملة', () => {
    const v = focusViewport(undefined, IMG_W, IMG_H, BOX_W, BOX_H)
    expect(v.scale).toBeCloseTo(fitScale(IMG_W, IMG_H, BOX_W, BOX_H), 5)
  })

  it('هدف ضخم يملأ الصورة لا يكبّر فوق الملاءمة — لا تشويه', () => {
    const huge = { x: 0, y: 0, w: IMG_W, h: IMG_H }
    const v = focusViewport(huge, IMG_W, IMG_H, BOX_W, BOX_H)
    expect(v.scale).toBeCloseTo(fitScale(IMG_W, IMG_H, BOX_W, BOX_H), 5)
  })

  it('فيض الارتفاع الطفيف يُحامَل نحو العلامة — الجزء المُعلَّم هو الظاهر، لا قصّ التوسّط الأعمى', () => {
    // صورة مربّعة أعرض نسبةً من الصندوق: ملء العرض يقصّ من الارتفاع؛ علامة أسفل
    // الصورة كانت تسقط خارج القصّ المتوسّط — التبؤير عليها يُبقيها ظاهرة.
    const nearBottom = { x: 400, y: 880, w: 120, h: 40 }
    const v = focusViewport(nearBottom, 1000, 1000, BOX_W, BOX_H)
    expect(v.scale).toBeCloseTo(BOX_W / 1000, 5)
    const cy = (nearBottom.y + nearBottom.h / 2) * v.scale + v.ty
    expect(cy).toBeGreaterThan(0)
    expect(cy).toBeLessThan(BOX_H)
    // وللمقارنة: قصّ التوسّط الأعمى كان سيُخرجها من المنظار (586 > 500)
    const blindCy = (nearBottom.y + nearBottom.h / 2) * v.scale + (BOX_H - 1000 * v.scale) / 2
    expect(blindCy).toBeGreaterThanOrEqual(BOX_H)
  })
})

describe('focusViewport بلا هدف — يملأ عرض المنظار فلا فراغ عرضي حول اللقطة', () => {
  it('صورة أنحف من الصندوق تملأ عرضه بالكامل (لا فجوة جانبية) وأكبر من ملاءمة الاحتواء', () => {
    // صورة مربّعة داخل صندوق أعرض: ملاءمة الاحتواء محدودة بالارتفاع فتترك فراغًا عرضيًا —
    // وهو بالضبط ما اشتكى منه المالك. الملء العرضي يزيله ويكبّر اللقطة قليلًا.
    const v = focusViewport(undefined, 1000, 1000, 800, 500)
    expect(1000 * v.scale).toBeCloseTo(800, 3) // العرض المعروض = عرض الصندوق كاملًا
    expect(v.scale).toBeGreaterThan(fitScale(1000, 1000, 800, 500))
    expect(v.scale).toBeLessThanOrEqual(MAX_SCALE)
  })

  it('صورة أعرض من الصندوق (محدودة بالعرض أصلًا): الملء العرضي يساوي الملاءمة — لا تكبير زائد', () => {
    const v = focusViewport(undefined, 2000, 1200, 800, 500)
    expect(v.scale).toBeCloseTo(fitScale(2000, 1200, 800, 500), 5)
  })
})

describe('panViewport — مقبض اليد يحرّك المنظار المكبّر ثم يحصره', () => {
  it('يزيح tx/ty بمقدار السحب حين تفيض الصورة عن المنظار', () => {
    const v = panViewport({ scale: 1, tx: -200, ty: -100 }, 50, 30, 2000, 1200, 800, 500)
    expect(v.tx).toBe(-150)
    expect(v.ty).toBe(-70)
  })

  it('لا انزلاق خارج الصورة — السحب المفرط يُحصر عند الحافة', () => {
    const v = panViewport({ scale: 1, tx: -50, ty: -50 }, 999, 999, 2000, 1200, 800, 500)
    expect(v.tx).toBe(0)
    expect(v.ty).toBe(0)
  })

  it('صورة تلائم المنظار (غير قابلة للتحريك): تبقى متوسّطة مهما سُحبت', () => {
    const v = panViewport({ scale: 0.2, tx: 0, ty: 0 }, 300, 300, 2000, 1200, 800, 500)
    expect(v.tx).toBeCloseTo((800 - 2000 * 0.2) / 2, 5)
    expect(v.ty).toBeCloseTo((500 - 1200 * 0.2) / 2, 5)
  })
})

describe('zoomAround — تكبير/تصغير حول مركز المنظار', () => {
  it('التكبير يزيد المقياس ويبقي نقطة المركز نفسها تحت المركز', () => {
    const v0 = clampViewport({ scale: 1, tx: -200, ty: -100 }, IMG_W, IMG_H, BOX_W, BOX_H)
    const natBefore = (BOX_W / 2 - v0.tx) / v0.scale
    const v1 = zoomAround(v0, 1.25, BOX_W, BOX_H, IMG_W, IMG_H)
    const natAfter = (BOX_W / 2 - v1.tx) / v1.scale
    expect(v1.scale).toBeCloseTo(1.25, 5)
    expect(natAfter).toBeCloseTo(natBefore, 3)
  })

  it('لا يتجاوز السقف ولا ينزل تحت الملاءمة', () => {
    const fit = fitScale(IMG_W, IMG_H, BOX_W, BOX_H)
    const up = zoomAround({ scale: MAX_SCALE, tx: 0, ty: 0 }, 2, BOX_W, BOX_H, IMG_W, IMG_H)
    expect(up.scale).toBe(MAX_SCALE)
    const down = zoomAround({ scale: fit, tx: 0, ty: 0 }, 0.1, BOX_W, BOX_H, IMG_W, IMG_H)
    expect(down.scale).toBeCloseTo(fit, 5)
  })
})
