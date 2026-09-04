import { describe, expect, it } from 'vitest'
import { BLUR_FAIL_NOTICE, pickBlurTarget, rectCovers } from './blurpick'
import { shouldOfferBlur } from './session'

/** عناصر وهمية بنيويًا — الدالة تستهلك isConnected/getBoundingClientRect فقط */
function el(rect: { x: number; y: number; w: number; h: number }, tag = 'DIV') {
  return {
    isConnected: true,
    tagName: tag,
    getBoundingClientRect: () => ({ ...rect, left: rect.x, top: rect.y, right: rect.x + rect.w, bottom: rect.y + rect.h, width: rect.w, height: rect.h, toJSON: () => ({}) }) as DOMRect,
  }
}

describe('CAP-13 pickBlurTarget', () => {
  const drag = { x: 100, y: 100, w: 80, h: 30 }

  it('يختار أصغر عنصر يغطي مركز السحب — لا الحاوية العريضة', () => {
    const card = el({ x: 0, y: 0, w: 1200, h: 800 })
    const chip = el({ x: 95, y: 95, w: 90, h: 40 })
    const picked = pickBlurTarget([card as unknown as Element, chip as unknown as Element], drag)
    expect(picked).toBe(chip)
  })

  it('يتخطى طبقة دليلي نفسها وhtml/body — سحب على فراغ لا يطمس الصفحة كلها', () => {
    const overlayHost = el({ x: 90, y: 90, w: 100, h: 50 }, 'DALILI-OVERLAY')
    const body = el({ x: 0, y: 0, w: 1400, h: 900 }, 'BODY')
    const picked = pickBlurTarget([body as unknown as Element, overlayHost as unknown as Element], drag)
    expect(picked).toBeUndefined()
  })

  it('يتخطى العنصر المنفصل (أزاله React) والعناصر خارج مركز السحب', () => {
    const gone = { ...el({ x: 95, y: 95, w: 90, h: 40 }), isConnected: false }
    const far = el({ x: 600, y: 600, w: 50, h: 50 })
    expect(pickBlurTarget([gone as unknown as Element, far as unknown as Element], drag)).toBeUndefined()
  })
})

describe('rectCovers', () => {
  it('تغطية صادقة لا خداع نسب', () => {
    expect(rectCovers({ x: 0, y: 0, w: 100, h: 40 }, { x: 10, y: 10, w: 80, h: 20 })).toBe(true)
    expect(rectCovers({ x: 0, y: 0, w: 100, h: 40 }, { x: 90, y: 10, w: 80, h: 20 })).toBe(false)
  })
})

describe('CAP-13 shouldOfferBlur', () => {
  it('يُعرض أثناء التسجيل الفعلي فقط — لا في الإيقاف المؤقت ولا خارجه', () => {
    expect(shouldOfferBlur('capturing')).toBe(true)
    expect(shouldOfferBlur('paused')).toBe(false)
    expect(shouldOfferBlur('idle')).toBe(false)
    expect(shouldOfferBlur('saving')).toBe(false)
  })
})

describe('CAP-13 رسالة الفشل', () => {
  it('E-CAP-13 مرمّزة في الرسالة العربية الصادقة', () => {
    expect(BLUR_FAIL_NOTICE).toContain('E-CAP-13')
    expect(BLUR_FAIL_NOTICE).toContain('المحرر')
  })
})
