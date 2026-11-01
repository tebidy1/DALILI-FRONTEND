import { describe, expect, it, vi } from 'vitest'
import { advanceTrain, buildTrainPlan, bumpTrainStats, isTrainHosts, onTargetScreen, pickTrainHost, recordOutcome, rehostPlan, retryUntil } from './train'
import type { TrainStep } from './protocol'
import type { TrainSession } from './protocol'
import type { AnchorCandidate } from '@dalili/core'
import type { GuideDto, StepDto } from '@dalili/shared'

function step(partial: Partial<StepDto>): StepDto {
  return {
    id: 's',
    kind: 'click',
    title: 'خطوة',
    target: {},
    sensitive: false,
    url: 'https://x.test/a',
    pageTitle: 'ص',
    ts: 1,
    ...partial,
  }
}

function guide(steps: StepDto[]): GuideDto {
  return {
    id: 'g1',
    schemaVersion: 1,
    title: 'دليل الفاتورة',
    locale: 'ar',
    dir: 'rtl',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    steps,
  }
}

const anchor: AnchorCandidate[] = [{ k: 'id', v: 'save' }]

describe('buildTrainPlan — خطة التدريب من الدليل (GM-01)', () => {
  it('يبقي الأفعال القابلة للتدريب ذات المرساة فقط — navigate انتقال لا فعل مستخدم', () => {
    const plan = buildTrainPlan(
      guide([
        step({ id: 'n1', kind: 'navigate', url: 'https://x.test/a' }),
        step({ id: 'c1', kind: 'click', target: { anchor } }),
        step({ id: 'c2', kind: 'click', target: {} }), // بلا مرساة — عرض فقط
        step({ id: 'i1', kind: 'input', target: { anchor } }),
      ]),
    )
    expect(plan.map((s) => s.id)).toEqual(['c1', 'i1'])
    expect(plan[0]).toMatchObject({ title: 'خطوة', anchor, url: 'https://x.test/a' })
  })

  it('يحمل الملاحظة مع الخطوة — كلام الخبير يظهر في بطاقة التدريب', () => {
    const plan = buildTrainPlan(guide([step({ id: 'c1', note: 'انتبه: الحقل حساس', target: { anchor } })]))
    expect(plan[0]!.note).toBe('انتبه: الحقل حساس')
  })

  it('بلاغ أودو: «انقر الحقل» ثم «أدخل» فيه تُطوى في خطوة الكتابة — والزر قبل الكتابة يبقى', () => {
    const ta: AnchorCandidate[] = [{ k: 'path', v: 'tbody:nth-of-type(1) > tr:nth-of-type(3) > td:nth-of-type(2) > div:nth-of-type(1) > textarea:nth-of-type(1)' }]
    const qtyTd: AnchorCandidate[] = [
      { k: 'name', v: 'product_uom_qty' },
      { k: 'path', v: 'div:nth-of-type(2) > table:nth-of-type(1) > tbody:nth-of-type(1) > tr:nth-of-type(3) > td:nth-of-type(3)' },
    ]
    const qtyIn: AnchorCandidate[] = [
      { k: 'path', v: 'table:nth-of-type(1) > tbody:nth-of-type(1) > tr:nth-of-type(3) > td:nth-of-type(3) > div:nth-of-type(1) > input:nth-of-type(1)' },
    ]
    const plan = buildTrainPlan(
      guide([
        step({ id: 'add', kind: 'click', target: { role: 'button', text: 'Add Line', anchor: [{ k: 'text', v: 'Add Line' }] } }),
        step({ id: 'clickTa', kind: 'click', target: { role: 'textarea', anchor: ta } }),
        step({ id: 'typeTa', kind: 'input', value: 'A', target: { anchor: ta } }),
        step({ id: 'clickQty', kind: 'click', target: { role: 'td', anchor: qtyTd } }),
        step({ id: 'typeQty', kind: 'input', value: '2', target: { anchor: qtyIn } }),
      ]),
    )
    expect(plan.map((s) => s.id)).toEqual(['add', 'typeTa', 'typeQty'])
    // اسم عمود الخلية يصير مرساة دلالية للحقل — يطابق حقل الصف المحرَّر أيًّا كان رقمه
    expect(plan[2]!.anchor[0]).toEqual({ k: 'path', v: '[name="product_uom_qty"] input' })
  })

  it('دليل كله بلا مراساة (أدلة ما قبل AUTO-01) = خطة فارغة — تُعلَب بصدق لا تدريب وهمي', () => {
    expect(buildTrainPlan(guide([step({ kind: 'click' })]))).toEqual([])
  })
})

