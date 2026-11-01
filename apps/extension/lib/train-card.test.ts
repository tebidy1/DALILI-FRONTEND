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

  it('بعد انقضاء مهلة البحث: رسالة عدم وجود صادقة بدل البحث الأبدي', () => {
    const card = createTrainCard()
    card.markPreparing({ step, idx: 0, total: 1, guideTitle: 'د' })
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

describe('ث١: حالات البطاقة الصادقة', () => {
  const ctx = { step, idx: 0, total: 3, guideTitle: 'دليل الفاتورة' }
  const root = () => document.querySelector('dalili-train')!.shadowRoot!
  const text = () => root().querySelector('.card')!.textContent ?? ''
  const ring = () => root().querySelector<SVGSVGElement>('svg.ring')!
  const press = (label: string) => [...root().querySelectorAll('button')].find((b) => b.textContent === label)!.click()
  const shot = { url: 'https://files.test/shot.png', mark: { x: 40, y: 30, w: 100, h: 30 } }

  it('التجهيز: حركة انتظار بلا عبارة توجيه ولا إطار', () => {
    const card = createTrainCard()
    card.markPreparing(ctx)
    expect(text()).toContain('نجهّز الخطوة')
    expect(text()).not.toContain(step.title)
    expect(ring().style.display).toBe('none')
    expect(root().querySelectorAll('.prep i').length).toBe(3)
  })

  it('مغطّى بنافذة: الرسالة المناسبة بلا إطار', () => {
    const card = createTrainCard()
    card.markPreparing(ctx)
    card.markCovered(ctx, 'dialog')
    expect(text()).toContain('أغلق النافذة')
    expect(ring().style.display).toBe('none')
  })

  it('غير متأكد: إطار متقطّع وسؤال بالجهة وزرّان يبلّغان الجواب', () => {
    const target = withRect(place('<button>الزبون</button>'))
    const card = createTrainCard()
    const got: string[] = []
    card.onUnsure((a) => got.push(a))
    card.markPreparing(ctx)
    card.markUnsure(ctx, target, 'left')
    expect(text()).toContain('يسار الشاشة')
    expect(text()).toContain(step.title)
    expect(ring().classList.contains('unsure')).toBe(true)
    expect(ring().style.display).toBe('')
    press('ليس هذا')
    press('نعم، هذا هو')
    expect(got).toEqual(['no', 'yes'])
  })

  it('غير موجود: صورة الزر تظهر إن وُجدت', () => {
    const card = createTrainCard()
    card.markPreparing({ ...ctx, step: { ...step, shot } })
    card.markMissing()
    expect(root().querySelector('img')?.getAttribute('src')).toBe(shot.url)
  })

  it('تحميل الصورة يعيد وضع البطاقة — لا تكبر فوق الزر (مراجعة I6)', () => {
    const target = withRect(place('<button>الزبون</button>'), 300, 300, 80, 30)
    const card = createTrainCard()
    card.markUnsure({ ...ctx, step: { ...step, shot } }, target, 'left')
    withRect(target, 300, 500, 80, 30) // الصفحة تحرّكت قبل أن يصل الملف
    const img = root().querySelector('img')!
    Object.defineProperty(img, 'naturalWidth', { value: 800 })
    Object.defineProperty(img, 'naturalHeight', { value: 600 })
    img.dispatchEvent(new Event('load'))
    expect(ring().style.top).toBe(`${500 - 16}px`)
  })

  it('صورة تفشل في التحميل تُخفى بصمت', () => {
    const card = createTrainCard()
    card.markPreparing({ ...ctx, step: { ...step, shot } })
    card.markMissing()
    root().querySelector('img')!.dispatchEvent(new Event('error'))
    expect(root().querySelector<HTMLElement>('.shot')!.hidden).toBe(true)
  })

  it('المؤكَّد بعد غير المتأكد: الإطار متصل لا متقطّع', () => {
    const target = withRect(place('<button>الزبون</button>'))
    const card = createTrainCard()
    card.markPreparing(ctx)
    card.markUnsure(ctx, target, 'left')
    card.showStep({ ...ctx, target })
    expect(ring().classList.contains('unsure')).toBe(false)
  })

  it('البطاقة لا تُموضَع فوق مستطيل الهدف', () => {
    const target = withRect(place('<button>حفظ</button>'), 10, 10, 140, 44)
    const card = createTrainCard()
    card.showStep({ ...ctx, target })
    expect(parseFloat(root().querySelector<HTMLElement>('.card')!.style.top)).toBeGreaterThanOrEqual(54)
  })

  it('إعادة الوضع لا تعيد رسم الدائرة — لا رمش ولا رسم حي متكرر (مراجعة I2)', () => {
    const target = withRect(place('<button>حفظ</button>'), 300, 300, 80, 30)
    const card = createTrainCard()
    card.showStep({ ...ctx, target })
    const path = ring().querySelector('path')
    withRect(target, 300, 340, 80, 30)
    card.reposition()
    expect(ring().querySelector('path')).toBe(path)
    expect(ring().style.top).toBe(`${340 - 16}px`)
  })

  it('هدف ظاهر في منفذ العرض لا يُمرَّر إليه — لا قفز للصفحة (مراجعة I3)', () => {
    const target = withRect(place('<button>حفظ</button>'), 300, 300, 80, 30)
    const scroll = vi.fn()
    target.scrollIntoView = scroll
    createTrainCard().showStep({ ...ctx, target })
    expect(scroll).not.toHaveBeenCalled()
    withRect(target, 300, 5000, 80, 30)
    createTrainCard().showStep({ ...ctx, target })
    expect(scroll).toHaveBeenCalledOnce()
  })

  it('انتظار الدخول: «افتح الشاشة المطلوبة» يبلّغ', () => {
    const card = createTrainCard()
    const open = vi.fn()
    card.onOpenTarget(open)
    card.markPreparing(ctx)
    card.markWaiting()
    press('افتح الشاشة المطلوبة')
    expect(open).toHaveBeenCalledOnce()
  })
})
