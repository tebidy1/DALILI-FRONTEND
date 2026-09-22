import { describe, it, expect } from 'vitest'
// @ts-expect-error — سكربت بناء بلا أنواع؛ نختبر هندسته النقية لا كتابته للملفات
import { GLYPH, sample } from './make-icons.mjs'

const INK = '43,42,38'
const PAPER = '246,245,242'
const CLAY = '201,135,122'
const at = (x: number, y: number) => {
  const c = sample(x, y) as { r: number; g: number; b: number } | null
  return c ? `${c.r},${c.g},${c.b}` : null
}

/** أيقونة «إتقان»: شذرة الشعار — الألف قائمة على امتداد القاف ونقطتاه فوقه. */
describe('هندسة أيقونة إتقان', () => {
  it('الألف تقف على امتداد القاف فعلًا — لا تطفو فوقه ولا تتجاوزه', () => {
    expect(GLYPH.alif.y1).toBe(GLYPH.kashida.y)
    expect(GLYPH.alif.x).toBeGreaterThanOrEqual(GLYPH.kashida.x0)
    expect(GLYPH.alif.x).toBeLessThanOrEqual(GLYPH.kashida.x1)
  })

  it('الألف وحدها ملوّنة — والامتداد والنقطتان بلون الورق', () => {
    expect(at(GLYPH.alif.x, (GLYPH.alif.y0 + GLYPH.alif.y1) / 2)).toBe(CLAY)
    expect(at(GLYPH.kashida.x1 - 0.02, GLYPH.kashida.y)).toBe(PAPER)
    expect(at(GLYPH.dots[0].x, GLYPH.dots[0].y)).toBe(PAPER)
    expect(at(GLYPH.dots[1].x, GLYPH.dots[1].y)).toBe(PAPER)
  })

  it('الأرضية حبر، وخارج المربع المدوَّر شفاف', () => {
    expect(at(0.5, 0.12)).toBe(INK)
    expect(at(0.015, 0.015)).toBeNull()
    expect(at(0.985, 0.985)).toBeNull()
  })

  it('كل معلَم ≥ ١٫٤ بكسل عند 16px — فلا يذوب أصغر مقاس', () => {
    expect(GLYPH.alif.w * 16).toBeGreaterThanOrEqual(1.4)
    expect(GLYPH.kashida.w * 16).toBeGreaterThanOrEqual(1.4)
    expect(GLYPH.dots[0].h * 2 * 16).toBeGreaterThanOrEqual(1.4)
  })

  it('الألوان الثلاثة كلها تصمد في شبكة 16×16 — الأيقونة تُقرأ في الشريط', () => {
    const seen = new Set<string>()
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const c = at((x + 0.5) / 16, (y + 0.5) / 16)
        if (c) seen.add(c)
      }
    }
    expect(seen.has(INK)).toBe(true)
    expect(seen.has(PAPER)).toBe(true)
    expect(seen.has(CLAY)).toBe(true)
  })

  it('لا شيء يخرج من المربع المدوَّر', () => {
    const edges = [
      [GLYPH.alif.x, GLYPH.alif.y0],
      [GLYPH.alif.x, GLYPH.alif.y1],
      [GLYPH.kashida.x0, GLYPH.kashida.y],
      [GLYPH.kashida.x1, GLYPH.kashida.y],
    ]
    for (const [x, y] of edges) expect(at(x!, y!)).not.toBeNull()
  })
})
