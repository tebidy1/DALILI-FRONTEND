import { DaliliClient, type GuideDto } from '@dalili/shared'
import { TRAIN_KEY, TRAIN_STATS_KEY, type TrainAck, type TrainResult, type TrainSession, type TrainStats } from './protocol'
import { advanceTrain, buildTrainPlan, bumpTrainStats, retryUntil } from './train'
import { API_BASE } from './config'

/** جلسة «دربني» في الخلفية — الخلفية مصدر الحقيقة للفهرس الجاري:
 *  تفتح تبويب الشاشة الهدف، تنقّل بين الخطوات، وتسلم الخطوة الحالية لسكربت المحتوى.
 *  كل المنطق القراري النقي في lib/train.ts؛ هنا chrome.* فقط. */

let session: TrainSession | null = null
let trainReady: Promise<void> | null = null
/** رابط قيد التنقل — onUpdated(complete) يسلّم الخطوة عندها لا قبله */
let pendingNavigate = false

export function trainLoaded(): Promise<void> {
  if (!trainReady) trainReady = load()
  return trainReady
}

async function load(): Promise<void> {
  const got = (await chrome.storage.local.get(TRAIN_KEY))[TRAIN_KEY] as TrainSession | undefined
  session = got ?? null
}

async function persist(): Promise<void> {
  if (session) await chrome.storage.local.set({ [TRAIN_KEY]: session })
  else await chrome.storage.local.remove(TRAIN_KEY)
}

/** بدء تدريب: من العارض برمز عام (جلب من الخادم) أو من المحرر بالدليل الحالي نفسه — تجربة بلا مشاركة */
export async function startTraining(source: { token?: string; guide?: GuideDto }): Promise<TrainAck> {
  if (session) await endTraining('replaced')
  let guide: GuideDto | null = null
  if (source.guide) guide = source.guide
  else if (source.token) {
    try {
      guide = (await new DaliliClient(API_BASE).publicGuide(source.token)).guide
    } catch {
      return { ok: false, errorAr: 'تعذر جلب الدليل من الخادم — تأكد أن الخادم يعمل ثم أعد المحاولة' }
    }
  }
  if (!guide) return { ok: false, errorAr: 'تعذر بدء التدريب — لا رمز مشاركة ولا دليل' }
  const steps = buildTrainPlan(guide)
  if (steps.length === 0) {
    return { ok: false, errorAr: 'هذا الدليل أُنشئ قبل خاصية التدريب — أعد التقاطه بالإصدار الجديد ليعمل «دربني»' }
  }
  const tab = await chrome.tabs.create({ url: steps[0]!.url, active: true })
  session = {
    token: source.token,
    guideId: guide.id,
    guideTitle: guide.title,
    steps,
    idx: 0,
    tabId: tab.id ?? null,
    startedAt: Date.now(),
  }
  await persist()
  return { ok: true }
}

/** تقدّم من تبويب التدريب فقط — رسائل التبويبات الأخرى لا تمس الجلسة */
export async function onTrainProgress(result: TrainResult, senderTabId?: number): Promise<void> {
  if (!session) return
  if (senderTabId !== undefined && session.tabId !== null && senderTabId !== session.tabId) return
  const adv = advanceTrain(session, result)
  if (adv.finished) {
    await recordStats(session.guideId, adv.completed)
    await endTraining(adv.completed ? 'finished' : 'stopped')
    return
  }
  session = adv.session
  await persist()
  await deliverCurrentStep()
}

/** تسليم الخطوة الحالية: نفس الرابط مباشرة، ورابط مختلف تنقّل ثم تسليم عند اكتمال التحميل */
async function deliverCurrentStep(): Promise<void> {
  const s = session
  if (!s || s.tabId === null) return
  const step = s.steps[s.idx]
  if (!step) return
  const tab = await chrome.tabs.get(s.tabId).catch(() => null)
  if (!tab) {
    await endTraining('gone')
    return
  }
  if (tab.url !== step.url) {
    pendingNavigate = true
    await chrome.tabs.update(s.tabId, { url: step.url }).catch(() => {})
    return
  }
  await sendStep()
}

async function sendStep(): Promise<void> {
  const s = session
  if (!s || s.tabId === null) return
  const step = s.steps[s.idx]
  if (!step) return
  // RC3: «اكتمال التحميل» قد يسبق جهوزية سكربت المحتوى فتُرفض الرسالة الأولى —
  // إعادة قصيرة محدودة بدل ضياع الخطوة صامتًا. تحرّكت الجلسة؟ لا تسليم متأخرًا.
  await retryUntil(
    () => chrome.tabs.sendMessage(s.tabId!, { t: 'train-step', step, idx: s.idx, total: s.steps.length, guideTitle: s.guideTitle }),
    {
      attempts: 8,
      intervalMs: 350,
      shouldStop: () => session !== s || session.idx !== s.idx,
    },
  )
}

/** اكتمال تحميل تبويب التدريب بعد تنقّل — الآن تُسلَّم الخطوة المنتظرة */
export async function onTabUpdated(tabId: number, status: string): Promise<void> {
  if (!session || session.tabId !== tabId || status !== 'complete') return
  if (pendingNavigate) {
    pendingNavigate = false
    await sendStep()
    return
  }
  // أول تحميل للتبويب المفتوح من دربني — تسليم الخطوة الأولى
  await sendStep()
}

export async function endTraining(reason: 'finished' | 'replaced' | 'stopped' | 'gone'): Promise<void> {
  const s = session
  session = null
  pendingNavigate = false
  await persist()
  if (s?.tabId != null) {
    await chrome.tabs.sendMessage(s.tabId, { t: 'train-stop', reason }).catch(() => {})
  }
}

/** GM-03: تقدّم مجمّع لكل دليل — أرقام بلا هويات */
async function recordStats(guideId: string, completed: boolean): Promise<void> {
  const all = (await chrome.storage.local.get(TRAIN_STATS_KEY))[TRAIN_STATS_KEY] as Record<string, TrainStats> | undefined
  const next = { ...(all ?? {}), [guideId]: bumpTrainStats(all?.[guideId], completed) }
  await chrome.storage.local.set({ [TRAIN_STATS_KEY]: next })
}
