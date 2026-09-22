import { describe, expect, it } from 'vitest'
import {
  CaptureThrottle,
  captureFailReason,
  guardUrl,
  MAX_STEPS,
  NAV_AFTER_ACTION_SUPPRESS_MS,
  preShotShareable,
  preShotUsable,
  PRE_SHOT_MAX_AGE_MS,
  shouldDropConsequentNav,
  shouldMarkStep,
  shouldReplacePrev,
  shouldEmitNav,
} from './session'
import { scaleRect } from './blurl'

describe('CaptureThrottle — حد لقطات كروم 2/ثانية', () => {
  it('الأولى فورية والثانية خلال النافذة مؤجلة ثم تُقبل بعد الفاصل', () => {
    const t = new CaptureThrottle(600)
    expect(t.tryAcquire(1000)).toBe('now')
    expect(t.tryAcquire(1300)).toBe('defer')
    expect(t.tryAcquire(1601)).toBe('now')
  })
})

describe('preShotUsable — لقطة الضغط المسبقة تُلصَق بخطوتها الصحيحة فقط', () => {
  const pre = { ts: 1000, url: 'https://app.example/a' }
  it('ختم مطابق، نفس الصفحة، غير متقادمة → صالحة', () => {
    expect(preShotUsable(pre, { preTs: 1000, url: 'https://app.example/a' }, 1200)).toBe(true)
  })
  it('الحدث بلا preTs (لا لقطة ضغط) → مرفوضة فيلتقط حيًّا', () => {
    expect(preShotUsable(pre, { preTs: undefined, url: 'https://app.example/a' }, 1200)).toBe(false)
  })
  it('ختم مختلف (لقطة ضغطٍ لتفاعل آخر لاحق تحت نقرات متلاحقة) → مرفوضة', () => {
    expect(preShotUsable(pre, { preTs: 1001, url: 'https://app.example/a' }, 1200)).toBe(false)
  })
  it('اختلاف الرابط (تنقّل بين الضغط والحدث) → مرفوضة فلا يُرسم إطار على صفحة أخرى', () => {
    expect(preShotUsable(pre, { preTs: 1000, url: 'https://app.example/b' }, 1200)).toBe(false)
  })
  it('تجاوزت أقصى العمر → مرفوضة (لا لقطة ضغطٍ عتيقة)', () => {
    expect(preShotUsable(pre, { preTs: 1000, url: 'https://app.example/a' }, 1000 + PRE_SHOT_MAX_AGE_MS + 1)).toBe(false)
  })
})

describe('preShotShareable — خطوة الكتابة تشارك لقطة نقرة المغادرة (نفس الإطار)', () => {
  const pre = { ts: 1000, url: 'https://app.example/form' }
  const typed = { kind: 'input', ts: 900, url: 'https://app.example/form' } as const
  it('نفس الرابط وغير متقادمة (ولو بلا ختم مطابق) → قابلة للمشاركة فتظهر خطوة كتابة بلقطة', () => {
    // حدث كتابة بلا preTs، لكن لقطة نقرة المغادرة على نفس الصفحة تُظهر النص
    expect(preShotShareable(pre, typed, 1200)).toBe(true)
  })
  it('رابط مختلف (تنقّلت الصفحة) → لا تُشارك فلا تُلصق صفحة أخرى', () => {
    expect(preShotShareable(pre, { ...typed, url: 'https://app.example/next' }, 1200)).toBe(false)
  })
  it('متقادمة → لا تُشارك', () => {
    expect(preShotShareable(pre, typed, 1000 + PRE_SHOT_MAX_AGE_MS + 1)).toBe(false)
  })

  /**
   * تشخيص 2026-09-04: المشاركة كانت تقبل **أي** لقطة من نفس الرابط خلال ٥ ثوانٍ
   * ولأي نوع خطوة. فنقرةٌ رفض الخنقُ لقطتَها المسبقة كانت تأخذ بكسل **نقرةٍ
   * سابقة** على الصفحة نفسها (اللقطات لا تُحذف بعد الاستعمال): شاشة لا تخصّ
   * الخطوة، وخطوتان بصورة واحدة. الحصر في الكتابة/الاختيار يغلق الباب.
   *
   * ولا يصلح شرط ترتيب زمني: قياس حيّ في كروم أعطى pointerdown ثم change بعده
   * بمليّثانيتين — أي مقارنة أختام هنا تنقلب على الحالة الصحيحة نفسها.
   */
  it('لقطة الضغط تسبق حدث الكتابة بمليّثانيتين — والمشاركة تبقى صحيحة رغم ذلك', () => {
    expect(preShotShareable({ ts: 1000, url: typed.url }, { ...typed, ts: 1002 }, 1200)).toBe(true)
  })

  it('خطوة نقر لا تشارك لقطة غيرها — مسارها الحيّ أصدق من صورةِ لحظةٍ أخرى', () => {
    expect(preShotShareable(pre, { kind: 'click', ts: 900, url: typed.url }, 1200)).toBe(false)
    expect(preShotShareable(pre, { kind: 'navigate', ts: 900, url: typed.url }, 1200)).toBe(false)
  })

  it('الاختيار من قائمة يشارك كالكتابة — كلاهما يسبق نقرة المغادرة', () => {
    expect(preShotShareable(pre, { kind: 'select', ts: 900, url: typed.url }, 1200)).toBe(true)
  })
})

