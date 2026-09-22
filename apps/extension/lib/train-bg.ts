import { DaliliClient, type GuideDto } from '@dalili/shared'
import { TRAIN_KEY, TRAIN_STATS_KEY, type TrainAck, type TrainResult, type TrainSession, type TrainStats } from './protocol'
import { advanceTrain, buildTrainPlan, bumpTrainStats, pickTrainTab, retryUntil } from './train'
import { t } from './i18n'
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
      return { ok: false, errorAr: t('ext.trainFetchFail') }
    }
  }
  if (!guide) return { ok: false, errorAr: t('ext.trainNoSource') }
  const steps = buildTrainPlan(guide)
  if (steps.length === 0) {
    return { ok: false, errorAr: t('ext.trainTooOld') }
  }
  // LX-01: التدريب فوق الصفحة المفتوحة — نبحث كل التبويبات (لا النشط وحده، فالإطلاق من صفحة
  // دليلي لا من التطبيق الهدف). الجهوزية الفعلية والدخول يُدارَان ببوّابة المرساة داخل الصفحة.
  const firstUrl = steps[0]!.url
  const tabs = await chrome.tabs.query({}).catch(() => [] as chrome.tabs.Tab[])
  const choice = pickTrainTab(tabs.map((t) => ({ id: t.id, url: t.url })), firstUrl)
  let tabId: number | null
  if (choice.mode === 'open-new' || choice.tabId == null) {
    const tab = await chrome.tabs.create({ url: firstUrl, active: true })
    tabId = tab.id ?? null
  } else {
    tabId = choice.tabId
    if (choice.mode === 'reuse-navigate') {
      // نفس الجلسة الحيّة — ننقّل نفس التبويب للهدف؛ onTabUpdated يسلّم عند اكتمال التحميل
      pendingNavigate = true
      await chrome.tabs.update(tabId, { url: firstUrl, active: true }).catch(() => {})
    } else {
      // reuse-here: التبويب محمّل أصلًا على الشاشة — نفعّله فقط ونسلّم الخطوة بأنفسنا لاحقًا
      await chrome.tabs.update(tabId, { active: true }).catch(() => {})
    }
    // التبويب الهدف قد يكون في نافذة أخرى — نُبرزها بلطف (أفضل جهد)
    await focusTabWindow(tabId)
  }
  session = {
    token: source.token,
    guideId: guide.id,
    guideTitle: guide.title,
    steps,
    idx: 0,
    tabId,
    startedAt: Date.now(),
  }
  await persist()
  // reuse-here لا ينتظر onTabUpdated — سلّم الخطوة الأولى فورًا (سكربت المحتوى مُحقَن أصلًا)
  if (choice.mode === 'reuse-here' && tabId != null) await sendStep()
  return { ok: true }
}

/** إبراز نافذة تبويب معاد استخدامه — أفضل جهد، لا يرمي إن غاب التبويب/النافذة */
async function focusTabWindow(tabId: number): Promise<void> {
  const tab = await chrome.tabs.get(tabId).catch(() => null)
  if (tab?.windowId != null) await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {})
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