describe('onTargetScreen — هل الرابط على الشاشة الهدف (مصدر المطابقة الواحد)', () => {
  const partners = 'https://app.odoo.test/web#action=42&model=res.partner&view_type=list'

  it('نفس النطاق وكل رموز الهدف حاضرة (أشمل أو مساوية) = على الهدف', () => {
    expect(onTargetScreen(partners, partners)).toBe(true)
    expect(onTargetScreen(`${partners}&search_default_customer=1`, partners)).toBe(true)
  })

  it('نطاق مختلف أو شاشة تنقص رموز الهدف أو رابط فارغ/داخلي = ليس على الهدف', () => {
    expect(onTargetScreen('https://app.odoo.test/web#action=99&model=sale.order', partners)).toBe(false)
    expect(onTargetScreen('https://mail.google.test/mail/u/0', partners)).toBe(false)
    expect(onTargetScreen(undefined, partners)).toBe(false)
    expect(onTargetScreen('chrome://newtab/', partners)).toBe(false)
  })
})

describe('advanceTrain — تقدّم الجلسة (GM-02/GM-03)', () => {
  const session = { token: 't', guideId: 'g', guideTitle: 'د', idx: 0, tabId: 7, startedAt: 1, steps: [
    { id: 'a', kind: 'click' as const, title: '١', anchor, url: 'u' },
    { id: 'b', kind: 'click' as const, title: '٢', anchor, url: 'u' },
  ] }

  it('done وskip يقدمان الخطوة بنفس الوزن — التخطي لا يعلّق التدريب', () => {
    const s1 = advanceTrain(session, 'done')!
    expect(s1.session.idx).toBe(1)
    expect(advanceTrain(s1.session, 'skip')!.session.idx).toBe(2)
  })

  it('نهاية الخطوات = جلسة منتهية مكتملة', () => {
    const s1 = advanceTrain(session, 'done')!
    const s2 = advanceTrain(s1.session, 'done')!
    expect(s2.finished).toBe(true)
    expect(s2.completed).toBe(true)
  })

  it('stop ينهي الجلسة فورًا — مكتملة فقط إن بلغ ٨٠٪ (GM-03)', () => {
    expect(advanceTrain(session, 'stop')!.completed).toBe(false)
    const deep = { ...session, idx: 4, steps: session.steps.concat(
      { id: 'c', kind: 'click' as const, title: '٣', anchor, url: 'u' },
      { id: 'd', kind: 'click' as const, title: '٤', anchor, url: 'u' },
      { id: 'e', kind: 'click' as const, title: '٥', anchor, url: 'u' },
    ) }
    // ٤ من ٥ منجزة (٨٠٪) ثم إيقاف → مكتمل بقرار GM-03
    const stopped = advanceTrain(deep, 'stop')!
    expect(stopped.finished).toBe(true)
    expect(stopped.completed).toBe(true)
  })
})

describe('bumpTrainStats — تتبّع مجمّع بلا بيانات أفراد (GM-03)', () => {
  it('يزيد الجولات دائمًا والإكمال عند الاكتمال فقط — غير قابل للتغيير في المكان', () => {
    const a = bumpTrainStats(undefined, false)
    expect(a).toEqual({ runs: 1, completed: 0 })
    const b = bumpTrainStats(a, true)
    expect(b).toEqual({ runs: 2, completed: 1 })
    expect(a).toEqual({ runs: 1, completed: 0 })
  })
})


describe('retryUntil — تسليم صبور بحد أقصى (RC3: سباق جهوزية سكربت المحتوى)', () => {
  it('ينجح حين تنجح المحاولة الثالثة — المحاولتان الأولان رُفضتا', async () => {
    vi.useFakeTimers()
    let n = 0
    const p = retryUntil(
      () => {
        n++
        return n < 3 ? Promise.reject(new Error('receiving end does not exist')) : Promise.resolve(true)
      },
      { attempts: 6, intervalMs: 400 },
    )
    await vi.advanceTimersByTimeAsync(1000)
    await expect(p).resolves.toBe(true)
    expect(n).toBe(3)
    vi.useRealTimers()
  })

  it('يتخلى بعد آخر محاولة بصدق — false لا تعليق أبدًا', async () => {
    vi.useFakeTimers()
    let n = 0
    const p = retryUntil(
      () => {
        n++
        return Promise.reject(new Error('gone'))
      },
      { attempts: 4, intervalMs: 300 },
    )
    await vi.advanceTimersByTimeAsync(2000)
    await expect(p).resolves.toBe(false)
    expect(n).toBe(4)
    vi.useRealTimers()
  })

  it('shouldStop يقطع الإعادة فورًا — لا تسليم خطوة قديمة لجلسة تحرّكت', async () => {
    vi.useFakeTimers()
    let n = 0
    const p = retryUntil(
      () => {
        n++
        return Promise.reject(new Error('busy'))
      },
      { attempts: 10, intervalMs: 300, shouldStop: () => n >= 2 },
    )
    await vi.advanceTimersByTimeAsync(5000)
    await expect(p).resolves.toBe(false)
    expect(n).toBe(2)
    vi.useRealTimers()
  })
})

