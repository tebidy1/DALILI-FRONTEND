import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DaliliApiError, type TrainRunBody } from '@dalili/shared'
import type { PendingTrainRun } from './protocol'

// ث٢: طابور التدريبات المنتهية يصل إلى الخادم — المصادَق أولاً لتُعرف الشركة، ورمز المشاركة احتياط.
// الفشل لا يظهر للموظف: الشبكة و5xx و429 تُبقي التشغيل، و4xx نهائي يُسقطه

let store: Record<string, unknown>
beforeEach(() => {
  vi.resetModules()
  store = {}
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn(async (k: string) => (k in store ? { [k]: structuredClone(store[k]) } : {})),
        set: vi.fn(async (o: Record<string, unknown>) => void Object.assign(store, structuredClone(o))),
      },
    },
  })
})

const steps = [{ stepId: 's1', outcome: 'missing' as const, confidence: null }]
const queued = () => (store.trainRunsPending as PendingTrainRun[] | undefined) ?? []
const fail = (status: number) => () => Promise.reject(new DaliliApiError(status, 'x'))
const ok = () => Promise.resolve()
function client(authed: () => Promise<void>, shared: () => Promise<void> = ok) {
  return { sendTrainRun: vi.fn((_id: string, _body: TrainRunBody) => authed()), sendSharedTrainRun: vi.fn((_token: string, _body: TrainRunBody) => shared()) }
}

describe('flushTrainRuns', () => {
  it('يرسل عبر الدليل أولاً ويُسقط التشغيل عند النجاح', async () => {
    const { appendTrainRun, flushTrainRuns } = await import('./train-runs')
    await appendTrainRun({ guideId: 'g1', token: 'tok', steps })
    const c = client(ok)
    await flushTrainRuns(c)
    expect(c.sendTrainRun).toHaveBeenCalledWith('g1', { runId: expect.any(String), steps })
    expect(c.sendSharedTrainRun).not.toHaveBeenCalled()
    expect(queued()).toEqual([])
  })

  it.each([401, 403, 404])('يعود إلى رمز المشاركة عند %i', async (status) => {
    const { appendTrainRun, flushTrainRuns } = await import('./train-runs')
    await appendTrainRun({ guideId: 'g1', token: 'tok', steps })
    const c = client(fail(status))
    await flushTrainRuns(c)
    const body = c.sendTrainRun.mock.calls[0]![1]
    expect(c.sendSharedTrainRun).toHaveBeenCalledWith('tok', body)
    expect(queued()).toEqual([])
  })

  it.each([0, 500, 503, 429])('يُبقي التشغيل عند %i', async (status) => {
    const { appendTrainRun, flushTrainRuns } = await import('./train-runs')
    await appendTrainRun({ guideId: 'g1', steps })
    await flushTrainRuns(client(fail(status)))
    expect(queued()).toHaveLength(1)
  })

  it('يُبقيه إن فشل الرمز أيضاً بالشبكة', async () => {
    const { appendTrainRun, flushTrainRuns } = await import('./train-runs')
    await appendTrainRun({ guideId: 'g1', token: 'tok', steps })
    await flushTrainRuns(client(fail(401), fail(0)))
    expect(queued()).toHaveLength(1)
  })

  it('يُسقط التشغيل عند 4xx نهائي (400، و404 على المسارين)', async () => {
    const { appendTrainRun, flushTrainRuns } = await import('./train-runs')
    await appendTrainRun({ guideId: 'g1', steps })
    await flushTrainRuns(client(fail(400)))
    expect(queued()).toEqual([])
    await appendTrainRun({ guideId: 'g2', token: 'tok', steps })
    await flushTrainRuns(client(fail(404), fail(404)))
    expect(queued()).toEqual([])
  })

  it('401 بلا رمز يُبقيه — الموظف خرج، يُرسل بعد دخوله', async () => {
    const { appendTrainRun, flushTrainRuns } = await import('./train-runs')
    await appendTrainRun({ guideId: 'g1', steps })
    const c = client(fail(401))
    await flushTrainRuns(c)
    expect(c.sendSharedTrainRun).not.toHaveBeenCalled()
    expect(queued()).toHaveLength(1)
  })

  it('طابور ث١ القديم بلا runId يُعطى معرّفاً ويُحفظ قبل الإرسال', async () => {
    store.trainRunsPending = [{ guideId: 'old', steps }]
    const { flushTrainRuns } = await import('./train-runs')
    let savedFirst: PendingTrainRun[] = []
    const c = client(async () => void (savedFirst = queued()))
    await flushTrainRuns(c)
    const sentId = c.sendTrainRun.mock.calls[0]![1].runId
    expect(sentId).toMatch(/^[A-Za-z0-9_-]{8,40}$/)
    expect(savedFirst[0]!.runId).toBe(sentId)
  })

  it('المعرّف ثابت عبر المحاولات: الإعادة تحمل المعرّف نفسه', async () => {
    const { appendTrainRun, flushTrainRuns } = await import('./train-runs')
    await appendTrainRun({ guideId: 'g1', steps })
    const c = client(fail(0))
    await flushTrainRuns(c)
    await flushTrainRuns(c)
    expect(c.sendTrainRun.mock.calls[0]![1].runId).toBe(c.sendTrainRun.mock.calls[1]![1].runId)
  })

  it('تشغيل يُلحق أثناء الإرسال لا يضيع ويُرسل في الدورة نفسها', async () => {
    const { appendTrainRun, flushTrainRuns } = await import('./train-runs')
    await appendTrainRun({ guideId: 'g1', steps })
    let added = false
    const c = client(async () => {
      if (!added) {
        added = true
        await appendTrainRun({ guideId: 'g2', steps })
        void flushTrainRuns(c)
      }
    })
    await flushTrainRuns(c)
    expect(c.sendTrainRun.mock.calls.map((x) => x[0])).toEqual(['g1', 'g2'])
    expect(queued()).toEqual([])
  })

  it('استدعاءان متزامنان يرسلان مرة واحدة', async () => {
    const { appendTrainRun, flushTrainRuns } = await import('./train-runs')
    await appendTrainRun({ guideId: 'g1', steps })
    const c = client(ok)
    await Promise.all([flushTrainRuns(c), flushTrainRuns(c)])
    expect(c.sendTrainRun).toHaveBeenCalledTimes(1)
  })

  it('الطابور محدود: الأقدم يسقط بعد TRAIN_RUNS_MAX', async () => {
    const { appendTrainRun } = await import('./train-runs')
    const { TRAIN_RUNS_MAX } = await import('./protocol')
    for (let i = 0; i <= TRAIN_RUNS_MAX; i++) await appendTrainRun({ guideId: `g${i}`, steps })
    expect(queued()).toHaveLength(TRAIN_RUNS_MAX)
    expect(queued()[0]!.guideId).toBe('g1')
  })
})
