import { defineBackground } from 'wxt/utils/define-background'
import type { BgMsg, MemoToggleAck } from '@/lib/protocol'
import { createSessionStore } from '@/lib/session-store'
import { createCaptureFlow } from '@/lib/capture-flow'
import { createVoiceLive } from '@/lib/voice-live'
import { createFinish } from '@/lib/finish-publish'
import { makeVoiceMemo } from '@/lib/voice-memo'
import { WEB_BASE } from '@/lib/config'
import { startTraining, onTrainProgress, onTabUpdated, trainLoaded } from '@/lib/train-bg'

/**
 * منسّق الخلفية — المنطق موزّع على مكتبات نقية (قانون الحجم ٤٠٠):
 * session-store (الحالة والبثّ) · capture-flow (خط الالتقاط) · voice-live (الصوت
 * المستمر VOX-01..06) · voice-memo (VOX-09 تعليق الخطوة) · finish-publish (الإنهاء).
 */

const store = createSessionStore()

/** VOX-09: آلة حالة تعليق الخطوة — تخزين محلي pending وسقف ستون ثانية */
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

/** VOX-09: زر الميك في اللوحة — جارٍ يوقف، وإلا يبدأ على آخر خطوة ملتقطة */
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
  await voiceLive.ensureOffscreen()
  const start = await voiceMemo.startMemo(meta.sessionId, meta.stepCount - 1)
  if (!start.ok) return start
  await attachMemoToMeta()
  return { ok: true, stopped: false }
}

/** VOX-09: إذن طُلب لأجل تعليق خطوة (ميك الخطوة) أثناء جلسة جارية */
async function requestMicThenMemo(): Promise<void> {
  const active = await store.activeTab()
  if (active?.id !== undefined) voiceLive.setMicReturnTab(active.id)
  await chrome.tabs.create({ url: chrome.runtime.getURL('mic-permission.html?flow=memo') })
}

/** نتيجة صفحة الإذن: flow=memo للتعليق الجاري، وإلا مسار الصوت المستمر القائم */
async function onMicResult(granted: boolean, senderTabId?: number, flow?: 'memo'): Promise<void> {
  if (flow === 'memo') {
    const meta = store.get()
    if (!granted) {
      await store.save({ notice: 'لا صوت — الالتقاط مستمر بلا تعليق' })
    } else if (meta.stepCount > 0 && (meta.state === 'capturing' || meta.state === 'paused')) {
      await voiceLive.ensureOffscreen()
      const start = await voiceMemo.startMemo(meta.sessionId, meta.stepCount - 1)
      if (start.ok) await attachMemoToMeta()
      else await store.save({ notice: start.errorAr })
    } else {
      await store.save({ notice: 'التقط خطوة أولًا ثم علّق عليها بصوتك' })
    }
  } else {
    await voiceLive.onMicResult(granted)
  }
  await returnFocusAndClose(senderTabId)
}

/** إعادة التركيز للتبويب الأصلي وإغلاق صفحة الإذن — ذيل مشترك لمساري الإذن */
async function returnFocusAndClose(senderTabId?: number): Promise<void> {
  const tabId = voiceLive.getMicReturnTab()
  if (tabId !== null) {
    await chrome.tabs.update(tabId, { active: true }).catch(() => {})
    const win = (await chrome.tabs.get(tabId).catch(() => null))?.windowId
    if (win !== undefined) await chrome.windows.update(win, { focused: true }).catch(() => {})
  }
  if (senderTabId !== undefined) await chrome.tabs.remove(senderTabId).catch(() => {})
}

/** بدء جلسة عادية أو جلسة إضافة على دليل قائم (CAP-17) */
async function startCapture(opts: { appendTo?: string; insertAt?: number; audio?: boolean } = {}) {
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
    micOn: false,
    memoLive: undefined,
    appendTo: opts.appendTo,
    insertAt: opts.insertAt,
  })
  // فخ التبويب اليتيم: بعد إعادة تحميل الامتداد تبقى الصفحات المفتوحة سابقًا
  // على سكربت منفصل لا يوصل أحداثه — النقر فيها لا يُلتقط شيئًا بصمت.
  // لا نمنع البدء؛ نعلن بصدق أن التبويب النشط يحتاج F5.
  // البث دائمًا وفي كل المسارات — بدء الصوت يجري والتبويب النشط صفحة الإذن،
  // فحصر البث آنذاك كان يترك مسارَي الالتقاط (عادي/صوتي) مختلفين.
  const live = await store.broadcast()
  const active = await store.activeTab()
  if (active?.id !== undefined && active.url?.startsWith('http') && !live.has(active.id)) {
    await store.save({ notice: 'هذا التبويب مفتوح منذ قبل تحميل الامتداد — حدّثه (F5) وإلا لن يُلتقط منه شيء' })
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
})

