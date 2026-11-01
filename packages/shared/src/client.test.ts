import { afterEach, describe, expect, it, vi } from 'vitest'
import { DaliliClient, DaliliApiError } from './client'

// ث٢: مسارات سجل التدريب وحال الدليل — المسار والطريقة والجسم كما يتوقعها Laravel

const calls: Array<{ url: string; init: RequestInit }> = []
function stubFetch(status: number, body = '') {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return new Response(status === 204 ? null : body, { status })
  }))
}
afterEach(() => {
  calls.length = 0
  vi.unstubAllGlobals()
})

const run = { runId: 'run-abc123', steps: [{ stepId: 's1', outcome: 'missing' as const, confidence: null }] }

describe('سجل التدريب', () => {
  it('sendTrainRun: POST عبر الدليل بالجسم كما هو', async () => {
    stubFetch(204)
    await new DaliliClient('https://api.test').sendTrainRun('g1', run)
    expect(calls[0]!.url).toBe('https://api.test/api/guides/g1/train-runs')
    expect(calls[0]!.init.method).toBe('POST')
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual(run)
  })

  it('sendSharedTrainRun: POST عبر رمز المشاركة', async () => {
    stubFetch(204)
    await new DaliliClient('').sendSharedTrainRun('tok', run)
    expect(calls[0]!.url).toBe('/api/share/tok/train-runs')
    expect(calls[0]!.init.method).toBe('POST')
  })

  it('guideHealth: GET حال الدليل', async () => {
    const health = { broken: true, companies: 1, steps: [{ stepId: 's1', broken: true, bad: 3, seen: 5, since: '2026-10-31' }] }
    stubFetch(200, JSON.stringify(health))
    expect(await new DaliliClient('').guideHealth('g1')).toEqual(health)
    expect(calls[0]!.url).toBe('/api/guides/g1/health')
  })

  it('الفشل يحمل الحالة والرمز', async () => {
    stubFetch(400, JSON.stringify({ errorAr: 'سجل التدريب غير صالح', code: 'E-TRN-01' }))
    const err = await new DaliliClient('').sendTrainRun('g1', run).catch((e) => e)
    expect(err).toBeInstanceOf(DaliliApiError)
    expect([err.status, err.code]).toEqual([400, 'E-TRN-01'])
  })
})

describe('د١ب الدرس', () => {
  it('courseLesson: GET الدرس الواحد من الدورة', async () => {
    const lesson = { id: 'l1', type: 'video', title: 'ترحيب', videoUrl: 'https://youtu.be/x' }
    stubFetch(200, JSON.stringify(lesson))
    expect(await new DaliliClient('').courseLesson('c1', 'l1')).toEqual(lesson)
    expect(calls[0]!.url).toBe('/api/courses/c1/lessons/l1')
  })
})

// هـ ج١ (HLP) «ما هذا؟»: طرق الشروح — المسار والطريقة والجسم كما يتوقعها Laravel
describe('شروح «ما هذا؟»', () => {
  it('notes: GET شروح النظام للشركة', async () => {
    const dto = { system: { id: 'odoo', name: 'أودو' }, canRequest: true, notes: [] }
    stubFetch(200, JSON.stringify(dto))
    expect(await new DaliliClient('').notes('alofuq.odoo.com')).toEqual(dto)
    expect(calls[0]!.url).toBe('/api/notes?site=alofuq.odoo.com')
  })

  it('noteSteps: GET مراسي خطوات الأدلة', async () => {
    stubFetch(200, '[]')
    await new DaliliClient('').noteSteps('alofuq.odoo.com')
    expect(calls[0]!.url).toBe('/api/notes/steps?site=alofuq.odoo.com')
  })

  it('myNotes: GET لوحة الشريك', async () => {
    stubFetch(200, JSON.stringify({ system: null, notes: [], guides: [], clients: [] }))
    await new DaliliClient('').myNotes('demo.odoo.com')
    expect(calls[0]!.url).toBe('/api/notes/mine?site=demo.odoo.com')
  })

  it('createNote: POST بالالتقاط كاملًا، وupdateNote: PATCH بالجملة والجمهور', async () => {
    stubFetch(200, JSON.stringify({ id: 'n1' }))
    const input = { systemId: 'odoo', anchor: [{ k: 'id' as const, v: 'btn_confirm' }], screenKey: 'account form web', label: 'تأكيد', body: 'جملة', audience: 'all' as const }
    expect(await new DaliliClient('').createNote(input)).toEqual({ id: 'n1' })
    expect([calls[0]!.url, calls[0]!.init.method]).toEqual(['/api/notes', 'POST'])
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual(input)
    stubFetch(200, JSON.stringify({ id: 'n1' }))
    await new DaliliClient('').updateNote('n1', { body: 'جملة جديدة', audience: 'listed', companyIds: ['co1'] })
    expect([calls[1]!.url, calls[1]!.init.method]).toEqual(['/api/notes/n1', 'PATCH'])
    expect(JSON.parse(calls[1]!.init.body as string)).toEqual({ body: 'جملة جديدة', audience: 'listed', companyIds: ['co1'] })
  })
})
