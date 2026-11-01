import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GuideDto } from '@dalili/shared'

// ث٢: الإرسال نفسه مختبر في train-runs.test.ts — هنا نتحقق أنه يُطلب بعد الإلحاق، بلا شبكة حقيقية
vi.mock('./train-runs', async (orig) => ({ ...(await orig<typeof import('./train-runs')>()), flushTrainRuns: vi.fn(async () => {}) }))

// بلاغ المالك 2026-10-31: دليل مسجّل على السجل 3 فتح «دربني» فوق تبويب مفتوح على /new —
// الأرقام رموز متغيّرة فبدت الشاشتان واحدة، والأزرار مختلفة. القرار: تبويب جديد دائمًا على الرابط نفسه

const target = 'https://souglink.odoo.com/odoo/accounting/1/account.move/3'
const guide: GuideDto = {
  id: 'g1',
  schemaVersion: 2,
  title: 'فاتورة',
  locale: 'ar',
  dir: 'rtl',
  createdAt: '',
  updatedAt: '',
  steps: [{ id: 's1', kind: 'click', title: 'اعتمد', target: { anchor: [{ k: 'id', v: 'confirm' }] }, sensitive: false, url: target, pageTitle: 'ص', ts: 1 }],
}

let tabs: { create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
beforeEach(() => {
  vi.resetModules()
  tabs = { create: vi.fn(async () => ({ id: 77 })), update: vi.fn(async () => ({})) }
  vi.stubGlobal('chrome', {
    tabs: {
      ...tabs,
      query: vi.fn(async () => [{ id: 5, url: 'https://souglink.odoo.com/odoo/accounting/1/account.move/new', windowId: 1 }]),
      get: vi.fn(async () => ({ id: 5, windowId: 1 })),
      sendMessage: vi.fn(async () => ({})),
    },
    windows: { update: vi.fn(async () => ({})) },
    storage: { local: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}), remove: vi.fn(async () => {}) } },
  })
})

describe('startTraining — تبويب التدريب', () => {
  it('يفتح تبويبًا جديدًا على رابط الدليل نفسه ولو كان الموقع مفتوحًا على شاشة تشبهها', async () => {
    const { startTraining } = await import('./train-bg')
    expect(await startTraining({ guide })).toEqual({ ok: true })
    expect(tabs.create).toHaveBeenCalledWith({ url: target, active: true })
    expect(tabs.update).not.toHaveBeenCalled()
  })
})

describe('ث٣ — دليل الشريك على نسخة شركة الموظف', () => {
  const official: GuideDto = { ...guide, steps: [{ ...guide.steps[0]!, url: 'https://demo.odoo.com/odoo/action-1#menu=3' }] }
  const openTabs = (urls: string[]) => (chrome.tabs.query as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(urls.map((url, i) => ({ id: i + 1, url, lastAccessed: 100 - i })))

  it('يفتح نسخة الشركة المسجّلة والمسار والـhash كما هما', async () => {
    openTabs(['https://mail.google.com/x'])
    const { startTraining } = await import('./train-bg')
    expect(await startTraining({ guide: official, hosts: { hosts: ['alofuq.odoo.com'], patterns: ['*.odoo.com'] } })).toEqual({ ok: true })
    expect(tabs.create).toHaveBeenCalledWith({ url: 'https://alofuq.odoo.com/odoo/action-1#menu=3', active: true })
  })

  const noDomain = { from: 'demo.odoo.com', hosts: [], patterns: [], systemPatterns: ['*.odoo.com'] }

  it('بلا نطاق مسجّل للشركة: تبويب الموظف المفتوح على نظامه يُستعمل بأصله', async () => {
    openTabs(['http://acme.odoo.com:8069/odoo'])
    const { startTraining } = await import('./train-bg')
    await startTraining({ guide: official, hosts: noDomain })
    expect(tabs.create).toHaveBeenCalledWith({ url: 'http://acme.odoo.com:8069/odoo/action-1#menu=3', active: true })
  })

  it('لا نطاق للشركة ولا تبويب على النظام: رسالة «افتح نظامك» بلا تبويب على نسخة الشريك — ولو كان تبويب الشريك مفتوحاً', async () => {
    openTabs(['https://mail.google.com/x', 'https://demo.odoo.com/odoo'])
    const { startTraining } = await import('./train-bg')
    const { t } = await import('./i18n')
    expect(await startTraining({ guide: official, hosts: noDomain })).toEqual({ ok: false, errorAr: t('ext.trainOpenSystem') })
    expect(tabs.create).not.toHaveBeenCalled()
  })

  it('دليل عادي بلا hosts: الرابط كما سُجّل', async () => {
    const { startTraining } = await import('./train-bg')
    await startTraining({ guide: official })
    expect(tabs.create).toHaveBeenCalledWith({ url: 'https://demo.odoo.com/odoo/action-1#menu=3', active: true })
  })
})

describe('الخطوات اللاحقة — لا انتقال يضيّع النموذج', () => {
  const two: GuideDto = {
    ...guide,
    steps: [
      { ...guide.steps[0]!, url: 'https://souglink.odoo.com/odoo/accounting/1/account.move/new' },
      { ...guide.steps[0]!, id: 's2', url: 'https://souglink.odoo.com/odoo/accounting/1/account.move/9' },
    ],
  }
  const at = (url: string) => (chrome.tabs.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 77, url })

  it('رقم السجل تغيّر بعد الحفظ (/new ← /12) والشاشة نفسها = تسليم الخطوة بلا انتقال', async () => {
    const { startTraining, onTrainProgress } = await import('./train-bg')
    await startTraining({ guide: two })
    at('https://souglink.odoo.com/odoo/accounting/1/account.move/12')
    await onTrainProgress('done', 77)
    expect(tabs.update).not.toHaveBeenCalled()
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(77, expect.objectContaining({ t: 'train-step', idx: 1 }))
  })

  it('الخطوة على شاشة أخرى فعلًا = ينتقل التبويب إليها', async () => {
    const { startTraining, onTrainProgress } = await import('./train-bg')
    await startTraining({ guide: { ...two, steps: [two.steps[0]!, { ...two.steps[1]!, url: 'https://souglink.odoo.com/odoo/sales' }] } })
    at('https://souglink.odoo.com/odoo/accounting/1/account.move/12')
    await onTrainProgress('done', 77)
    expect(tabs.update).toHaveBeenCalledWith(77, { url: 'https://souglink.odoo.com/odoo/sales' })
  })
})

