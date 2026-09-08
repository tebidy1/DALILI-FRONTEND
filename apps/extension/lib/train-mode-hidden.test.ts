// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTrainMode } from './train-mode'
import type { AnchorCandidate } from '@dalili/core'
import type { TrainStep } from './protocol'

/**
 * علة «التدريب يعطي أخطاء» (بلاغ المالك 2026-09-06) — الشقّ المقابل لعلة الالتقاط.
 * حين تُبنى مرساة الخطوة على حقلٍ **مخفيّ** (مستطيله {-2,-2,2,2}):
 *  ① `visibleTarget` كان يقبل أي مستطيل أكبر من صفر، فيمرّ الحقل الضامر — فتُرسم
 *    الحلقة في زاوية الشاشة ويقفز `scrollIntoView` لموضعٍ عشوائي («الأزرار في غير مكانها»).
 *  ② المطابقة كانت **بالاحتواء فقط**، والمفتاح المرئي في نمط claude.ai **شقيق** لا
 *    سلف ولا ابن — فنقرة المتدرّب الصحيحة تُقابَل بـ«ليس هذا الزر» إلى الأبد، ولا
 *    تكتمل الخطوة إلا بـ«تخطّي».
 * الأدلة المُلتقَطة قبل إصلاح `gesture.ts` تحمل هذه المراسي فعلًا، فالتشديد هنا
 * دفاعٌ بالعمق يخدمها أيضًا لا الأدلة الجديدة وحدها.
 */

function rect(el: Element, x: number, y: number, w: number, h: number) {
  el.getBoundingClientRect = () =>
    ({ x, y, width: w, height: h, top: y, left: x, right: x + w, bottom: y + h, toJSON: () => ({}) }) as DOMRect
  return el
}

function trainStep(partial: Partial<TrainStep> = {}): TrainStep {
  const anchor: AnchorCandidate[] = [{ k: 'id', v: 'hidden-field' }]
  return { id: 's1', kind: 'toggle', title: 'فعّل «Chat»', anchor, url: 'https://x.test/a', ...partial }
}

afterEach(() => {
  vi.useRealTimers()
  document.querySelectorAll('dalili-train').forEach((h) => h.remove())
})

describe('train-mode — الحقل المخفيّ لا يكون هدفًا', () => {
  it('مرساة على حقلٍ ضامر ومعه مفتاحه المرئي → الحلقة على المفتاح لا على {-2,-2,2,2}', () => {
    document.body.innerHTML = '<div><input type="checkbox" id="hidden-field"><span role="radio" id="vis">Chat</span></div>'
    rect(document.querySelector('#hidden-field')!, -2, -2, 2, 2)
    rect(document.querySelector('#vis')!, 717, 713, 82, 43)
    const mode = createTrainMode(vi.fn(), undefined, () => 'https://x.test/a')
    mode.handle({ t: 'train-step', step: trainStep(), idx: 0, total: 2, guideTitle: 'د' })
    const ring = document.querySelector('dalili-train')!.shadowRoot!.querySelector('svg.ring') as SVGElement
    // العلة القديمة: الحلقة تُرسم حول ٢×٢ عند (-2,-2) — أي على العدم، في زاوية الشاشة
    expect(ring.style.display).not.toBe('none')
    expect(ring.style.left).toBe(`${717 - 16}px`) // مستطيل المفتاح المرئي + هامش الحلقة
    mode.dispose()
  })

  it('حقلٌ ضامر بلا أي مفتاح مرئي → لا حلقة على العدم؛ رسالة فقدٍ صادقة', () => {
    vi.useFakeTimers()
    document.body.innerHTML = '<div><input type="checkbox" id="hidden-field"></div>'
    rect(document.querySelector('#hidden-field')!, -2, -2, 2, 2)
    const mode = createTrainMode(vi.fn(), undefined, () => 'https://x.test/a')
    mode.handle({ t: 'train-step', step: trainStep(), idx: 0, total: 2, guideTitle: 'د' })
    vi.advanceTimersByTime(9000) // بعد نفاد البحث الصبور
    const ring = document.querySelector('dalili-train')!.shadowRoot!.querySelector('svg.ring') as SVGElement
    expect(ring.style.display).toBe('none')
    mode.dispose()
  })

  it('نقر المتدرّب على المفتاح المرئي الشقيق يُكمل خطوة الحقل المخفيّ (لا «ليس هذا الزر»)', () => {
    document.body.innerHTML = '<div><input type="checkbox" id="hidden-field"><span role="radio" id="vis">Chat</span></div>'
    rect(document.querySelector('#hidden-field')!, -2, -2, 2, 2)
    const vis = rect(document.querySelector('#vis')!, 717, 713, 82, 43)
    const send = vi.fn()
    const mode = createTrainMode(send, undefined, () => 'https://x.test/a')
    mode.handle({ t: 'train-step', step: trainStep({ kind: 'click' }), idx: 0, total: 2, guideTitle: 'د' })
    vis.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))
    expect(send).toHaveBeenCalledWith('done')
    mode.dispose()
  })

  it('نقرة على زرٍ آخر تبقى خاطئة — التشديد لا يُرخّص كل نقرة', () => {
    document.body.innerHTML =
      '<div><input type="checkbox" id="hidden-field"><span role="radio" id="vis">Chat</span></div><button id="other">إلغاء</button>'
    rect(document.querySelector('#hidden-field')!, -2, -2, 2, 2)
    rect(document.querySelector('#vis')!, 717, 713, 82, 43)
    const other = rect(document.querySelector('#other')!, 10, 10, 80, 30)
    const send = vi.fn()
    const mode = createTrainMode(send, undefined, () => 'https://x.test/a')
    mode.handle({ t: 'train-step', step: trainStep({ kind: 'click' }), idx: 0, total: 2, guideTitle: 'د' })
    other.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))
    expect(send).not.toHaveBeenCalled()
    mode.dispose()
  })

  it('هدف مرئي أسفل الطيّة يبقى هدفًا — البُعد عن العين ليس خفاءً', () => {
    document.body.innerHTML = '<button id="hidden-field">حفظ</button>'
    rect(document.querySelector('#hidden-field')!, 40, 4000, 120, 40)
    const mode = createTrainMode(vi.fn(), undefined, () => 'https://x.test/a')
    mode.handle({ t: 'train-step', step: trainStep({ kind: 'click' }), idx: 0, total: 2, guideTitle: 'د' })
    const ring = document.querySelector('dalili-train')!.shadowRoot!.querySelector('svg.ring') as SVGElement
    expect(ring.style.display).not.toBe('none')
    mode.dispose()
  })
})
