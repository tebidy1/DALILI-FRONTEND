// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTrainMode } from './train-mode'
import type { AnchorCandidate } from '@dalili/core'
import type { TrainStep } from './protocol'

const anchor: AnchorCandidate[] = [{ k: 'id', v: 'save-btn' }]

function trainStep(partial: Partial<TrainStep> = {}): TrainStep {
  return { id: 's1', kind: 'click', title: 'انقر زر الحفظ', anchor, url: 'https://x.test/a', ...partial }
}

function fireClick(el: Element) {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))
}

/** jsdom يعيد مستطيلًا صفريًا دائمًا — نحاكي هندسة حقيقية للعنصر */
function withRect(el: Element, x = 10, y = 10, w = 120, h = 40) {
  el.getBoundingClientRect = () => ({ x, y, width: w, height: h, top: y, left: x, right: x + w, bottom: y + h, toJSON: () => ({}) } as DOMRect)
  return el
}

/** الأزرار داخل بطاقة التدريب نفسها تمر عبر Shadow DOM — ندفعها كما يفعل المتصفح */
function clickShadowButton(label: string) {
  const host = document.querySelector('dalili-train')!
  const btn = Array.from(host.shadowRoot!.querySelectorAll('button')).find((b) => b.textContent?.includes(label))
  expect(btn, `زر «${label}» داخل البطاقة`).toBeTruthy()
  btn!.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))
}

afterEach(() => {
  vi.useRealTimers()
  // المضيف يُلحق بـdocumentElement لا body — تنظيف صريح وإلا سرّبنا بطاقات بين الاختبارات
  document.querySelectorAll('dalili-train').forEach((h) => h.remove())
})