describe('ث١: نتائج الخطوات وطابور التدريبات المنتهية', () => {
  const setCalls = () => vi.mocked(chrome.storage.local.set).mock.calls.map((c) => c[0] as Record<string, unknown>)

  it('نتيجة الخطوة تُحفظ ثم يُلحق التدريب بالطابور عند انتهائه — بلا هوية الموظف', async () => {
    const { startTraining, onTrainOutcome, onTrainProgress } = await import('./train-bg')
    await startTraining({ guide })
    await onTrainOutcome({ idx: 0, outcome: 'verified', confidence: 'high' }, 77)
    await onTrainProgress('done', 77)
    expect(setCalls()).toContainEqual({ trainRunsPending: [{ runId: expect.any(String), guideId: 'g1', token: undefined, steps: [{ stepId: 's1', outcome: 'verified', confidence: 'high' }] }] })
    const { flushTrainRuns } = await import('./train-runs')
    expect(flushTrainRuns).toHaveBeenCalled()
  })

  it('نتيجة وتقدّم متتاليان بلا انتظار: النتيجة تبقى في موضع خطوتها', async () => {
    const { startTraining, onTrainOutcome, onTrainProgress } = await import('./train-bg')
    await startTraining({ guide })
    await Promise.all([onTrainOutcome({ idx: 0, outcome: 'confirmed', confidence: 'medium' }, 77), onTrainProgress('done', 77)])
    const q = setCalls().find((c) => 'trainRunsPending' in c)!.trainRunsPending as Array<{ steps: unknown[] }>
    expect(q[0]!.steps).toEqual([{ stepId: 's1', outcome: 'confirmed', confidence: 'medium' }])
  })

  it('تجربة المؤلف من المحرر لا تُلحق بالطابور — وإلا عدّت مسودته خطوات المنشور معطوبة (مراجعة ٢)', async () => {
    const { startTraining, onTrainOutcome, onTrainProgress } = await import('./train-bg')
    await startTraining({ guide, trial: true })
    await onTrainOutcome({ idx: 0, outcome: 'missing', confidence: null }, 77)
    await onTrainProgress('skip', 77)
    expect(setCalls().some((c) => 'trainRunsPending' in c)).toBe(false)
  })

  it('نتيجة من تبويب آخر لا تمسّ الجلسة', async () => {
    const { startTraining, onTrainOutcome, onTrainProgress } = await import('./train-bg')
    await startTraining({ guide })
    await onTrainOutcome({ idx: 0, outcome: 'verified', confidence: 'high' }, 5)
    await onTrainProgress('done', 77)
    expect(setCalls().some((c) => 'trainRunsPending' in c)).toBe(false)
  })

  it('الاستبدال بتدريب جديد لا يُلحق تدريبًا ناقصًا بالطابور', async () => {
    const { startTraining, onTrainOutcome } = await import('./train-bg')
    await startTraining({ guide })
    await onTrainOutcome({ idx: 0, outcome: 'declared', confidence: null }, 77)
    await startTraining({ guide })
    expect(setCalls().some((c) => 'trainRunsPending' in c)).toBe(false)
  })

  it('الطابور يُلحق بما سبق ولا يستبدله', async () => {
    vi.mocked(chrome.storage.local.get).mockResolvedValue({ trainRunsPending: [{ guideId: 'old', steps: [] }] } as never)
    const { startTraining, onTrainOutcome, onTrainProgress } = await import('./train-bg')
    await startTraining({ guide })
    await onTrainOutcome({ idx: 0, outcome: 'missing', confidence: null }, 77)
    await onTrainProgress('skip', 77)
    const q = setCalls().find((c) => 'trainRunsPending' in c)!.trainRunsPending as unknown[]
    expect(q).toHaveLength(2)
  })
})
