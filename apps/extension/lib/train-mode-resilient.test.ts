// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTrainMode } from './train-mode'
import type { TrainStep } from './protocol'

/**
 * بلاغ أودو 2026-10-31 (الدليل lfTTuAZZZa9v): «دربني» ينكسر عند خطوة «أدخل…» وما بعدها.
 * الحقل يولد بعد «Add Line» في صفٍّ رقمه يتغيّر، وخيار الإكمال التلقائي لا يظهر إلا بعد
 * الكتابة. هذه الاختبارات تحرس الطبقة الحيّة: التركيز، الإنقاذ المتأخر، وحالة «نفّذها بنفسك».
 */

const URL = 'https://o.test/odoo/sales/30'
const ROW2_PATH = 'tbody:nth-of-type(1) > tr:nth-of-type(2) > td:nth-of-type(2) > textarea:nth-of-type(1)'

function step(partial: Partial<TrainStep>): TrainStep {
  return { id: 's', kind: 'input', title: 'أدخل «A»', anchor: [{ k: 'path', v: ROW2_PATH }], url: URL, ...partial }
}

function withRect(el: Element, x = 10, y = 10, w = 120, h = 40) {
  el.getBoundingClientRect = () => ({ x, y, width: w, height: h, top: y, left: x, right: x + w, bottom: y + h, toJSON: () => ({}) }) as DOMRect
  return el
}

const shadow = () => document.querySelector('dalili-train')!.shadowRoot!
/** ث١: لا بطاقة بعد (أول ٣٠٠ms بلا هدف) = لا دائرة */
const ringShown = () => {
  const ring = document.querySelector('dalili-train')?.shadowRoot?.querySelector('svg.ring') as HTMLElement | null | undefined
  return !!ring && ring.style.display !== 'none'
}

function typeInto(el: Element) {
  el.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
}

function clickShadowButton(label: string) {
  const btn = Array.from(shadow().querySelectorAll('button')).find((b) => b.textContent?.includes(label))
  expect(btn, `زر «${label}»`).toBeTruthy()
  btn!.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))
}

/** أمر بيع فيه ثلاثة أسطر والسطر الجديد المحرَّر رابع — المسار الموضعي (الصف ٢) لا يجده */
function odooOrderWithNewRowAt4() {
  document.body.innerHTML = `<table><tbody>
    <tr><td>a</td><td>منتج ١</td></tr><tr><td>a</td><td>منتج ٢</td></tr><tr><td>a</td><td>منتج ٣</td></tr>
    <tr><td>a</td><td><textarea id="new-line"></textarea></td></tr></tbody></table>`
  return withRect(document.querySelector('#new-line')!) as HTMLTextAreaElement
}

afterEach(() => {
  vi.useRealTimers()
  document.querySelectorAll('dalili-train').forEach((h) => h.remove())
})