describe('captureFailReason — أسباب فشل اللقطة الصادقة (ق3)', () => {
  it('النافذة المصغّرة تُترجم لإرشاد عملي', () => {
    expect(captureFailReason(new Error('Cannot capture a screenshot of a minimized window'))).toContain('مصغّرة')
  })
  it('فشل الصلاحية يذكر السبب الحقيقي', () => {
    expect(captureFailReason(new Error('Cannot access contents of the page. Extension manifest must request permission'))).toContain('صلاحية')
  })
  it('تجاوز الحصة يطمئن أن اللقطات التالية تلحق', () => {
    expect(captureFailReason(new Error('This request exceeds the MAX_CAPTURECALLS_PER_SECOND quota.'))).toContain('تباطؤ')
  })
  it('الخطأ الغامض يُرفق نصه الخام — لا ابتلاع صامت', () => {
    expect(captureFailReason(new Error('weird failure xyz'))).toContain('weird failure xyz')
  })
  it('بلا رسالة إطلاقًا: السبب العام', () => {
    expect(captureFailReason(undefined)).toBe('فشل التقاط اللقطة لهذه الصفحة')
  })
})

describe('guardUrl — الصفحات المحجوبة', () => {
  it('صفحات النظام والمتجر وخادم دليلي نفسه', () => {
    expect(guardUrl('chrome://settings/').ok).toBe(false)
    expect(guardUrl('edge://extensions/').ok).toBe(false)
    expect(guardUrl('https://chromewebstore.google.com/detail/x').ok).toBe(false)
    expect(guardUrl('http://localhost:8787/files/x').ok).toBe(false)
    expect(guardUrl('https://erp.example.com/invoices').ok).toBe(true)
  })
})

describe('shouldReplacePrev — دمج الكتابة المتصلة في نفس الحقل', () => {
  const base = {
    sensitive: false,
    url: 'https://x/a',
    pageTitle: 'p',
    ts: 1,
    dpr: 1,
    target: { label: 'اسم العميل' },
  }
  it('إدخال متتالٍ بنفس الحقل والصفحة يحل محل السابق', () => {
    const prev = { ev: { ...base, kind: 'input' as const, value: 'شر' } }
    expect(shouldReplacePrev(prev, { ...base, kind: 'input', value: 'شركة النور' })).toBe(true)
  })
  it('حقل مختلف أو نوع مختلف لا يستبدل', () => {
    const prev = { ev: { ...base, kind: 'input' as const } }
    expect(shouldReplacePrev(prev, { ...base, kind: 'input', target: { label: 'الهاتف' } })).toBe(false)
    expect(shouldReplacePrev(prev, { ...base, kind: 'click' })).toBe(false)
    expect(shouldReplacePrev(undefined, { ...base, kind: 'input' })).toBe(false)
  })
  it('حد الخطوات المعقول', () => {
    expect(MAX_STEPS).toBe(200)
  })
})

describe('shouldEmitNav — بوابة خطوة التنقل', () => {
  it('تبويب خفي لا يرسل تنقلًا عند بدء الالتقاط (البث يصل للجميع) — العداد يبدأ من التبويب المرئي فقط', () => {
    expect(shouldEmitNav('', 'https://x/a', false)).toBe(false)
  })
  it('التبويب المرئي يرسل تنقل البداية مرة واحدة، والاستئناف على نفس الصفحة لا يكرره', () => {
    expect(shouldEmitNav('', 'https://x/a', true)).toBe(true)
    expect(shouldEmitNav('https://x/a', 'https://x/a', true)).toBe(false)
  })
  it('تنقل حدث والتبويب خفي يُبث لحظة ظهوره — لا يُبتلع', () => {
    expect(shouldEmitNav('https://x/a', 'https://x/b', false)).toBe(false)
    expect(shouldEmitNav('https://x/a', 'https://x/b', true)).toBe(true)
  })
})

