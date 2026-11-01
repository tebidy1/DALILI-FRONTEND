import { DaliliClient, type GuideDto, type TrainHostsDto } from '@dalili/shared'
import { TRAIN_KEY, TRAIN_STATS_KEY, type TrainAck, type TrainOutcome, type TrainResult, type TrainSession, type TrainStats } from './protocol'
import type { AnchorConfidence } from '@dalili/core'
import { advanceTrain, buildTrainPlan, bumpTrainStats, onTargetScreen, pickTrainHost, recordOutcome, rehostPlan, retryUntil } from './train'
import { t } from './i18n'
import { API_BASE } from './config'
import { appendTrainRun, flushTrainRuns } from './train-runs'

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
export async function startTraining(source: { token?: string; guide?: GuideDto; trial?: boolean; hosts?: TrainHostsDto }): Promise<TrainAck> {
  if (session) await endTraining('replaced')
  let guide: GuideDto | null = null
  if (source.guide) guide = source.guide
  else if (source.token) {
    try {
      guide = (await new DaliliClient(API_BASE).publicGuide(source.token)).guide
    } catch {
      return { ok: false, errorAr: t('ext.trainFetchFail') }
    }
  }
  if (!guide) return { ok: false, errorAr: t('ext.trainNoSource') }
  let steps = buildTrainPlan(guide)
  if (steps.length === 0) {
    return { ok: false, errorAr: t('ext.trainTooOld') }
  }
  // ث٣ (§٥.٧): دليل الشريك سُجّل على نسخته — يُفتح على نسخة شركة الموظف، أو يطلب منه فتحها
  if (source.hosts) {
    const origin = pickTrainHost(source.hosts, await openTabUrls())
    if (!origin) return { ok: false, errorAr: t('ext.trainOpenSystem') }
    steps = rehostPlan(steps, source.hosts.from, origin)
  }
  // بلاغ المالك 2026-10-31: تبويب جديد دائمًا على رابط الدليل نفسه — إعادة استعمال تبويب «يشبه» الشاشة
  // درّبت على سجل آخر (الأرقام رموز متغيّرة فبدا /3 و/new شاشة واحدة). الدخول يُدار ببوّابة المرساة داخل الصفحة.
  const tab = await chrome.tabs.create({ url: steps[0]!.url, active: true })
  const tabId = tab.id ?? null
  session = {
    token: source.token,
    trial: source.trial || undefined,
    guideId: guide.id,
    guideTitle: guide.title,
    steps,
    idx: 0,
    tabId,
    startedAt: Date.now(),
  }
  await persist()
  return { ok: true }
}

/**
 * ث١: نتيجة خطوة من تبويب التدريب. تصل قبل train-progress للخطوة نفسها: كلا المعالجَين ينتظران
 * الوعدين المحسومين نفسيهما ثم يعدّلان الجلسة تزامنيًا — فالترتيب FIFO يبقيها في موضعها.
 */
export async function onTrainOutcome(msg: { idx: number; outcome: TrainOutcome; confidence: AnchorConfidence | null }, senderTabId?: number): Promise<void> {
  if (!session) return
  if (senderTabId !== undefined && session.tabId !== null && senderTabId !== session.tabId) return
  session = recordOutcome(session, msg)
  await persist()
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

/** تسليم الخطوة الحالية: نفس الشاشة مباشرة، وشاشة أخرى تنقّل ثم تسليم عند اكتمال التحميل */
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
  // بلاغ المالك 2026-10-31: مقارنة الشاشة لا الرابط حرفيًا — رقم السجل يتغيّر بعد الحفظ (/new ← /12)
  // والانتقال حينها يضيّع نموذج الموظف. ننتقل فقط حين تكون الخطوة على شاشة أخرى فعلًا.
  if (!onTargetScreen(tab.url, step.url)) {
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

/** روابط التبويبات المفتوحة، الأحدث وصولاً أولاً — تبويب الموظف على نظامه يحسم أي نسخة */
async function openTabUrls(): Promise<string[]> {
  const all = await chrome.tabs.query({})
  return all
    .slice()
    .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))
    .flatMap((tab) => (tab.url ? [tab.url] : []))
}

export async function endTraining(reason: 'finished' | 'replaced' | 'stopped' | 'gone'): Promise<void> {
  const s = session
  session = null
  pendingNavigate = false
  await persist()
  // ث١: الاستبدال تدريبٌ لم ينتهِ — لا يُحسب، ولا تجربة المؤلف (ث٢)؛ غيرهما يُلحق بالطابور إن حمل نتيجة واحدة على الأقل
  if (s && reason !== 'replaced' && !s.trial) await enqueueRun(s)
  if (s?.tabId != null) {
    await chrome.tabs.sendMessage(s.tabId, { t: 'train-stop', reason }).catch(() => {})
  }
}

/** ث١: طابور محلي بلا هوية الموظف (الدليل والخطوات فقط)؛ ث٢ يرسله فوراً، والفشل يبقى لمحاولة لاحقة */
async function enqueueRun(s: TrainSession): Promise<void> {
  const steps = (s.outcomes ?? []).filter((o): o is NonNullable<typeof o> => !!o)
  if (steps.length === 0) return
  await appendTrainRun({ guideId: s.guideId, token: s.token, steps })
  void flushTrainRuns()
}

/** GM-03: تقدّم مجمّع لكل دليل — أرقام بلا هويات */
async function recordStats(guideId: string, completed: boolean): Promise<void> {
  const all = (await chrome.storage.local.get(TRAIN_STATS_KEY))[TRAIN_STATS_KEY] as Record<string, TrainStats> | undefined
  const next = { ...(all ?? {}), [guideId]: bumpTrainStats(all?.[guideId], completed) }
  await chrome.storage.local.set({ [TRAIN_STATS_KEY]: next })
}
