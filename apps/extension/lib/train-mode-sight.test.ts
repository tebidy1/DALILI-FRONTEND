// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTrainMode, type TrainOutcomeMsg } from './train-mode'
import type { AnchorCandidate } from '@dalili/core'
import type { TrainStep } from './protocol'

// ث١ دربني الواثق: الحالة تُقرَّر من الثقة والرؤية معًا — لا توجيه قبل أن نرى ما نوجّه إليه

const URL = 'https://x.test/a'
const sure: AnchorCandidate[] = [{ k: 'id', v: 'save' }, { k: 'text', v: 'حفظ' }]
const unsure: AnchorCandidate[] = [{ k: 'path', v: 'div > button' }]

function step(partial: Partial<TrainStep> = {}): TrainStep {
  return { id: 's1', kind: 'click', title: 'انقر «حفظ»', anchor: sure, url: URL, ...partial }
}

function withRect(el: Element, x = 100, y = 100, w = 80, h = 30) {
  el.getBoundingClientRect = () => ({ x, y, width: w, height: h, top: y, left: x, right: x + w, bottom: y + h, toJSON: () => ({}) }) as DOMRect
  return el
}

function button(id = 'save', text = 'حفظ') {
  const b = withRect(document.createElement('button'))
  b.id = id
  b.textContent = text
  return b
}

const host = () => document.querySelector('dalili-train')
const text = () => host()?.shadowRoot?.textContent ?? ''
const ring = () => host()?.shadowRoot?.querySelector('svg.ring') as SVGSVGElement | null | undefined
const ringShown = () => !!ring() && ring()!.style.display !== 'none'
const click = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))
function press(label: string) {
  const b = [...host()!.shadowRoot!.querySelectorAll('button')].find((x) => x.textContent === label)
  expect(b, `زر «${label}»`).toBeTruthy()
  click(b!)
}

let outcomes: TrainOutcomeMsg[]
let send: ReturnType<typeof vi.fn>
/** نقطة التغطية قابلة للتبديل: null = لا حكم (كما في jsdom)، أو عنصر يغطي الزر */
let cover: Element | null
let here: string
const mk = (extra: Parameters<typeof createTrainMode>[3] = {}, dom?: Parameters<typeof createTrainMode>[1]) =>
  createTrainMode(send, dom, () => here, { outcome: (o) => outcomes.push(o), pointAt: () => cover, viewport: () => ({ w: 1000, h: 800 }), ...extra })

beforeEach(() => {
  vi.useFakeTimers()
  outcomes = []
  send = vi.fn()
  cover = null
  here = URL
  document.body.innerHTML = ''
})
afterEach(() => {
  vi.useRealTimers()
  document.querySelectorAll('dalili-train').forEach((h) => h.remove())
})

