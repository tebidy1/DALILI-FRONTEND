// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTrainCard } from './train-card'
import type { TrainStep } from './protocol'

/** المضيف يُلحق بـdocumentElement لا body — تنظيف صريح بين الاختبارات وإلا تسربت بطاقات قديمة */
afterEach(() => {
  document.querySelectorAll('dalili-train').forEach((h) => h.remove())
  vi.useRealTimers()
})

/** أول عائلة الخط في البطاقة — للتحقق من حضور خط الرقعة */
const HAND_CSS_HEAD = `'Aref Ruqaa','Segoe Print','Comic Sans MS',cursive`

/** jsdom يعيد مستطيلًا صفريًا دائمًا — نحاكي هندسة حقيقية للعنصر */
function withRect(el: Element, x = 10, y = 10, w = 140, h = 44) {
  el.getBoundingClientRect = () => ({ x, y, width: w, height: h, top: y, left: x, right: x + w, bottom: y + h, toJSON: () => ({}) } as DOMRect)
  return el
}

const step: TrainStep = { id: 's1', kind: 'click', title: 'انقر زر الحفظ', note: 'ملاحظة الخطوة', anchor: [], url: 'https://x.test/a' }

function place(el: string): Element {
  document.body.innerHTML = el
  return document.body.firstElementChild!
}