describe('train-mode — متانة خطوات الكتابة والقوائم المتولّدة (بلاغ أودو)', () => {
  it('خطوة «أدخل» لا تُحل مرساتها لكن الحقل الجديد مركَّز (أودو يركّزه بعد Add Line) — الدائرة عليه والكتابة تكملها', () => {
    const ta = odooOrderWithNewRowAt4()
    ta.focus()
    const send = vi.fn()
    const mode = createTrainMode(send, undefined, () => URL)
    mode.handle({ t: 'train-step', step: step({}), idx: 3, total: 9, guideTitle: 'أمر بيع' })
    expect(ringShown()).toBe(true)
    typeInto(ta)
    expect(send).toHaveBeenCalledWith('done')
    mode.dispose()
  })

  it('الحقل المركَّز يناقض اسم الحقل في المرساة — لا يُتّخذ هدفًا', () => {
    document.body.innerHTML = '<input name="email">'
    const other = withRect(document.querySelector('input')!) as HTMLInputElement
    other.focus()
    const mode = createTrainMode(vi.fn(), undefined, () => URL)
    mode.handle({ t: 'train-step', step: step({ anchor: [{ k: 'name', v: 'qty' }, { k: 'path', v: ROW2_PATH }] }), idx: 3, total: 9, guideTitle: 'د' })
    expect(ringShown()).toBe(false)
    mode.dispose()
  })

  it('لا تركيز ولا مرساة: الكتابة في حقلٍ ظاهر تكمل الخطوة حتى أثناء البحث — لا تعليق', () => {
    vi.useFakeTimers()
    const ta = odooOrderWithNewRowAt4()
    const send = vi.fn()
    const mode = createTrainMode(send, undefined, () => URL)
    mode.handle({ t: 'train-step', step: step({}), idx: 3, total: 9, guideTitle: 'د' })
    expect(ringShown()).toBe(false)
    typeInto(ta)
    expect(send).toHaveBeenCalledWith('done')
    mode.dispose()
  })

  it('بعد المهلة: خطوة الكتابة بلا هدف تُصاغ «اكتب بنفسك» وزر «نفّذتُها» يتقدّم', () => {
    vi.useFakeTimers()
    document.body.innerHTML = '<div>لا حقل</div>'
    const send = vi.fn()
    const mode = createTrainMode(send, undefined, () => URL)
    mode.handle({ t: 'train-step', step: step({}), idx: 3, total: 9, guideTitle: 'د' })
    vi.advanceTimersByTime(9000)
    const text = shadow().textContent ?? ''
    expect(text).toContain('اكتب القيمة')
    expect(text).toContain('بنفسك')
    clickShadowButton('نفّذتُها')
    expect(send).toHaveBeenCalledWith('done')
    mode.dispose()
  })

  it('خيار قائمة لا يظهر إلا لاحقًا (بعد الكتابة/فتح القائمة): بعد المهلة يُنقَذ فور ظهوره بدائرته', async () => {
    vi.useFakeTimers()
    document.body.innerHTML = '<ul id="menu"></ul>'
    const send = vi.fn()
    const mode = createTrainMode(send, undefined, () => URL)
    const opt = step({ kind: 'click', title: 'انقر على «Mechanical Keyboard»', anchor: [{ k: 'text', v: 'Mechanical Keyboard' }] })
    mode.handle({ t: 'train-step', step: opt, idx: 4, total: 9, guideTitle: 'د' })
    vi.advanceTimersByTime(9000)
    expect(shadow().textContent).toContain('قائمة')
    // المتدرّب فتح القائمة بنفسه بعد ٢٠ ثانية — الخيار يُركَّب الآن
    vi.advanceTimersByTime(20000)
    const li = withRect(document.createElement('li'))
    li.setAttribute('role', 'option')
    li.textContent = 'Mechanical Keyboard'
    document.querySelector('#menu')!.appendChild(li)
    await Promise.resolve() // استدعاء MutationObserver مهمّة دقيقة — كما في اختبار LX-01
    vi.advanceTimersByTime(300)
    expect(ringShown()).toBe(true)
    li.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))
    expect(send).toHaveBeenCalledWith('done')
    mode.dispose()
  })

  it('خيار بلا دور تفاعلي لا تحلّه المرساة: نقر عنصرٍ نصُّه نصُّ الخطوة يكملها', () => {
    vi.useFakeTimers()
    document.body.innerHTML = '<ul><li class="o-item">Mechanical Keyboard</li></ul>'
    const send = vi.fn()
    const mode = createTrainMode(send, undefined, () => URL)
    const opt = step({ kind: 'click', title: 'انقر', anchor: [{ k: 'text', v: 'Mechanical Keyboard' }] })
    mode.handle({ t: 'train-step', step: opt, idx: 4, total: 9, guideTitle: 'د' })
    vi.advanceTimersByTime(9000)
    document.querySelector('li')!.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))
    expect(send).toHaveBeenCalledWith('done')
    mode.dispose()
  })

  it('كتابتان متتاليتان: مواصلة الكتابة في حقل الخطوة السابقة لا تُكمل التالية ولا تُتّخذ هدفًا لها', () => {
    vi.useFakeTimers()
    document.body.innerHTML = '<input name="name"><input id="phone">'
    const nameIn = withRect(document.querySelector('[name="name"]')!) as HTMLInputElement
    const send = vi.fn()
    const mode = createTrainMode(send, undefined, () => URL)
    mode.handle({ t: 'train-step', step: step({ id: 'a', title: 'أدخل الاسم', anchor: [{ k: 'name', v: 'name' }] }), idx: 0, total: 2, guideTitle: 'د' })
    nameIn.focus()
    typeInto(nameIn)
    expect(send).toHaveBeenCalledTimes(1)
    // الخطوة التالية مرساتها لا تُحل، والمتدرّب ما زال يكتب الاسم في الحقل المركَّز
    mode.handle({ t: 'train-step', step: step({ id: 'b', title: 'أدخل الهاتف', anchor: [{ k: 'path', v: 'x > y' }] }), idx: 1, total: 2, guideTitle: 'د' })
    expect(ringShown()).toBe(false)
    typeInto(nameIn)
    expect(send).toHaveBeenCalledTimes(1)
    // الكتابة في حقلٍ آخر هي الخطوة الجديدة فعلًا
    typeInto(withRect(document.querySelector('#phone')!))
    expect(send).toHaveBeenCalledTimes(2)
    mode.dispose()
  })

  it('النقر داخل حقل خطوة «أدخل» دخولٌ إليه لا إكمال — الكتابة وحدها تكملها (إثبات حيّ: «أدخل ٢» اكتملت بالنقر)', () => {
    document.body.innerHTML = '<div name="product_uom_qty"><input></div><button id="other">آخر</button>'
    const qty = withRect(document.querySelector('input')!)
    withRect(document.querySelector('#other')!, 300, 10)
    const send = vi.fn()
    const mode = createTrainMode(send, undefined, () => URL)
    mode.handle({ t: 'train-step', step: step({ title: 'أدخل «2»', anchor: [{ k: 'path', v: '[name="product_uom_qty"] input' }] }), idx: 6, total: 9, guideTitle: 'د' })
    qty.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))
    expect(send).not.toHaveBeenCalled()
    expect(shadow().querySelector('.wrong.on')).toBeNull() // لا تلميح «ليس هذا الزر»
    typeInto(qty)
    expect(send).toHaveBeenCalledWith('done')
    mode.dispose()
  })

  it('مطابقتان إحداهما مخفية (قالب) — المرئية وحدها هدف', () => {
    document.body.innerHTML = '<div name="product"><textarea id="tpl"></textarea></div><div name="product"><textarea id="live"></textarea></div>'
    withRect(document.querySelector('#live')!)
    const send = vi.fn()
    const mode = createTrainMode(send, undefined, () => URL)
    mode.handle({ t: 'train-step', step: step({ anchor: [{ k: 'path', v: '[name="product"] textarea' }] }), idx: 3, total: 9, guideTitle: 'د' })
    expect(ringShown()).toBe(true)
    typeInto(document.querySelector('#live')!)
    expect(send).toHaveBeenCalledWith('done')
    mode.dispose()
  })
})