describe('ث١ — حالات التدريب الصادقة', () => {
  it('زر يُركَّب بعد ثانيتين: «نجهّز الخطوة» بعد 300ms بلا توجيه، ثم الإطار لحظة التركيب', async () => {
    const mode = mk()
    mode.handle({ t: 'train-step', step: step(), idx: 0, total: 2, guideTitle: 'د' })
    vi.advanceTimersByTime(300)
    expect(text()).toContain('نجهّز الخطوة')
    expect(text()).not.toContain('انقر «حفظ»')
    expect(ringShown()).toBe(false)
    vi.advanceTimersByTime(1700)
    document.body.appendChild(button())
    await vi.advanceTimersByTimeAsync(120)
    expect(ringShown()).toBe(true)
    expect(text()).toContain('انقر «حفظ»')
    mode.dispose()
  })

  it('زر يظهر خلال 100ms لا يمرّ بالتجهيز أبدًا — لا رمش', async () => {
    const mode = mk()
    mode.handle({ t: 'train-step', step: step(), idx: 0, total: 2, guideTitle: 'د' })
    vi.advanceTimersByTime(100)
    expect(host()).toBeNull() // لا شيء معروض بعد
    document.body.appendChild(button())
    await vi.advanceTimersByTimeAsync(120)
    expect(ringShown()).toBe(true)
    await vi.advanceTimersByTimeAsync(1000)
    expect(text()).not.toContain('نجهّز الخطوة')
    mode.dispose()
  })

  it('نافذة تغطي الزر ثم تُغلق: «أغلق النافذة» بلا إطار، ثم الإطار تلقائيًا', async () => {
    document.body.innerHTML = '<div role="dialog" id="m"><p>نافذة</p></div>'
    document.body.appendChild(button())
    cover = document.querySelector('#m p')
    const mode = mk()
    mode.handle({ t: 'train-step', step: step(), idx: 0, total: 2, guideTitle: 'د' })
    expect(text()).toContain('أغلق النافذة')
    expect(ringShown()).toBe(false)
    cover = null
    document.querySelector('#m')!.remove()
    await vi.advanceTimersByTimeAsync(120)
    expect(ringShown()).toBe(true)
    expect(text()).toContain('انقر «حفظ»')
    mode.dispose()
  })

  it('النظام يعيد بناء الزر: الإطار ينتقل للعنصر الجديد، لا يبقى على الميت', async () => {
    document.body.appendChild(button())
    const mode = mk()
    mode.handle({ t: 'train-step', step: step(), idx: 0, total: 2, guideTitle: 'د' })
    expect(ring()!.style.left).toBe(`${100 - 16}px`)
    document.querySelector('#save')!.remove()
    document.body.appendChild(withRect(button(), 400, 200))
    await vi.advanceTimersByTimeAsync(120)
    expect(ringShown()).toBe(true)
    expect(ring()!.style.left).toBe(`${400 - 16}px`)
    mode.dispose()
  })

  it('ثقة متوسطة: «هل ترى التحديد…» بالجهة؛ «نعم» ثم نقر الهدف = confirmed', () => {
    document.body.innerHTML = '<div></div>'
    const b = button()
    document.querySelector('div')!.appendChild(b)
    withRect(b, 20, 380, 80, 30)
    const mode = mk()
    mode.handle({ t: 'train-step', step: step({ anchor: unsure }), idx: 0, total: 2, guideTitle: 'د' })
    expect(text()).toContain('هل ترى التحديد على «انقر «حفظ»» يسار الشاشة')
    expect(ring()!.classList.contains('unsure')).toBe(true)
    press('نعم، هذا هو')
    expect(ring()!.classList.contains('unsure')).toBe(false)
    click(b)
    expect(outcomes).toEqual([{ idx: 0, outcome: 'confirmed', confidence: 'medium' }])
    expect(send).toHaveBeenCalledWith('done')
    mode.dispose()
  })

  it('بعد «نعم» نقر زر آخر = تلميح لطيف لا إكمال', () => {
    document.body.innerHTML = '<div></div><button id="x">إلغاء</button>'
    const b = button()
    document.querySelector('div')!.appendChild(b)
    withRect(document.querySelector('#x')!, 600, 600)
    const mode = mk()
    mode.handle({ t: 'train-step', step: step({ anchor: unsure }), idx: 0, total: 2, guideTitle: 'د' })
    press('نعم، هذا هو')
    click(document.querySelector('#x')!)
    expect(send).not.toHaveBeenCalled()
    expect(host()!.shadowRoot!.querySelector('.wrong.on')).toBeTruthy()
    mode.dispose()
  })

  it('«ليس هذا» = غير موجود: صورة الزر و«نفّذتُها»، والنتيجة declared', () => {
    document.body.innerHTML = '<div></div>'
    document.querySelector('div')!.appendChild(button())
    const mode = mk()
    mode.handle({ t: 'train-step', step: step({ anchor: unsure, shot: { url: 'https://f/1.png', mark: { x: 1, y: 1, w: 9, h: 9 } } }), idx: 0, total: 2, guideTitle: 'د' })
    press('ليس هذا')
    expect(text()).toContain('لم أجد') // فورًا، لا ٨ ثوانٍ تجهيز (مراجعة I5)
    expect(host()!.shadowRoot!.querySelector('img')?.getAttribute('src')).toBe('https://f/1.png')
    press('نفّذتُها')
    expect(outcomes).toEqual([{ idx: 0, outcome: 'declared', confidence: null }])
    mode.dispose()
  })

  it('نقر الهدف المؤكَّد بثقة عالية = verified', () => {
    const b = button()
    document.body.appendChild(b)
    const mode = mk()
    mode.handle({ t: 'train-step', step: step(), idx: 0, total: 2, guideTitle: 'د' })
    click(b)
    expect(outcomes).toEqual([{ idx: 0, outcome: 'verified', confidence: 'high' }])
    mode.dispose()
  })

  it('«تم» ثم انتقلت الشاشة وظهر هدف الخطوة التالية خلال 5ث = ترقية السابقة إلى verified', async () => {
    const mode = mk()
    mode.handle({ t: 'train-step', step: step({ id: 'a' }), idx: 0, total: 2, guideTitle: 'د' })
    vi.advanceTimersByTime(9000)
    press('نفّذتُها')
    here = 'https://x.test/a/12' // أثر الخطوة: الشاشة تغيّرت (حُفظ السجل)
    mode.handle({ t: 'train-step', step: step({ id: 'b' }), idx: 1, total: 2, guideTitle: 'د' })
    vi.advanceTimersByTime(1000)
    document.body.appendChild(button())
    await vi.advanceTimersByTimeAsync(120)
    expect(outcomes).toEqual([
      { idx: 0, outcome: 'declared', confidence: null },
      { idx: 0, outcome: 'verified', confidence: null },
    ])
    mode.dispose()
  })

  it('«تم» والهدف التالي على الشاشة نفسها أصلًا = لا ترقية — الخطوة المعطوبة تبقى ظاهرة (مراجعة C2)', async () => {
    document.body.appendChild(button('next', 'التالي'))
    const mode = mk()
    mode.handle({ t: 'train-step', step: step({ id: 'a' }), idx: 0, total: 2, guideTitle: 'د' })
    vi.advanceTimersByTime(9000)
    press('نفّذتُها')
    mode.handle({ t: 'train-step', step: step({ id: 'b', anchor: [{ k: 'id', v: 'next' }, { k: 'text', v: 'التالي' }] }), idx: 1, total: 2, guideTitle: 'د' })
    await vi.advanceTimersByTimeAsync(120)
    expect(ringShown()).toBe(true)
    expect(outcomes).toEqual([{ idx: 0, outcome: 'declared', confidence: null }])
    mode.dispose()
  })

  it('«تم» بلا أثر (الهدف التالي بعد النافذة) = declared يبقى', async () => {
    const mode = mk()
    mode.handle({ t: 'train-step', step: step({ id: 'a' }), idx: 0, total: 2, guideTitle: 'د' })
    vi.advanceTimersByTime(9000)
    press('نفّذتُها')
    mode.handle({ t: 'train-step', step: step({ id: 'b' }), idx: 1, total: 2, guideTitle: 'د' })
    vi.advanceTimersByTime(6000)
    document.body.appendChild(button())
    await vi.advanceTimersByTimeAsync(120)
    expect(outcomes).toEqual([{ idx: 0, outcome: 'declared', confidence: null }])
    mode.dispose()
  })

  it('«افتح الشاشة المطلوبة» في انتظار الدخول ينقل التبويب إلى رابط الخطوة', () => {
    const assign = vi.fn()
    const mode = createTrainMode(send, undefined, () => 'https://x.test/web/login', { assign })
    mode.handle({ t: 'train-step', step: step(), idx: 0, total: 2, guideTitle: 'د' })
    press('افتح الشاشة المطلوبة')
    expect(assign).toHaveBeenCalledWith(URL)
    mode.dispose()
  })

  it('مغطّى: نقر زر إغلاق النافذة ليس «زرًا خاطئًا» (مراجعة I4)', () => {
    document.body.innerHTML = '<div role="dialog" id="m"><button id="close">×</button></div>'
    withRect(document.querySelector('#close')!, 500, 500)
    document.body.appendChild(button())
    cover = document.querySelector('#m')
    const mode = mk()
    mode.handle({ t: 'train-step', step: step(), idx: 0, total: 2, guideTitle: 'د' })
    click(document.querySelector('#close')!)
    expect(host()!.shadowRoot!.querySelector('.wrong.on')).toBeNull()
    mode.dispose()
  })

  it('نقر عنصرٍ غير الهدف نصُّه نصُّ الخطوة = confirmed لا verified (مراجعة I9)', () => {
    document.body.innerHTML = '<ul><li>حفظ</li></ul>'
    const mode = mk()
    mode.handle({ t: 'train-step', step: step({ anchor: [{ k: 'text', v: 'حفظ' }] }), idx: 0, total: 2, guideTitle: 'د' })
    click(document.querySelector('li')!)
    expect(outcomes).toEqual([{ idx: 0, outcome: 'confirmed', confidence: null }])
    mode.dispose()
  })

  it('حالة مستقرّة: طفرات الصفحة لا تعيد حلّ المرساة ما دام الهدف حيًّا، وتُجمَّع بفاصل (مراجعة I1)', async () => {
    document.body.appendChild(button())
    let finds = 0
    let points = 0
    const counted = { find: (c: AnchorCandidate) => { finds++; return c.k === 'id' ? [...document.querySelectorAll('#save')] : [...document.querySelectorAll('button')].filter((b) => b.textContent === 'حفظ') }, textOf: (el: Element) => el.textContent ?? '' }
    const mode = mk({ pointAt: () => { points++; return null } }, counted)
    mode.handle({ t: 'train-step', step: step(), idx: 0, total: 2, guideTitle: 'د' })
    const findsAfterStart = finds
    points = 0
    for (let i = 0; i < 10; i++) {
      document.body.setAttribute('data-tick', String(i))
      document.body.appendChild(document.createElement('span'))
      await vi.advanceTimersByTimeAsync(20)
    }
    expect(finds).toBe(findsAfterStart)
    expect(points).toBeLessThanOrEqual(5 * 3) // ٢٠٠ms من الطفرات = ثلاثة فحوص رؤية على الأكثر
    mode.dispose()
  })

  it('لا مؤقّت دوري: بعد الإيقاف لا مؤقتات معلّقة', () => {
    const mode = mk()
    mode.handle({ t: 'train-step', step: step(), idx: 0, total: 2, guideTitle: 'د' })
    vi.advanceTimersByTime(20000)
    mode.handle({ t: 'train-stop', reason: 'stopped' })
    expect(vi.getTimerCount()).toBe(0)
  })
})