describe('train-card — بطاقة خط اليد بلا خلفية + دائرة مرسومة (طلب المالك)', () => {
  it('البطاقة نص بلا خلفية — لا لون ولا صندوق، وقراءة بخط يد', () => {
    const target = place('<button id="b">حفظ</button>')
    const card = createTrainCard()
    card.showStep({ step, idx: 0, total: 3, guideTitle: 'دليل الفاتورة', target })
    const host = document.querySelector('dalili-train')!
    const cardEl = host.shadowRoot!.querySelector<HTMLElement>('.card')!
    const cs = getComputedStyle(cardEl)
    // «عبارة عن نص وبدون خلفية» — شفاف تمامًا، بلا حد ولا ظل صندوق
    expect(cs.backgroundColor).toBe('rgba(0, 0, 0, 0)')
    expect(cs.borderStyle).toBe('none')
    expect(cs.borderColor).not.toBe('rgb(234, 88, 12)')
    // خط يبدو خط يد — عائلة بخط الرقعة أولًا (jsdom لا يحسب ظلال الأنماط فنقرأ المصدر)
    const css = host.shadowRoot!.querySelector('style')!.textContent ?? ''
    expect(css).toContain(`font-family: ${HAND_CSS_HEAD}`)
    expect(css).toContain('cursive')
    card.unmount()
  })

  it('حول الهدف دائرة بيضاوية غير منتظمة مرسومة بيد — svg بمسار مرتجف وحافتان ظاهرتان', () => {
    const target = withRect(place('<button id="b" style="width:120px;height:40px">حفظ</button>'))
    const card = createTrainCard()
    card.showStep({ step, idx: 0, total: 1, guideTitle: 'د', target })
    const host = document.querySelector('dalili-train')!
    const svg = host.shadowRoot!.querySelector('svg.ring')
    expect(svg).toBeTruthy()
    const paths = svg!.querySelectorAll('path')
    expect(paths.length).toBeGreaterThanOrEqual(2) // تمريرتان — يد بشرية لا تُغلق الدائرة من أول لمسة
    const d = paths[0]!.getAttribute('d') ?? ''
    expect(d.startsWith('M')).toBe(true)
    expect(d.length).toBeGreaterThan(80) // منحنى حقيقي متعدد النقاط لا مستطيل
    expect(d).not.toContain('L') // انسياب منحنيات لا أضلاع حادة
    card.unmount()
  })

  it('عنصر مخفي (rect صفر) لا يرسم دائرة وهمية — الدائرة تغيب بصمت', () => {
    const target = place('<button id="b" style="display:none">حفظ</button>')
    const card = createTrainCard()
    card.showStep({ step, idx: 0, total: 1, guideTitle: 'د', target })
    const host = document.querySelector('dalili-train')!
    expect((host.shadowRoot!.querySelector('svg.ring') as HTMLElement).style.display).toBe('none')
    card.unmount()
  })

  it('حالة البحث: بطاقة تظهر فورًا بنص «أبحث عن الزر…» قبل الحل — لا انتظار أعمى', () => {
    const card = createTrainCard()
    card.showStep({ step, idx: 0, total: 1, guideTitle: 'د', target: null })
    const host = document.querySelector('dalili-train')!
    expect(host.shadowRoot!.textContent).toContain('أبحث عن الزر')
    expect((host.shadowRoot!.querySelector('svg.ring') as HTMLElement).style.display).toBe('none')
    card.unmount()
  })

  it('بعد انقضاء مهلة البحث: رسالة عدم وجود صادقة بدل البحث الأبدي', () => {
    const card = createTrainCard()
    card.showStep({ step, idx: 0, total: 1, guideTitle: 'د', target: null })
    card.markMissing()
    const host = document.querySelector('dalili-train')!
    expect(host.shadowRoot!.textContent).toContain('لم أجد هذا الزر')
    card.unmount()
  })

  it('بطاقة الإنجاز بلا خلفية أيضًا وتُفكك ذاتيًا', () => {
    vi.useFakeTimers()
    const card = createTrainCard()
    card.finish(3)
    const host = document.querySelector('dalili-train')!
    const cs = getComputedStyle(host.shadowRoot!.querySelector<HTMLElement>('.card')!)
    expect(cs.backgroundColor).toBe('rgba(0, 0, 0, 0)')
    expect(host.shadowRoot!.textContent).toContain('أكملت التدريب')
    vi.advanceTimersByTime(5000)
    expect(document.querySelector('dalili-train')).toBeFalsy()
    vi.useRealTimers()
  })

  it('أزرار تخطي/إيقاف تبقى قابلة للنقر فوق أي صفحة', () => {
    const target = place('<button id="b">حفظ</button>')
    const card = createTrainCard()
    const skip = vi.fn()
    const stop = vi.fn()
    card.onSkip(skip)
    card.onStop(stop)
    card.showStep({ step, idx: 0, total: 2, guideTitle: 'د', target })
    const host = document.querySelector('dalili-train')!
    const btns = host.shadowRoot!.querySelectorAll('button')
    btns[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))
    btns[1]!.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))
    expect(skip).toHaveBeenCalledTimes(1)
    expect(stop).toHaveBeenCalledTimes(1)
    card.unmount()
  })

  it('تمرير فوري لمرة واحدة عند العرض ثم تُحسب البطاقة من مستطيلٍ مستقرّ — علة الخطوات البعيدة', () => {
    // علة «الخطوات ٥/٦/٩ في غير مكانها»: مع التمرير الناعم كان الموضع يُحسب أثناء حركة
    // التمرير فتستقرّ الخطوة على مستطيلٍ لم يصل وجهته. الحل: تمرير فوري ثم placeNear من مستطيل نهائي.
    const target = withRect(place('<button id="b">حفظ</button>'), 10, 900, 120, 44) // بعيد أسفل الصفحة
    let scrolls = 0
    ;(target as HTMLElement).scrollIntoView = ((opts?: ScrollIntoViewOptions) => {
      scrolls++
      expect(opts?.behavior).toBe('auto') // تمرير فوري لا ناعم — لا سباق حركة
      withRect(target, 10, 380, 120, 44) // الفوري يُثبّت الهدف قرب الوسط تزامنيًا
    }) as Element['scrollIntoView']
    const card = createTrainCard()
    card.showStep({ step, idx: 0, total: 2, guideTitle: 'د', target })
    const cardEl = document.querySelector('dalili-train')!.shadowRoot!.querySelector<HTMLElement>('.card')!
    expect(scrolls).toBe(1) // تمرير واحد عند العرض
    // البطاقة فوق الهدف المستقرّ (y=380) لا فوق موضعه البائت البعيد (y=900)
    const top1 = parseFloat(cardEl.style.top)
    expect(top1).toBeLessThan(380)
    expect(top1).toBeGreaterThan(150)

    // تمرير المستخدم لاحقًا يُعيد التموضع من مستطيل طازج بلا إعادة إطلاق تمرير
    withRect(target, 10, 120, 120, 44)
    window.dispatchEvent(new Event('scroll'))
    expect(scrolls).toBe(1) // لم يُعد إطلاق scrollIntoView على حدث تمرير المستخدم
    expect(parseFloat(cardEl.style.top)).not.toBe(top1) // تتبّعت الموضع الجديد
    card.unmount()
  })

  it('نصوص البطاقة خط أبيض على «ريشة» جرافيت (عكس الآية) — لا ألوان خارج النظام', () => {
    const target = place('<button id="b">حفظ</button>')
    const card = createTrainCard()
    card.showStep({ step, idx: 0, total: 3, guideTitle: 'دليل الفاتورة', target })
    const root = document.querySelector('dalili-train')!.shadowRoot!
    const styleTxt = root.querySelector('style')!.textContent ?? ''
    // كل جملة داخل span.brush يحمل خلفية الريشة
    expect(root.querySelectorAll('.brush').length).toBeGreaterThan(0)
    expect(root.querySelector('.title .brush')).toBeTruthy()
    // العكس: الخط أبيض والفرشاة جرافيت «درجة الأسود» (jsdom لا يورّث أنماط الظل فنقرأ المصدر)
    expect(styleTxt).toMatch(/\.card\s*\{[^}]*color:\s*#FFFFFF/) // خط البطاقة أبيض
    expect(styleTxt).toContain('%232B2A26') // fill الفرشاة = الجرافيت
    // النظام اللوني: لا برتقالي/أخضر تزييني
    expect(styleTxt).not.toContain('#FDBA74')
    expect(styleTxt).not.toContain('#6EE7A0')
    card.unmount()
  })
})
