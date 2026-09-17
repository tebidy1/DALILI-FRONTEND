import { defineBackground } from 'wxt/utils/define-background'
import { AUTH_PING_KEY, type BgMsg, type MemoToggleAck } from '@/lib/protocol'
import { createSessionStore } from '@/lib/session-store'
import { createCaptureFlow } from '@/lib/capture-flow'
import { createFinish } from '@/lib/finish-publish'
import { makeVoiceMemo } from '@/lib/voice-memo'
import { createAutoMemo } from '@/lib/auto-memo'
import { makeContentInjector } from '@/lib/content-inject'
import { ensureOffscreenDocument } from '@/lib/offscreen'
import { createActivity } from '@/lib/activity'
import { WEB_BASE } from '@/lib/config'
import { startTraining, onTrainProgress, onTabUpdated, trainLoaded } from '@/lib/train-bg'

/**
 * منسّق الخلفية — المنطق موزّع على مكتبات نقية (قانون الحجم ٤٠٠):
 * session-store (الحالة والبثّ) · capture-flow (خط الالتقاط) · voice-memo
 * (VOX-09 تعليق البطاقة) · auto-memo (VOX-AUTO التعليق التلقائي لكل بطاقة)
 * · finish-publish (الإنهاء).
 */

const store = createSessionStore()

/** زر الجرس (2026-09-10): سجل الانتباه — ما كان لافتة عابرة يُحفظ حدثًا تقرؤه اللوحة */
const activity = createActivity({
  get: (k) => chrome.storage.local.get(k),
  set: (o) => chrome.storage.local.set(o),
})

/** VOX-09: آلة حالة تعليق البطاقة — تخزين محلي pending وسقف ستون ثانية */
const voiceMemo = makeVoiceMemo({
  messageOffscreen: (msg) => chrome.runtime.sendMessage(msg).catch(() => null),
  store: {
    get: (keys) => chrome.storage.local.get(keys),
    getAll: () => chrome.storage.local.get(null),
    set: (obj) => chrome.storage.local.set(obj),
    remove: (keys) => chrome.storage.local.remove(keys),
  },
  onCapResult: (r) => {
    // بلوغ الستين ثانية: نجاحاً أوقفنا وإخفاقاً (تسجيل صامت) نصّدق بالرسالة — ومؤشر اللوحة يُطفأ في الحالين
    void store.save(r.ok ? { notice: 'بلغ التعليق حده ٦٠ ثانية — أُوقف', memoLive: undefined } : { notice: r.errorAr ?? 'فشل تسجيل التعليق', memoLive: undefined })
  },
  setCapTimer: (fn, ms) => setTimeout(fn, ms),
  clearCapTimer: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
})

/** VOX-09: ربط/فك حالة التعليق الجارية ببث الحالة — اللوحة ترى الحلقة والمؤقت منها */
async function attachMemoToMeta(): Promise<void> {
  const active = voiceMemo.activeMemo()
  await store.save(active ? { memoLive: { stepIndex: active.stepIndex, startedAt: active.startedAt } } : { memoLive: undefined })
}

/** VOX-AUTO: سياسة التعليق التلقائي لكل بطاقة فوق آلة voice-memo نفسها */
const autoMemoCtl = createAutoMemo({
  memo: voiceMemo,
  meta: store.get,
  saveMeta: store.save,
  syncMeta: attachMemoToMeta,
  prepare: ensureOffscreenDocument,
})

/** الحقن عند الطلب (2026-09-14): تفعيل التبويبات اليتيمة بلا F5 — lib/content-inject */
const contentInjector = makeContentInjector({
  executeScript: (details) => chrome.scripting.executeScript(details),
})

/** VOX-09: زر الميك في اللوحة (الوضع العادي) — جارٍ يوقف، وإلا يبدأ على آخر خطوة ملتقطة */
async function memoToggle(): Promise<MemoToggleAck> {
  const meta = store.get()
  if (meta.state !== 'capturing' && meta.state !== 'paused') return { ok: false, errorAr: 'لا جلسة التقاط جارية' }
  if (voiceMemo.activeMemo()) {
    const r = await voiceMemo.stopMemo('user')
    await attachMemoToMeta()
    if (!r.ok) return { ok: false, errorAr: r.errorAr }
    return { ok: true, stopped: true, stepIndex: r.stepIndex }
  }
  if (meta.stepCount === 0) return { ok: false, errorAr: 'التقط خطوة أولًا ثم علّق عليها بصوتك' }
  await ensureOffscreenDocument()
  const start = await voiceMemo.startMemo(meta.sessionId, meta.stepCount - 1)
  if (!start.ok) return start
  await attachMemoToMeta()
  return { ok: true, stopped: false }
}

