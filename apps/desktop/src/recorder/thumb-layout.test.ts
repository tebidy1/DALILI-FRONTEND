import { describe, expect, it } from 'vitest'
import { thumbLayout } from './thumb-layout'

/** تخطيط مصغّرة الخطوة الأحدث (المرحلة ١): رياضيّات PreviewShot مُستخلَصةً
 *  نقيّةً — zoomFrame يوسّط العلامة ويكبّرها، markBoxRect يعطي نسبتها. */
describe('thumbLayout — تكبير يوسّط العلامة داخل نافذة المصغّرة', () => {
  it('علامة صغيرة وسط لقطة كبيرة ⇒ تحويل مكبّر ونسب علامة داخل [0,100]', () => {
    const r = thumbLayout({ x: 490, y: 245, w: 20, h: 20 }, 1000, 500, 300, 180)!
    expect(r).not.toBeNull()
    expect(r.layerTransform).toMatch(/scale\(/)
    expect(r.layerTransform).toContain('translate(')
    expect(r.markPct.left).toBeGreaterThanOrEqual(0)
    expect(r.markPct.left).toBeLessThanOrEqual(100)
    expect(r.markPct.top).toBeGreaterThanOrEqual(0)
    expect(r.markPct.width).toBeGreaterThan(0)
    expect(r.markPct.height).toBeGreaterThan(0)
  })

  it('علامة عند حافة الصورة ⇒ الإزاحة تُقصّ فلا حواف فارغة', () => {
    const r = thumbLayout({ x: 0, y: 0, w: 30, h: 30 }, 600, 400, 300, 180)!
    expect(r).not.toBeNull()
    // النسب تُقاس على الصورة كاملةً حتى لو خرج الحدّ بصريًّا (التقصير للنافذة)
    expect(r.markPct.left).toBeGreaterThanOrEqual(0)
  })

  it('مدخلات صفريّة أو منحلّة ⇒ null (تراجع صادق بلا صورة)', () => {
    expect(thumbLayout({ x: 0, y: 0, w: 0, h: 0 }, 1000, 500, 300, 180)).toBeNull()
    expect(thumbLayout({ x: 10, y: 10, w: 10, h: 10 }, 0, 500, 300, 180)).toBeNull()
    expect(thumbLayout({ x: 10, y: 10, w: 10, h: 10 }, 1000, 500, 0, 180)).toBeNull()
  })
})