describe('ث١: صورة الزر ونتائج الخطوات', () => {
  const mark = { rect: { x: 10, y: 10, w: 40, h: 20 }, color: '#ea580c' as const }
  it('الخطوة تحمل صورة زرها حين لا يتقاطع التحديد مع تمويه', () => {
    const plan = buildTrainPlan(guide([step({ target: { anchor }, screenshot: { fileId: 'f', fileUrl: 'https://f/1', blurRects: [], mark } })]))
    expect(plan[0]!.shot).toEqual({ url: 'https://f/1', mark: { x: 10, y: 10, w: 40, h: 20 } })
  })

  it('تحديد يتقاطع مع منطقة مموّهة = لا صورة (التمويه غير مخبوز في الملف)', () => {
    const plan = buildTrainPlan(guide([step({ target: { anchor }, screenshot: { fileId: 'f', fileUrl: 'https://f/1', blurRects: [{ x: 30, y: 15, w: 50, h: 10 }], mark } })]))
    expect(plan[0]!.shot).toBeUndefined()
  })

  it('تمويه قرب التحديد داخل هامش القصّ = لا صورة (مراجعة C3: البطاقة تعرض التحديد ± الهامش)', () => {
    // التحديد ينتهي عند x=50؛ التمويه يبدأ عند 55 — خارج التحديد، داخل هامش ١٢px
    const plan = buildTrainPlan(guide([step({ target: { anchor }, screenshot: { fileId: 'f', fileUrl: 'https://f/1', blurRects: [{ x: 55, y: 10, w: 30, h: 20 }], mark } })]))
    expect(plan[0]!.shot).toBeUndefined()
  })

  it('بلا رابط ملف أو بلا تحديد = لا صورة', () => {
    expect(buildTrainPlan(guide([step({ target: { anchor }, screenshot: { fileId: 'f', blurRects: [], mark } })]))[0]!.shot).toBeUndefined()
    expect(buildTrainPlan(guide([step({ target: { anchor }, screenshot: { fileId: 'f', fileUrl: 'https://f/1', blurRects: [] } })]))[0]!.shot).toBeUndefined()
  })

  const session: TrainSession = { guideId: 'g', guideTitle: 'د', steps: buildTrainPlan(guide([step({ id: 'a', target: { anchor } }), step({ id: 'b', target: { anchor } })])), idx: 0, tabId: 1, startedAt: 0 }

  it('recordOutcome يضع النتيجة في موضع الخطوة بمعرّفها', () => {
    const s = recordOutcome(session, { idx: 1, outcome: 'confirmed', confidence: 'medium' })
    expect(s.outcomes![1]).toEqual({ stepId: 'b', outcome: 'confirmed', confidence: 'medium' })
  })

  it('الترقية من declared إلى verified فقط — لا تُمحى نتيجة أخرى', () => {
    const up = recordOutcome(recordOutcome(session, { idx: 0, outcome: 'declared', confidence: null }), { idx: 0, outcome: 'verified', confidence: 'high' })
    expect(up.outcomes![0]!.outcome).toBe('verified')
    const kept = recordOutcome(recordOutcome(session, { idx: 0, outcome: 'missing', confidence: null }), { idx: 0, outcome: 'verified', confidence: 'high' })
    expect(kept.outcomes![0]!.outcome).toBe('missing')
  })

  it('فهرس خارج الخطوات يُتجاهل', () => {
    expect(recordOutcome(session, { idx: 9, outcome: 'verified', confidence: 'high' })).toBe(session)
  })
})