/** التبويب الأصلي الذي نعيد التركيز إليه بعد صفحة الإذن — يديره الخلفية */
let micReturnTabId: number | null = null

/** VOX-AUTO: زر «ابدأ مع تعليق صوتي» — صفحة الإذن الظاهرة، والقرار يعود منها برسالة */
async function requestMicThenStart(): Promise<void> {
  const meta = store.get()
  if (meta.state === 'capturing' || meta.state === 'paused') return
  if (meta.state === 'draft') return
  const active = await store.activeTab()
  if (active?.id !== undefined) micReturnTabId = active.id
  await chrome.tabs.create({ url: chrome.runtime.getURL('mic-permission.html') })
}

/** VOX-09: إذن طُلب لأجل تعليق خطوة يدوي أثناء جلسة جارية */
async function requestMicThenMemo(): Promise<void> {
  const active = await store.activeTab()
  if (active?.id !== undefined) micReturnTabId = active.id
  await chrome.tabs.create({ url: chrome.runtime.getURL('mic-permission.html?flow=memo') })
}

/** نتيجة صفحة الإذن: بلا flow مسار التعليق التلقائي، وflow=memo تعليق يدوي جارٍ */
async function onMicResult(granted: boolean, senderTabId?: number, flow?: 'memo'): Promise<void> {
  if (flow === 'memo') {
    const meta = store.get()
    if (!granted) {
      await store.save({ notice: 'لا صوت — الالتقاط مستمر بلا تعليق' })
    } else if (meta.stepCount > 0 && (meta.state === 'capturing' || meta.state === 'paused')) {
      await ensureOffscreenDocument()
      const start = await voiceMemo.startMemo(meta.sessionId, meta.stepCount - 1)
      if (start.ok) await attachMemoToMeta()
      else await store.save({ notice: start.errorAr })
    } else {
      await store.save({ notice: 'التقط خطوة أولًا ثم علّق عليها بصوتك' })
    }
  } else {
    await startCapture()
    if (granted) {
      // VOX-AUTO: جلسة تبدأ والتعليق التلقائي معلَّم — أول بطاقة يبدأ عليها التسجيل فور ولادتها
      await store.save({ autoMemo: true })
      await ensureOffscreenDocument()
    } else {
      await store.save({ notice: 'لا صوت — الالتقاط مستمر بلا تعليق' })
    }
  }
  await returnFocusAndClose(senderTabId)
}

/** إعادة التركيز للتبويب الأصلي وإغلاق صفحة الإذن — ذيل مشترك لمساري الإذن */
async function returnFocusAndClose(senderTabId?: number): Promise<void> {
  if (micReturnTabId !== null) {
    await chrome.tabs.update(micReturnTabId, { active: true }).catch(() => {})
    const win = (await chrome.tabs.get(micReturnTabId).catch(() => null))?.windowId
    if (win !== undefined) await chrome.windows.update(win, { focused: true }).catch(() => {})
  }
  if (senderTabId !== undefined) await chrome.tabs.remove(senderTabId).catch(() => {})
}

/** بدء جلسة التقاط جديدة */
async function startCapture() {
  const meta = store.get()
  if (meta.state === 'capturing' || meta.state === 'paused') return
  if (meta.state === 'draft') return // مسودة قائمة — انشرها أو ألغها أولًا من النافذة
  flow.resetPreShots() // CAP-STABLE: لا تُورَّث لقطة ضغطٍ من جلسة سابقة
  await store.save({
    state: 'capturing',
    sessionId: crypto.randomUUID().replace(/-/g, '').slice(0, 10),
    startedAt: Date.now(),
    stepCount: 0,
    limited: false,
    draftReason: undefined,
    notice: undefined,
    autoMemo: false,
    memoLive: undefined,
    lastPublished: undefined, // المرحلة ٣: جلسة جديدة تمحو بطاقة النجاح السابقة
  })
  // فخ التبويب اليتيم (2026-09-14): الصفحات المفتوحة قبل تحميل الامتداد بلا سكربت معلن
  // — بدل طلب F5 يُزرع الملف المبني نفسه برمجيًا فيبدأ الالتقاط فورًا؛ السكربت المزرَع
  // يطلب whoami لحظة دخوله فيتلقى حالة الجلسة القائمة بنفسه. البثّ دائمًا وفي كل
  // المسارات — بدء الصوت يجري والتبويب النشط صفحة الإذن، فحصر البثّ آنذاك كان يترك
  // مسارَي الالتقاط (عادي/صوتي) مختلفين.
  const live = await store.broadcast()
  const active = await store.activeTab()
  if (active?.id !== undefined && active.url?.startsWith('http') && !live.has(active.id)) {
    const injected = await contentInjector.inject(active.id)
    if (!injected) {
      // كروم يمنع التحقين في صفحاته المحمية (متجر كروم وعضله) — الف5 لا يصلحها أيضًا، نعلن بصدق
      await store.save({ notice: 'الالتقاط غير متاح في هذا التبويب — كروم يمنع الإضافات من التفعيل داخل صفحاته المحمية' })
      await activity.push('tab', 'تبويب محمي يمنع المتصفح التفعيل فيه — الالتقاط غير متاح عنده').catch(() => {})
    }
  }
}