describe('train-mode — التدريب داخل الصفحة الهدف (GM-01..03)', () => {
  it('الخطوة تُحل فورًا فتظهر البطاقة بجانب الزر ودائرته المرسومة (GM-01)', () => {
    document.body.innerHTML = '<button id="save-btn">حفظ</button>'
    withRect(document.querySelector('#save-btn')!)
    const send = vi.fn()
    const mode = createTrainMode(send)
    mode.handle({ t: 'train-step', step: trainStep(), idx: 0, total: 3, guideTitle: 'دليل الفاتورة' })
    const host = document.querySelector('dalili-train')!
    const text = host.shadowRoot!.textContent ?? ''
    expect(text).toContain('دليل الفاتورة')
    expect(text).toContain('خطوة ١ من ٣')
    expect(text).toContain('انقر زر الحفظ')
    expect(host.shadowRoot!.querySelector('svg.ring')).toBeTruthy()
    mode.dispose()
  })

  it('RC1 — عنصر يظهر متأخرًا بعد اكتمال التحميل (صفحات SPA كـGmail): البحث الصبور يجده ويرسم دائرته', () => {
    vi.useFakeTimers()
    document.body.innerHTML = '<div>صفحة فارغة الآن</div>'
    const send = vi.fn()
    // على الشاشة الهدف نفسها — عنصر SPA متأخر لا انتظار دخول
    const mode = createTrainMode(send, undefined, () => 'https://x.test/a')
    mode.handle({ t: 'train-step', step: trainStep(), idx: 0, total: 2, guideTitle: 'د' })
    // قبل ظهوره: بطاقة بحث صادقة، لا رسالة فشل متسرعة
    expect(document.querySelector('dalili-train')!.shadowRoot!.textContent).toContain('أبحث عن الزر')
    // العنصر يظهر بعد 700 ملي — SPA أنهت تركيبها
    vi.advanceTimersByTime(700)
    const btn = withRect(document.createElement('button'))
    btn.id = 'save-btn'
    btn.textContent = 'حفظ'
    document.body.appendChild(btn)
    vi.advanceTimersByTime(400)
    const host = document.querySelector('dalili-train')!
    expect(host.shadowRoot!.querySelector('svg.ring')).toBeTruthy()
    expect(host.shadowRoot!.textContent).toContain('انقر الزر') // تعليمات النقر ظهرت بعد الحل
    // والنقر عليه الآن يُحتسب صحيحًا
    fireClick(btn)
    expect(send).toHaveBeenCalledWith('done')
    mode.dispose()
  })

  it('RC1 — عنصر لا يظهر أبدًا ونحن على الشاشة الصحيحة: بعد المهلة رسالة عدم وجود صادقة', () => {
    vi.useFakeTimers()
    document.body.innerHTML = '<div>صفحة تغيّرت</div>'
    const send = vi.fn()
    // على الشاشة الهدف نفسها (نفس رابط الخطوة) → غياب الزر عطبٌ حقيقي لا انتظار دخول
    const mode = createTrainMode(send, undefined, () => 'https://x.test/a')
    mode.handle({ t: 'train-step', step: trainStep(), idx: 0, total: 1, guideTitle: 'د' })
    vi.advanceTimersByTime(9000)
    const host = document.querySelector('dalili-train')!
    expect((host.shadowRoot!.querySelector('svg.ring') as HTMLElement).style.display).toBe('none')
    expect(host.shadowRoot!.textContent).toContain('لم أجد هذا الزر')
    clickShadowButton('تخطي')
    expect(send).toHaveBeenCalledWith('skip')
    mode.dispose()
  })

  it('RC2 — عنصر موجود لكنه مخفي (rect صفري) ونحن على الشاشة الصحيحة: يُعامل كغير موجود', () => {
    vi.useFakeTimers()
    document.body.innerHTML = '<button id="save-btn" style="display:none">حفظ</button>'
    const send = vi.fn()
    const mode = createTrainMode(send, undefined, () => 'https://x.test/a')
    mode.handle({ t: 'train-step', step: trainStep(), idx: 0, total: 1, guideTitle: 'د' })
    expect((document.querySelector('dalili-train')!.shadowRoot!.querySelector('svg.ring') as HTMLElement).style.display).toBe('none')
    vi.advanceTimersByTime(9000)
    expect(document.querySelector('dalili-train')!.shadowRoot!.textContent).toContain('لم أجد هذا الزر')
    mode.dispose()
  })

  it('LX-01 — الخطوة الأولى ولسنا على الشاشة الهدف (تحويل لتسجيل الدخول): بطاقة «استعد» لا رسالة فقدان', () => {
    vi.useFakeTimers()
    document.body.innerHTML = '<form id="login"><input type="password"></form>'
    const send = vi.fn()
    // صفحة الدخول: نفس النطاق لكن شاشة مختلفة عن رابط الخطوة → لسنا على الهدف
    const mode = createTrainMode(send, undefined, () => 'https://x.test/web/login')
    mode.handle({ t: 'train-step', step: trainStep(), idx: 0, total: 3, guideTitle: 'دليل الفاتورة' })
    vi.advanceTimersByTime(9000)
    const host = document.querySelector('dalili-train')!
    const text = host.shadowRoot!.textContent ?? ''
    expect(text).toContain('سجّل الدخول')
    expect(text).toContain('تلقائيًا')
    expect(text).not.toContain('لم أجد هذا الزر')
    // لا حلقة أبدية: مؤقتات البحث انقضت والانتظار مدفوع بالأحداث لا بالدوران
    mode.dispose()
  })

  it('LX-01 — بعد الدخول وظهور الشاشة الهدف: الخطوة تبدأ تلقائيًا وتُحتسب النقرة (مراقب أحداث)', () => {
    vi.useFakeTimers()
    document.body.innerHTML = '<form id="login"><input type="password"></form>'
    const send = vi.fn()
    let here = 'https://x.test/web/login'
    const mode = createTrainMode(send, undefined, () => here)
    mode.handle({ t: 'train-step', step: trainStep(), idx: 0, total: 2, guideTitle: 'د' })
    vi.advanceTimersByTime(9000)
    expect(document.querySelector('dalili-train')!.shadowRoot!.textContent).toContain('سجّل الدخول')
    // المستخدم سجّل ووصل الشاشة: الزر يُركّب في DOM (طفرة) والرابط صار الهدف
    here = 'https://x.test/a'
    const btn = withRect(document.createElement('button'))
    btn.id = 'save-btn'
    btn.textContent = 'حفظ'
    document.body.appendChild(btn)
    // المراقب يلتقط الطفرة ويعرض الخطوة بلا إعادة تحميل
    return Promise.resolve().then(() => {
      const host = document.querySelector('dalili-train')!
      expect(host.shadowRoot!.querySelector('svg.ring')).toBeTruthy()
      expect(host.shadowRoot!.textContent).toContain('انقر الزر')
      fireClick(btn)
      expect(send).toHaveBeenCalledWith('done')
      mode.dispose()
    })
  })

  it('خطوة جديدة تلغي بحث سابقتها — لا دائرة ولا رسالة متأخرة من خطوة قديمة', () => {
    vi.useFakeTimers()
    document.body.innerHTML = '<button id="other-btn">آخر</button>'
    withRect(document.querySelector('#other-btn')!)
    const send = vi.fn()
    const mode = createTrainMode(send)
    mode.handle({ t: 'train-step', step: trainStep(), idx: 0, total: 2, guideTitle: 'د' })
    mode.handle({
      t: 'train-step',
      step: trainStep({ id: 's2', title: 'انقر زر الآخر', anchor: [{ k: 'id', v: 'other-btn' }] }),
      idx: 1,
      total: 2,
      guideTitle: 'د',
    })
    vi.advanceTimersByTime(12000)
    const host = document.querySelector('dalili-train')!
    expect(host.shadowRoot!.textContent).toContain('انقر زر الآخر')
    expect(host.shadowRoot!.textContent).not.toContain('لم أجد هذا الزر')
    expect(host.shadowRoot!.querySelector('svg.ring')).toBeTruthy()
    mode.dispose()
  })

  it('train-stop أثناء البحث يفكك الطبقة فورًا — لا مؤقتات يتيمة', () => {
    vi.useFakeTimers()
    document.body.innerHTML = '<div>فارغ</div>'
    const mode = createTrainMode(vi.fn())
    mode.handle({ t: 'train-step', step: trainStep(), idx: 0, total: 1, guideTitle: 'د' })
    mode.handle({ t: 'train-stop', reason: 'stopped' })
    vi.advanceTimersByTime(12000)
    expect(document.querySelector('dalili-train')).toBeFalsy()
  })

  it('النقر الصحيح يبلّغ done — والزر داخل عنصر أكبر يظل صحيحًا (أيقونة داخل الزر)', () => {
    document.body.innerHTML = '<button id="save-btn"><svg></svg>حفظ</button><button id="other">إلغاء</button>'
    withRect(document.querySelector('#save-btn')!)
    const send = vi.fn()
    const mode = createTrainMode(send)
    mode.handle({ t: 'train-step', step: trainStep(), idx: 0, total: 1, guideTitle: 'د' })
    fireClick(document.querySelector('#save-btn svg')!)
    expect(send).toHaveBeenCalledWith('done')
    mode.dispose()
  })

  it('النقر الخاطئ لا يقدّم الخطوة — توجيه لطيف يظهر (GM-02)', () => {
    document.body.innerHTML = '<button id="save-btn">حفظ</button><button id="other">إلغاء</button>'
    withRect(document.querySelector('#save-btn')!)
    const send = vi.fn()
    const mode = createTrainMode(send)
    mode.handle({ t: 'train-step', step: trainStep(), idx: 0, total: 1, guideTitle: 'د' })
    fireClick(document.querySelector('#other')!)
    expect(send).not.toHaveBeenCalled()
    const host = document.querySelector('dalili-train')!
    expect(host.shadowRoot!.textContent).toContain('ليس هذا الزر')
    mode.dispose()
  })

  it('نقرة أثناء البحث (لا هدف بعد) ليست نقرة خاطئة — صمت حتى يعرف التدريب هدفه', () => {
    vi.useFakeTimers()
    document.body.innerHTML = '<button id="other">إلغاء</button>'
    const send = vi.fn()
    const mode = createTrainMode(send)
    mode.handle({ t: 'train-step', step: trainStep(), idx: 0, total: 1, guideTitle: 'د' })
    fireClick(document.querySelector('#other')!)
    expect(send).not.toHaveBeenCalled()
    expect(document.querySelector('dalili-train')!.shadowRoot!.textContent).not.toContain('ليس هذا الزر')
    mode.dispose()
  })

  it('خطوة كتابة: أي قيمة في الحقل الصحيح تكملها — خطوة مرنة (GM-06)', () => {
    document.body.innerHTML = '<input id="qty" name="qty">'
    withRect(document.querySelector('#qty')!, 10, 10, 160, 30)
    const send = vi.fn()
    const mode = createTrainMode(send)
    mode.handle({
      t: 'train-step',
      step: trainStep({ kind: 'input', title: 'اكتب الكمية', anchor: [{ k: 'id', v: 'qty' }] }),
      idx: 0,
      total: 1,
      guideTitle: 'د',
    })
    const input = document.querySelector('#qty') as HTMLInputElement
    input.value = 'أي قيمة يكتبها المتدرب'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    expect(send).toHaveBeenCalledWith('done')
    mode.dispose()
  })

  it('زر الإيقاف داخل البطاقة يبلّغ stop، وtrain-stop يفكك الطبقة (GM-03)', () => {
    document.body.innerHTML = '<button id="save-btn">حفظ</button>'
    withRect(document.querySelector('#save-btn')!)
    const send = vi.fn()
    const mode = createTrainMode(send)
    mode.handle({ t: 'train-step', step: trainStep(), idx: 0, total: 2, guideTitle: 'د' })
    clickShadowButton('إيقاف')
    expect(send).toHaveBeenCalledWith('stop')
    mode.handle({ t: 'train-stop', reason: 'stopped' })
    expect(document.querySelector('dalili-train')).toBeFalsy()
    mode.dispose()
  })

  it('النقر على أزرار البطاقة نفسها ليس نقرة خاطئة (تخطي/إيقاف)', () => {
    document.body.innerHTML = '<button id="save-btn">حفظ</button>'
    withRect(document.querySelector('#save-btn')!)
    const send = vi.fn()
    const mode = createTrainMode(send)
    mode.handle({ t: 'train-step', step: trainStep(), idx: 0, total: 2, guideTitle: 'د' })
    clickShadowButton('تخطي')
    expect(send).toHaveBeenCalledTimes(1) // skip فقط — لا wrong-click يراكم
    expect(send).toHaveBeenCalledWith('skip')
    expect(document.querySelector('dalili-train')!.shadowRoot!.textContent).not.toContain('ليس هذا الزر')
    mode.dispose()
  })

  it('train-stop بreason finished تعرض بطاقة الإنجاز قبل الفكك', () => {
    vi.useFakeTimers()
    document.body.innerHTML = '<button id="save-btn">حفظ</button>'
    withRect(document.querySelector('#save-btn')!)
    const send = vi.fn()
    const mode = createTrainMode(send)
    mode.handle({ t: 'train-step', step: trainStep(), idx: 0, total: 1, guideTitle: 'د' })
    fireClick(document.querySelector('#save-btn')!)
    mode.handle({ t: 'train-stop', reason: 'finished' })
    expect(document.querySelector('dalili-train')!.shadowRoot!.textContent).toContain('أكملت التدريب')
    vi.advanceTimersByTime(5000)
    expect(document.querySelector('dalili-train')).toBeFalsy()
    mode.dispose()
  })
})
