// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { buildValueEvent, viewportRect } from './events'

/** علة: خطوات الكتابة كانت بلا مستطيل فلا إطار على لقطتها إطلاقًا —
 *  المستطيل الآن لكل حدث قيمة: حساس → للطمس، عادي → للتعليم. */

describe('buildValueEvent — مستطيل لكل حدث قيمة', () => {
  it('إدخال نص عادي → rect موجود (للتعليم) وvalue محفوظة', () => {
    document.body.innerHTML = '<label>اسم العميل</label><input name="customer">'
    const input = document.querySelector('input')!
    input.value = 'شركة النور'
    const ev = buildValueEvent(input, 'https://x/a', 'p', 1)!
    expect(ev?.rect).toBeDefined()
    expect(ev?.value).toBe('شركة النور')
    expect(ev?.sensitive).toBe(false)
  })

  it('حقل حساس → rect موجود أيضًا (للطمس) وvalue محجوبة', () => {
    document.body.innerHTML = '<input name="password" type="password">'
    const input = document.querySelector('input')!
    input.value = 's3cret'
    const ev = buildValueEvent(input, 'https://x/a', 'p', 1)!
    expect(ev?.sensitive).toBe(true)
    expect(ev?.value).toBeUndefined()
    expect(ev?.rect).toBeDefined()
  })

  it('select وcheckbox → rect موجود', () => {
    document.body.innerHTML = '<select><option selected>مفتوح</option></select><input type="checkbox" checked>'
    const ev1 = buildValueEvent(document.querySelector('select')!, 'https://x/a', 'p', 1)!
    const ev2 = buildValueEvent(document.querySelector('input')!, 'https://x/a', 'p', 1)!
    expect(ev1?.rect).toBeDefined()
    expect(ev2?.rect).toBeDefined()
  })

  it('viewportRect يقرأ مستطيل العنصر الفعلي من DOM', () => {
    document.body.innerHTML = '<button>حفظ</button>'
    const btn = document.querySelector('button')!
    btn.getBoundingClientRect = () => ({ x: 8, y: 90, width: 120, height: 40, top: 0, left: 0, right: 128, bottom: 130, toJSON: () => ({}) }) as DOMRect
    expect(viewportRect(btn)).toEqual({ x: 8, y: 90, w: 120, h: 40 })
  })
})