const flow = createCaptureFlow({
  meta: store.get,
  saveMeta: store.save,
  saveSilently: store.saveSilently,
  readStep: store.readStep,
  writeStep: store.writeStep,
  patchStep: store.patchStep,
  renumberMemos: (sid, idx, count) => voiceMemo.renumberMemos(sid, idx, count),
  onNewStep: (sid, idx) => autoMemoCtl.onNewStep(sid, idx),
  onLimitReached: () => activity.push('limit', 'بلغت حدّ ٢٠٠ خطوة — توقّف التوثيق، أنهِ الجلسة وانشرها').then(() => undefined).catch(() => {}),
})

/** زر/اختصار التبديل — جلسة قائمة تُنهى، وإلا تبدأ (مصدر واحد للوحة واختصار لوحة المفاتيح) */
function toggleCapture(): void {
  if (store.get().state === 'capturing' || store.get().state === 'paused') void finish.finishCapture()
  else void startCapture()
}

const finish = createFinish({
  meta: store.get,
  saveMeta: store.save,
  /** VOX-AUTO: إنهاء يوقف التعليق الجاري ويحفظه — فشلُ حفظه لا يسقط النشر أبدًا */
  stopActiveMemo: () => autoMemoCtl.stopForFinish(),
  abortMemos: async (sid) => {
    if (voiceMemo.activeMemo()) await voiceMemo.stopMemo('user').catch(() => undefined)
    await voiceMemo.purgeMemos(sid)
  },
  pushEvent: (kind, textAr, href) => activity.push(kind, textAr, href),
})

