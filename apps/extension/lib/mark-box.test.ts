import { describe, it, expect } from 'vitest'
import { markBoxStyle } from './mark-box'

describe('markBoxStyle — نِسَب إطار الهدف فوق لقطة المعاينة', () => {
  it('يحوّل بكسل الصورة إلى نِسَب مئوية تنطبق على العنصر المعروض بعرض ١٠٠٪', () => {
    const s = markBoxStyle({ x: 200, y: 150, w: 100, h: 50 }, 1000, 500)
    expect(s).toEqual({ left: '20%', top: '30%', width: '10%', height: '10%' })
  })

  it('هدف عند الأصل بحجم كامل الصورة يعطي إطارًا يملأ اللقطة', () => {
    const s = markBoxStyle({ x: 0, y: 0, w: 800, h: 600 }, 800, 600)
    expect(s).toEqual({ left: '0%', top: '0%', width: '100%', height: '100%' })
  })

  it('أبعاد طبيعية غير صالحة أو مستطيل صفري لا تُنتج إطارًا (لا قسمة على صفر)', () => {
    expect(markBoxStyle({ x: 10, y: 10, w: 10, h: 10 }, 0, 500)).toBeNull()
    expect(markBoxStyle({ x: 10, y: 10, w: 0, h: 10 }, 1000, 500)).toBeNull()
  })
})