// ث٣ (§٥.٧): دليل الشريك سُجّل على نسخته — يُفتح على نسخة شركة الموظف
describe('pickTrainHost — أين يُفتح دليل الشريك', () => {
  const t = { from: 'demo.odoo.com', hosts: ['alofuq.odoo.com'], patterns: ['*.alofuq.sa'], systemPatterns: ['*.odoo.com'] }
  it('تبويب على نطاق الشركة الصريح يُقدَّم ولو كان غيره أحدث (مراجعة ١)', () =>
    expect(pickTrainHost(t, ['https://clientb.odoo.com/odoo', 'https://alofuq.odoo.com/odoo'])).toBe('https://alofuq.odoo.com'))
  it('نجمة الشركة تطابق تبويباً وتحفظ أصله كما هو (المنفذ وhttp — مراجعة ٣)', () =>
    expect(pickTrainHost({ ...t, hosts: [] }, ['http://erp.alofuq.sa:8069/web'])).toBe('http://erp.alofuq.sa:8069'))
  it('للشركة نطاق صريح: تبويب يطابق نمط النظام وحده لا يُستعمل — نسخة عميل آخر', () =>
    expect(pickTrainHost(t, ['https://clientb.odoo.com/odoo'])).toBe('https://alofuq.odoo.com'))
  it('بلا نطاق للشركة: نمط النظام يطابق تبويب الموظف', () =>
    expect(pickTrainHost({ ...t, hosts: [], patterns: [] }, ['https://acme.odoo.com/odoo'])).toBe('https://acme.odoo.com'))
  it('تبويب الشريك نفسه (from) لا يُختار أبداً بنمط النظام', () =>
    expect(pickTrainHost({ ...t, hosts: [], patterns: [] }, ['https://demo.odoo.com/odoo'])).toBeNull())
  it('لا تبويب مطابق: أول نطاق صريح بـ https، وإلا null', () => {
    expect(pickTrainHost(t, ['https://mail.google.com/x', 'chrome://extensions'])).toBe('https://alofuq.odoo.com')
    expect(pickTrainHost({ ...t, hosts: [], patterns: [] }, [])).toBeNull()
  })
  it('النجمة لا تطابق النطاق نفسه، والمطابقة بلا www', () => {
    expect(pickTrainHost({ ...t, hosts: [], patterns: [] }, ['https://odoo.com/'])).toBeNull()
    expect(pickTrainHost({ ...t, hosts: [] }, ['https://www.alofuq.sa/x'])).toBe('https://www.alofuq.sa')
  })
})

describe('rehostPlan — النقل إلى نسخة الشركة', () => {
  const step = (id: string, url: string): TrainStep => ({ id, kind: 'click', title: id, anchor: [{ k: 'id', v: id }], url })
  const plan = [step('sso', 'https://login.sso.test/auth'), step('a', 'https://demo.odoo.com/odoo/action-1?x=1#menu=3'), step('c', 'http://demo.odoo.com/odoo/sales')]
  it('خطوات موقع الدليل (from) تنتقل والمسار والاستعلام والـhash كما هي؛ الدخول الموحّد يبقى ولو كان أولاً (مراجعة ٢)', () => {
    expect(rehostPlan(plan, 'demo.odoo.com', 'https://alofuq.odoo.com').map((s) => s.url)).toEqual([
      'https://login.sso.test/auth',
      'https://alofuq.odoo.com/odoo/action-1?x=1#menu=3',
      'https://alofuq.odoo.com/odoo/sales',
    ])
  })
  it('الأصل بمنفذ وhttp يُنقل كما هو', () =>
    expect(rehostPlan(plan, 'demo.odoo.com', 'http://erp.alofuq.sa:8069')[1]!.url).toBe('http://erp.alofuq.sa:8069/odoo/action-1?x=1#menu=3'))
  it('بلا from: مضيف أول خطوة', () => expect(rehostPlan(plan.slice(1), undefined, 'https://alofuq.odoo.com')[0]!.url).toBe('https://alofuq.odoo.com/odoo/action-1?x=1#menu=3'))
  it('الدليل على نسخة الشركة أصلاً: بلا تغيير', () => expect(rehostPlan(plan, 'demo.odoo.com', 'https://demo.odoo.com')).toEqual(plan))
  it('رابط فاسد يبقى كما هو', () => expect(rehostPlan([step('a', 'not a url')], undefined, 'https://x.odoo.com')[0]!.url).toBe('not a url'))
})

describe('isTrainHosts — ما يرحّله سكربت المحتوى من الصفحة', () => {
  it('الشكل الصحيح فقط', () => {
    expect(isTrainHosts({ hosts: ['a.odoo.com'], patterns: [] })).toBe(true)
    expect(isTrainHosts({ hosts: 'a', patterns: [] })).toBe(false)
    expect(isTrainHosts({ hosts: [1], patterns: [] })).toBe(false)
    expect(isTrainHosts(undefined)).toBe(false)
  })
})
