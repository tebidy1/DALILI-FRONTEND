// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { buildValueEvent, viewportRect, visualControl } from './events'

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

  it('checkbox مخفيّ داخل label مرئي → التبديل يُؤشَّر على الـlabel لا على الحقل الضامر', () => {
    // علة «الالتقاط في مكان خاطئ»: الحقل الأصلي مخفيّ بمستطيل ضامر {-2,-2,2,2}
    document.body.innerHTML = '<label class="switch"><input type="checkbox"><span>cowork</span></label>'
    const label = document.querySelector('label')!
    const input = document.querySelector('input')!
    input.getBoundingClientRect = () => ({ x: -2, y: -2, width: 2, height: 2, top: -2, left: -2, right: 0, bottom: 0, toJSON: () => ({}) }) as DOMRect
    label.getBoundingClientRect = () => ({ x: 40, y: 200, width: 90, height: 28, top: 200, left: 40, right: 130, bottom: 228, toJSON: () => ({}) }) as DOMRect
    // المفتاح المرئي = الـlabel الذي يحوي الحقل (فيبقى كشف التدريب صحيحًا)
    expect(visualControl(input)).toBe(label)
    const ev = buildValueEvent(input, 'https://x/a', 'p', 1)!
    expect(ev.kind).toBe('toggle')
    expect(ev.rect).toEqual({ x: 40, y: 200, w: 90, h: 28 }) // مستطيل المفتاح المرئي لا {-2,-2,2,2}
  })

  it('عنصر مرئي أصلًا يبقى كما هو — visualControl لا يغيّر السلوك القائم', () => {
    document.body.innerHTML = '<input type="checkbox">'
    const input = document.querySelector('input')!
    input.getBoundingClientRect = () => ({ x: 10, y: 10, width: 18, height: 18, top: 10, left: 10, right: 28, bottom: 28, toJSON: () => ({}) }) as DOMRect
    expect(visualControl(input)).toBe(input)
  })

  it('viewportRect يقرأ مستطيل العنصر الفعلي من DOM', () => {
    document.body.innerHTML = '<button>حفظ</button>'
    const btn = document.querySelector('button')!
    btn.getBoundingClientRect = () => ({ x: 8, y: 90, width: 120, height: 40, top: 0, left: 0, right: 128, bottom: 130, toJSON: () => ({}) }) as DOMRect
    expect(viewportRect(btn)).toEqual({ x: 8, y: 90, w: 120, h: 40 })
  })
})