const voiceLive = createVoiceLive({
  meta: store.get,
  saveMeta: store.save,
  startCapture,
  activeTab: store.activeTab,
})

/** زر/اختصار التبديل — جلسة قائمة تُنهى، وإلا تبدأ (مصدر واحد للوحة واختصار لوحة المفاتيح) */
function toggleCapture(): void {
  if (store.get().state === 'capturing' || store.get().state === 'paused') void finish.finishCapture()
  else void startCapture()
}

const finish = createFinish({
  meta: store.get,
  saveMeta: store.save,
  finishAudio: voiceLive.finishAudio,
  purgeAudio: voiceLive.purgeAudio,
  abortMemos: async (sid) => {
    if (voiceMemo.activeMemo()) await voiceMemo.stopMemo('user').catch(() => undefined)
    await voiceMemo.purgeMemos(sid)
  },
})

export default defineBackground(() => {
  // نقرة أيقونة الامتداد تفتح اللوحة الجانبية (لا بوب-اب) — كسكرايب/تانجو تمامًا.
  chrome.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {})

  // السباق القاتل في MV3: الرسالة توقظ العامل قبل اكتمال قراءة الحالة من التخزين،
  // فيرى «idle» الكاذبة ويرمي الأحداث بصمت. الحل: كل مستقبل ينتظر الجاهزية،
  // وبعد الإقلاع نعيد بث الحالة لكل التبويبات لتصحيح من قيل له «idle» خطأً أثناء موت العامل.
  const metaReady = store.load().then(async (meta) => {
    await voiceLive.restoreAudioState()
    return meta
  })
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
      msg.t === 'whoami' || msg.t === 'append-capture' || msg.t === 'train-start' || msg.t === 'memo-toggle'
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
          void voiceLive.requestMicThenStart()
          break
        case 'mic-result':
          void onMicResult(msg.granted, sender.tab?.id, msg.flow)
          break
        case 'memo-toggle':
          // VOX-09: زر الميك — تسجيل جارٍ يوقف، وإلا يبدأ على آخر خطوة ملتقطة
          sendResponse(await memoToggle())
          break
        case 'memo-request':
          // VOX-09: الميكروفون غير ممنوح — صفحة الإذن بمسار التعليق
          if (store.get().state === 'capturing' || store.get().state === 'paused') void requestMicThenMemo()
          break
        case 'memo-delete':
          // VOX-09: حذف شارة 🎙 قبل النشر (ندم)
          if (store.get().sessionId) await voiceMemo.clearMemo(store.get().sessionId, msg.index)
          break
        case 'audio-chunk':
          void voiceLive.onAudioChunk(msg.sid, msg.idx, msg.b64, msg.offsetMs)
          break
        case 'audio-stopped':
          // آخر مقطع وصل — لا شيء إضافي؛ finishAudio يقرأ المخزن عند النشر
          break
        case 'train-start':
          // دربني: العارض بالرمز العام أو المحرر بالدليل نفسه — الرد بعد فتح تبويب الهدف
          sendResponse(await startTraining({ token: msg.token, guide: msg.guide }))
          break
        case 'train-progress':
          void onTrainProgress(msg.result, sender.tab?.id)
          break
        case 'append-capture': {
          // CAP-17: من محرر الويب — بدء جلسة تُضاف خطواتها للدليل المحدد عند الإنهاء
          const meta = store.get()
          if (meta.state === 'capturing' || meta.state === 'paused') {
            sendResponse({ ok: false, errorAr: 'جلسة التقاط جارية بالفعل — أنهها أولًا من اللوحة الجانبية' })
            break
          }
          if (meta.state === 'draft') {
            sendResponse({ ok: false, errorAr: 'توجد مسودة محلية قائمة — انشرها أو احذفها من اللوحة الجانبية أولًا' })
            break
          }
          await startCapture({ appendTo: msg.guideId, insertAt: msg.insertAt })
          sendResponse({ ok: true })
          break
        }
        case 'pause':
          if (store.get().state === 'capturing') {
            // VOX-06: الميكروفون يتوقف فعلًا أثناء الإيقاف — لا يُسمع شيء في غيابك
            await voiceLive.pauseAudio()
            void store.save({ state: 'paused' })
          }
          break
        case 'resume':
          if (store.get().state === 'paused') {
            await voiceLive.resumeAudio()
            void store.save({ state: 'capturing' })
          }
          break
        case 'cancel':
          void finish.cancelCapture()
          break
        case 'delete-step':
          void flow.deleteStep(msg.index)
          break
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
          void finish.finishCapture()
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

  // دربني: اكتمال تحميل تبويب التدريب بعد تنقّل — تُسلَّم الخطوة المنتظرة عندها لا قبله
  chrome.tabs.onUpdated.addListener((tabId, info) => {
    const status = info.status
    if (status) void trainReady.then(() => onTabUpdated(tabId, status))
  })
})