export default defineBackground(() => {
  // نقرة أيقونة الامتداد تفتح اللوحة الجانبية (لا بوب-اب) — كسكرايب/تانجو تمامًا.
  chrome.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {})

  // السباق القاتل في MV3: الرسالة توقظ العامل قبل اكتمال قراءة الحالة من التخزين،
  // فيرى «idle» الكاذبة ويرمي الأحداث بصمت. الحل: كل مستقبل ينتظر الجاهزية،
  // وبعد الإقلاع نعيد بث الحالة لكل التبويبات لتصحيح من قيل له «idle» خطأً أثناء موت العامل.
  const metaReady = store.load()
  const trainReady = trainLoaded()

  void metaReady.then((meta) => {
    if (meta.state === 'saving') {
      // نشر انقطع في منتصفه — مسودة تُعاد محاولتها من النافذة
      void store.save({ state: 'draft', draftReason: 'انقطع النشر — أعد المحاولة من النافذة' })
    } else if (meta.state === 'capturing' || meta.state === 'paused') {
      void store.broadcast()
    }
  })

  chrome.runtime.onMessage.addListener((msg: BgMsg, sender, sendResponse) => {
    const expectsResponse =
      msg.t === 'whoami' || msg.t === 'train-start' || msg.t === 'memo-toggle' || msg.t === 'auto-memo-toggle'
    void (async () => {
      await Promise.all([metaReady, trainReady])
      if (msg.t === 'whoami') {
        sendResponse({ meta: store.get() })
        return
      }
      switch (msg.t) {
        case 'capture-event':
          void flow.handleCaptureEvent(msg.ev, sender.tab)
          break
        case 'pre-shot':
          // CAP-STABLE: التقاط مسبق لحظة الضغط قبل التنقّل — لا يُنشئ خطوة
          void flow.handlePreShot(msg.pre, sender.tab)
          break
        case 'start':
          void startCapture()
          break
        case 'start-with-audio':
          // VOX-AUTO: صفحة الإذن ثم جلسة بتعليق تلقائي على كل بطاقة
          void requestMicThenStart()
          break
        case 'mic-result':
          void onMicResult(msg.granted, sender.tab?.id, msg.flow)
          break
        case 'memo-toggle':
          // VOX-09: زر الميك في الوضع العادي — تسجيل جارٍ يوقف، وإلا يبدأ على آخر خطوة
          sendResponse(await memoToggle())
          break
        case 'auto-memo-toggle':
          // VOX-AUTO: زر الميك في الوضع التلقائي — إيقاف/تشغيل التعليق التلقائي كله
          sendResponse(await autoMemoCtl.toggle())
          break
        case 'memo-request':
          // VOX-09: الميكروفون غير ممنوح — صفحة الإذن بمسار التعليق اليدوي
          if (store.get().state === 'capturing' || store.get().state === 'paused') void requestMicThenMemo()
          break
        case 'memo-delete':
          // VOX-09: حذف شارة 🎙 قبل النشر (ندم)
          if (store.get().sessionId) await voiceMemo.clearMemo(store.get().sessionId, msg.index)
          break
        case 'train-start':
          // دربني: العارض بالرمز العام أو المحرر بالدليل نفسه — الرد بعد فتح تبويب الهدف
          sendResponse(await startTraining({ token: msg.token, guide: msg.guide }))
          break
        case 'train-progress':
          void onTrainProgress(msg.result, sender.tab?.id)
          break
        case 'auth-changed':
          // AUTH-LIVE: دخول/خروج في تبويب الويب — ختم يوقظ لوحة اللوحة عبر storage.onChanged
          await chrome.storage.local.set({ [AUTH_PING_KEY]: Date.now() })
          break
        case 'pause':
          if (store.get().state === 'capturing') {
            // VOX-06: لا صوت يُسمع في غيابك — التعليق الجاري يُوقف ويُحفظ قبل الإيقاف
            await autoMemoCtl.suspend()
            await store.save({ state: 'paused' })
          }
          break
        case 'resume':
          if (store.get().state === 'paused') {
            await store.save({ state: 'capturing' })
            // VOX-AUTO: الوضع التلقائي يعيد التعليق على آخر بطاقة بعد الاستئناف
            await autoMemoCtl.resumeAfterPause()
          }
          break
        case 'cancel':
          void finish.cancelCapture()
          break
        case 'delete-step': {
          // VOX-09: حذف البطاقة المُعلَّق عليها (أو قبلها) يوقف التعليق أولًا —
          // كي يُخزَّن تحت فهرسه الصحيح قبل أن تعيد إزالة الخطوة ترقيم المفاتيح
          const active = voiceMemo.activeMemo()
          if (active && msg.index <= active.stepIndex) await autoMemoCtl.stopActive()
          void flow.deleteStep(msg.index)
          break
        }
        case 'blur-mode':
          // CAP-13: زر الطمس في اللوحة يفعّل سحب الطمس على التبويب النشط فقط
          if (store.get().state === 'capturing') {
            const active = await store.activeTab()
            if (active?.id !== undefined) await chrome.tabs.sendMessage(active.id, { t: 'blur-mode', on: msg.on }).catch(() => {})
          }
          break
        case 'toggle-bar-cmd':
          // CAP-15: زر «إخفاء الشريط» في اللوحة — يطوي/يظهر شريط الصفحة النشطة
          {
            const active = await store.activeTab()
            if (active?.id !== undefined) await chrome.tabs.sendMessage(active.id, { t: 'toggle-bar' }).catch(() => {})
          }
          break
        case 'finish':
          void finish.finishCapture(msg.title)
          break
        case 'toggle':
          void toggleCapture()
          break
      }
    })()
    return expectsResponse
  })

  chrome.commands.onCommand.addListener((command, tab) => {
    // CAP-15: طيّ/إظهار شريط التسجيل في التبويب النشط — لا يلمس حالة الجلسة
    if (command === 'toggle-bar') {
      if (tab?.id !== undefined) chrome.tabs.sendMessage(tab.id, { t: 'toggle-bar' }).catch(() => {})
      return
    }
    if (command !== 'toggle-capture') return
    // فتح اللوحة الجانبية على إيماءة المستخدم (اختصار لوحة المفاتيح) عند بدء الالتقاط
    if (tab?.windowId !== undefined) chrome.sidePanel?.open({ windowId: tab.windowId }).catch(() => {})
    void metaReady.then(() => toggleCapture())
  })

  // دربني: اكتمال تحميل تبويب التدريب بعد تنقّل — تُسلَّم الخطوة المنتظرة عنده لا قبله
  chrome.tabs.onUpdated.addListener((tabId, info) => {
    const status = info.status
    if (status) void trainReady.then(() => onTabUpdated(tabId, status))
  })

  // الحقن عند التبديل (2026-09-14): الانتقال لتبويب قديم أثناء جلسة حية يزَرع في
  // اللحظة نفسها لا حين يعود المالك ليكتشف صمتًا — الحرس في content.ts يجعل الإعادة آمنة
  chrome.tabs.onActivated.addListener(({ tabId }) => {
    void metaReady.then(async () => {
      const meta = store.get()
      if (meta.state !== 'capturing' && meta.state !== 'paused') return
      try {
        const tab = await chrome.tabs.get(tabId)
        if (tab.url?.startsWith('http')) await contentInjector.inject(tabId)
      } catch {
        // تبويب أُغلق في ذرى التبديل — لا معنى للاعتراض
      }
    })
  })
})
