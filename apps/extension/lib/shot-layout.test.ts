import { describe, expect, it } from 'vitest'
import { shotLayout, toLocal } from './shot-layout'

describe('toLocal', () => {
  it('بلا قصّ يعيد المستطيل نفسه', () => {
    expect(toLocal({ x: 5, y: 6, w: 7, h: 8 })).toEqual({ x: 5, y: 6, w: 7, h: 8 })
  })
  it('يطرح أصل القصّ ويحفظ الأبعاد', () => {
    expect(toLocal({ x: 150, y: 120, w: 40, h: 20 }, { x: 100, y: 100, w: 500, h: 300 })).toEqual({ x: 50, y: 20, w: 40, h: 20 })
  })
})

describe('shotLayout', () => {
  it('بلا قصّ: الإطار = الأبعاد الطبيعية والصورة ١٠٠٪ بلا إزاحة', () => {
    expect(shotLayout(1000, 600)).toEqual({ frameW: 1000, frameH: 600, img: { width: '100%', left: '0%', top: '0%' } })
  })
  it('قصّ النصف الأيمن السفلي: الصورة ٢٠٠٪ مُزاحة -١٠٠٪', () => {
    expect(shotLayout(1000, 600, { x: 500, y: 300, w: 500, h: 300 })).toEqual({
      frameW: 500,
      frameH: 300,
      img: { width: '200%', left: '-100%', top: '-100%' },
    })
  })
  it('قصّ فاسد (عرض صفر) يُتجاهل', () => {
    expect(shotLayout(1000, 600, { x: 0, y: 0, w: 0, h: 10 })?.frameW).toBe(1000)
  })
  it('أبعاد غير صالحة → null', () => {
    expect(shotLayout(0, 600)).toBeNull()
  })
})
