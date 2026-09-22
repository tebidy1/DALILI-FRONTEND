import { describe, expect, it } from 'vitest'
import {
  POPOUT_SIZES,
  SQUARE_SIZE,
  popoutAbove,
  GAP_ABOVE,
  type MonitorRect,
} from './expand'

/** عقد الفصل النظيف (طلب المالك 2026-09-19): الحصاة دائمة ٤٤ لا تتحوّل،
 *  وكلّ بطاقة نافذةٌ منفصلة تُثبَّت فوقها بتحاذاة يمنى وفجوة ١٢ —
 *  والقصّ على حدود الشاشة لا الخروج عنها. */

const anchor = { left: 1728, top: 950, right: 1794, bottom: 1016 }

const monitor = (w = 1920, h = 1080, x = 0, y = 0): MonitorRect => ({
  x,
  y,
  w,
  h,
})

describe('مقاسات البطاقات المنبثقة الستّ', () => {
  it('منسوخة من المرجع مع تسامحات الخطّ العربيّ المقيّسة', () => {
    expect(SQUARE_SIZE).toEqual({ w: 44, h: 44 })
    expect(POPOUT_SIZES.menu).toEqual({ w: 246, h: 152 })
    expect(POPOUT_SIZES.strip).toEqual({ w: 48, h: 183 })
    expect(POPOUT_SIZES.chip).toEqual({ w: 224, h: 30 })
    expect(POPOUT_SIZES.confirm).toEqual({ w: 252, h: 150 })
    expect(POPOUT_SIZES.build).toEqual({ w: 210, h: 60 })
    expect(POPOUT_SIZES.toast).toEqual({ w: 224, h: 56 })
    expect(GAP_ABOVE).toBe(12)
  })
})

describe('popoutAbove: التثبيت فوق الحصاة', () => {
  it('(أ) القائمة: تحاذاة يمنى وفجوة ١٢ فوق الرأس — فيزيائيًّا حرفًا', () => {
    const p = popoutAbove(anchor, POPOUT_SIZES.menu, 1.5, monitor())
    // يمين الحصاة ١٧٩٤ ⇐ x = ١٧٩٤−٣٦٩=١٤٢٥
    expect(p.x).toBe(1425)
    expect(p.w).toBe(369)
    expect(p.h).toBe(228)
    // رأس الحصاة ٩٥٠ ⇐ y = ٩٥٠−١٨−٢٢٨=٧٠٤
    expect(p.y).toBe(704)
  })

  it('(ب) الشريط: عمودٌ ضيّق يحاذي الحافة اليمنى للحصاة', () => {
    const p = popoutAbove(anchor, POPOUT_SIZES.strip, 1.5, monitor())
    expect(p.w).toBe(72)
    expect(p.h).toBe(275)
    expect(p.x).toBe(1794 - 72)
    // ٩٥٠−١٨−٢٧٥=٦٥٧
    expect(p.y).toBe(657)
  })

  it('(ج) قرب الحافة اليسرى: قصّ داخل الشاشة بلا خروج', () => {
    const p = popoutAbove({ left: 90, top: 500, right: 156, bottom: 566 }, POPOUT_SIZES.menu, 1.5, monitor())
    // x = ١٥٦−٣٦٩ سالب ⇐ يُقصّ إلى ٨
    expect(p.x).toBe(8)
  })

  it('(د) قرب أعلى الشاشة: تثبيت على هامش المهام لا خروجًا', () => {
    const p = popoutAbove({ left: 1728, top: 60, right: 1794, bottom: 126 }, POPOUT_SIZES.menu, 1.5, monitor())
    // y = ٦٠−١٨−٢٢٨ سالب ⇐ يُقصّ إلى ٥٦
    expect(p.y).toBe(56)
  })

  it('(هـ) بلا حدود شاشة: رياضيّات نقيّة', () => {
    const p = popoutAbove(anchor, POPOUT_SIZES.toast, 1.5, null)
    expect(p.w).toBe(336)
    expect(p.h).toBe(84)
    expect(p.x).toBe(1794 - 336)
    expect(p.y).toBe(950 - 18 - 84)
  })

  it('(و) شاشة عريضة بإزاحة: الحدود تُراعى من موضعها', () => {
    const m = monitor(1664, 1080)
    const p = popoutAbove(anchor, POPOUT_SIZES.strip, 1.5, m)
    // الشريط ٧٢ لا يتجاوز العرض أصلاً لكن يمين الحصاة خارج شاشة ١٦٦٤ ⇐ يُقصّ
    expect(p.x).toBe(1664 - 72 - 8)
  })
})
