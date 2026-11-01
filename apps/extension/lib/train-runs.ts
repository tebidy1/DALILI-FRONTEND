import { DaliliClient } from '@dalili/shared'
import { TRAIN_RUNS_MAX, TRAIN_RUNS_PENDING_KEY, type PendingTrainRun } from './protocol'
import { API_BASE } from './config'

/**
 * ث٢ (§٥.٥، §٧ الحالة ٧): طابور التدريبات المنتهية يصل إلى الخادم.
 * الموظف المسجّل يُرسل عبر الدليل فتُعرف شركته، ورمز المشاركة احتياط حين لا يُرى الدليل بالجلسة.
 * الفشل لا يظهر للموظف أبداً: الشبكة و5xx و429 تُبقي التشغيل لمحاولة لاحقة، و4xx نهائي يُسقطه.
 * كل تعديل للطابور يمرّ بسلسلة واحدة — قراءة ثم كتابة متداخلتان كانتا ستضيّعان تشغيلاً أو معرّفه.
 */

type Sender = Pick<DaliliClient, 'sendTrainRun' | 'sendSharedTrainRun'>

let chain: Promise<unknown> = Promise.resolve()
function mutate<T>(fn: (q: PendingTrainRun[]) => { next: PendingTrainRun[]; out: T }): Promise<T> {
  const step = chain.then(async () => {
    const q = ((await chrome.storage.local.get(TRAIN_RUNS_PENDING_KEY))[TRAIN_RUNS_PENDING_KEY] as PendingTrainRun[] | undefined) ?? []
    const { next, out } = fn(q)
    if (next !== q) await chrome.storage.local.set({ [TRAIN_RUNS_PENDING_KEY]: next })
    return out
  })
  chain = step.catch(() => {})
  return step
}

/** المعرّف يولد مع التشغيل ويبقى ثابتاً عبر المحاولات: الخادم يتجاهل الإعادة */
const withId = (r: PendingTrainRun): PendingTrainRun => (r.runId ? r : { ...r, runId: crypto.randomUUID() })

export function appendTrainRun(run: PendingTrainRun): Promise<void> {
  return mutate((q) => ({ next: [...q, withId(run)].slice(-TRAIN_RUNS_MAX), out: undefined }))
}

let flushing: Promise<void> | null = null
let again = false

/** تفريغ واحد في كل لحظة؛ استدعاء أثناءه يطلب دورة أخرى فلا يتأخر تشغيل أُلحق للتو */
export function flushTrainRuns(client: Sender = new DaliliClient(API_BASE)): Promise<void> {
  if (flushing) {
    again = true
    return flushing
  }
  flushing = (async () => {
    do {
      again = false
      await drain(client)
    } while (again)
  })().finally(() => {
    flushing = null
  })
  return flushing
}

async function drain(client: Sender): Promise<void> {
  const runs = await mutate((q) => {
    const next = q.some((r) => !r.runId) ? q.map(withId) : q
    return { next, out: next }
  })
  const done = new Set<string>()
  for (const r of runs) if ((await deliver(client, r)) === 'done') done.add(r.runId!)
  if (done.size) await mutate((q) => ({ next: q.filter((r) => !done.has(r.runId!)), out: undefined }))
}

/** حالة DaliliApiError بشكلها لا بصنفها — نسخة ثانية من الحزمة تكسر instanceof؛ غيرها (إلغاء، خلل) = شبكة */
const statusOf = (e: unknown) => (typeof (e as { status?: unknown } | null)?.status === 'number' ? (e as { status: number }).status : 0)
/** الشبكة وانشغال الخادم والحدّ مؤقتة؛ غيرها لن ينجح يوماً */
const verdict = (status: number): 'done' | 'keep' => (status === 0 || status === 429 || status >= 500 ? 'keep' : 'done')

async function deliver(client: Sender, r: PendingTrainRun): Promise<'done' | 'keep'> {
  const body = { runId: r.runId!, steps: r.steps }
  try {
    await client.sendTrainRun(r.guideId, body)
    return 'done'
  } catch (e) {
    const status = statusOf(e)
    if (r.token && (status === 401 || status === 403 || status === 404)) {
      try {
        await client.sendSharedTrainRun(r.token, body)
        return 'done'
      } catch (e2) {
        return verdict(statusOf(e2))
      }
    }
    // خرج الموظف ولا رمز: يُرسل بعد دخوله
    if (status === 401) return 'keep'
    return verdict(status)
  }
}