describe('shouldDropConsequentNav — كبت تنقّل تبع لتفاعل (علة «لقطات تُلتقط لوحدها بلا تحديد»)', () => {
  const clickAt = (ts: number) => ({
    kind: 'click' as const,
    target: { label: 'الرئيسية' },
    sensitive: false,
    url: 'https://x/app#home',
    pageTitle: 'p',
    ts,
    dpr: 1,
  })
  const navAt = (ts: number) => ({
    kind: 'navigate' as const,
    target: {},
    sensitive: false,
    url: 'https://x/app',
    pageTitle: 'p',
    ts,
    dpr: 1,
  })
  it('تنقّل بعد 4 ثوانٍ من نقرة (سقوط fragment بدليل المالك gVW) → يُسقط — لا خطوة زائدة بلا تحديد', () => {
    expect(shouldDropConsequentNav({ ev: clickAt(1000) }, navAt(1000 + 4000))).toBe(true)
  })
  it('تنقّل بعد 9 ثوانٍ (أقصى عنقود التبعات المقيس على 40 دليلًا) → يُسقط', () => {
    expect(shouldDropConsequentNav({ ev: clickAt(1000) }, navAt(1000 + 9000))).toBe(true)
  })
  it('عند حدّ النافذة بالضبط → يُسقط (الحد مغلق)', () => {
    expect(shouldDropConsequentNav({ ev: clickAt(1000) }, navAt(1000 + NAV_AFTER_ACTION_SUPPRESS_MS))).toBe(true)
  })
  it('تنقّل بعد 18 ثانية (تنقّل مقصود — العنقود الآخر المقيس) → يبقى', () => {
    expect(shouldDropConsequentNav({ ev: clickAt(1000) }, navAt(1000 + 18000))).toBe(false)
  })
  it('أول تنقل بالجلسة (لا خطوة سابقة) → يبقى — صفحة البداية خطوة أولى', () => {
    expect(shouldDropConsequentNav(undefined, navAt(1000))).toBe(false)
  })
  it('تنقّل بعد تنقّل (سلسلة إعادة توجيه) → يبقى — خارج نطاق الإصلاح', () => {
    expect(shouldDropConsequentNav({ ev: navAt(1000) }, navAt(2000))).toBe(false)
  })
  it('حدث تفاعلي لا يُسقط أبدًا — الكبت للتنقل وحده', () => {
    expect(shouldDropConsequentNav({ ev: clickAt(1000) }, clickAt(2000))).toBe(false)
  })
  it('تنقّل بعد كتابة (تفاعل غير نقرة) خلال النافذة → يُسقط أيضًا', () => {
    const typeAt = (ts: number) => ({ ...clickAt(ts), kind: 'input' as const, value: 'بحث' })
    expect(shouldDropConsequentNav({ ev: typeAt(1000) }, navAt(3000))).toBe(true)
  })
})

describe('scaleRect — تحويل CSS px إلى بكسل الصورة عبر dpr', () => {
  it('dpr=2 يضاعف', () => {
    expect(scaleRect({ x: 10, y: 20, w: 100, h: 50 }, 2)).toEqual({ x: 20, y: 40, w: 200, h: 100 })
  })
})

describe('shouldMarkStep — أي الخطوات تُعلَّم بإطار على اللقطة', () => {
  const rect = { x: 1, y: 2, w: 30, h: 12 }
  it('كل خطوة تحمل مستطيلًا تُعلَّم: نقرة وكتابة واختيار وتبديل وEnter — لا النقر وحده', () => {
    for (const kind of ['click', 'input', 'select', 'toggle', 'keypress'] as const) {
      expect(shouldMarkStep({ kind, sensitive: false, rect }), kind).toBe(true)
    }
  })
  it('الحساسة لا تُعلَّم — أولويتها الطمس', () => {
    expect(shouldMarkStep({ kind: 'input', sensitive: true, rect })).toBe(false)
  })
  it('بلا مستطيل (تنقل) لا تعليم', () => {
    expect(shouldMarkStep({ kind: 'navigate', sensitive: false })).toBe(false)
  })
})

