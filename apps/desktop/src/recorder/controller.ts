/**
 * متحكّم الودجة (مرحلة الربط ١) — الطرف الوحيد الذي يصل الواجهة بالتشغيل
 * الحقيقي: يملك جلسة ٣ج-٢ والتسليم ٣د ويترجمهما أحداثَ بروتوكولٍ لا تعرف
 * الواجهةُ منها مصدرَ الحقيقة (قانون المرحلة: الواجهة صمّاء). التبعيات كلها
 * محقونة (Bridge/Recording/Delivery/widgetRects) فتُختبَر بمزيّفات بلا Tauri.
 * القاعدة الذهبية باقية: لا بنية دليلٍ هنا — التجميع لِـassembleGuide والتحويلات
 * للنواة، والمتحكّم يركّب ولا يعيد تنفيذ قرار.
 */
import {
  isMissingScreenshot,
  markBoxRect,
  type MarkRectPct,
  type MissingScreenshot,
  type ScreenshotMeta,
} from '@dalili/core'
import { createRecorderSession, type Bridge, type RecorderSession } from './session'
import { createFlashCard, type FlashCard, type FlashView } from './flash-card'
import { deliverGuide } from './deliver'
import type { DeliveryCommands, DeliveryEvents } from './deliver'
import { makeMemoRecorder } from './media-recorder'
import { applyMemosToGuide, makeVoiceMemo, type MemoRecorderHost, type StoredVoiceMemo } from './voice-memo'
import { createAutoMemo } from './auto-memo'
import { t } from '../i18n'

/** أحداث البروتوكول الوحيدة التي تراها الواجهة — تنمو بالتزايد ولا تُكسر */
export type AuthPhase = 'unknown' | 'unpaired' | 'pairing' | 'paired'

/** شكل العلامة في البروتوكول (نِسَب مئويّة) — يُعاد تصديره من النواة كي
 *  تقرأه الواجهة من المتحكّم وحده: ‏main.ts ممنوعةٌ من استيراد `@dalili/core`
 *  مباشرةً (عقد «الواجهة صمّاء» المجمَّد) والحقيقة تبقى تعريفًا واحدًا */
export type { MarkRectPct } from '@dalili/core'
export type { FlashView } from './flash-card'

export interface AuthState {
  phase: AuthPhase
  /** الرمز القصير XXXX-XXXX — الرمز السرّي في خزنة ويندوز لا يعبر هنا */
  userCode?: string
  email?: string
}

export type ControllerEvent =
  | {
      t: 'step'
      steps: number
      title: string
      thumbDataUrl: string | null
      /** حلقة العلامة **نِسَبًا مئويّة (٠–١٠٠)** من الإطار الطبيعيّ — لا بكسلات.
       *  علّة 2026-09-30: البطاقة تعرض مصغّرة ~480px بينما إحداثيّات العلامة
       *  ببكسل الشاشة (1920+)، فضربُها بمقياس المصغّرة كان يقذف الحلقة خارج
       *  صندوق اللقطة (overflow:hidden) فلا تُرى أبدًا. النِّسَب لا تعرف دقّةَ
       *  الصورة المعروضة فلا تخطئها — والتحويل من النواة (markBoxRect) */
      markPct?: MarkRectPct
    }
  /** حالة بطاقة اللقطة كاملةً (مواصفة 2026-09-30) — `null` ⇐ أخفِ البطاقة.
   *  الواجهة **ترسم** هذا ولا تقرّر: قرارُ الاستبدال والمهلة والتسجيل كلّه في
   *  آلةٍ واحدة (`flash-card.ts`)، وتوزّعُه سابقًا على ثلاثة أماكن هو العلّة
   *  التي جعلت نقرةً ثانية تبدو ضائعة */
  | { t: 'card'; view: FlashView | null }
  /** الإشارة الفوريّة (بلاغ المالك «المستخدم لا ينتظر»): الإيماءة قُبلت
   *  والبناء جارٍ — البطاقة تقفز بالرقم المتوقّع والبكسلات تتبعها في step */
  | { t: 'capturing'; steps: number }
  /** الإيماءة سقطت (لا حقائق) — البطاقة المؤقّتة تُغلق بصدق */
  | { t: 'dropped' }
  /** حالة الصوت: on ⇐ تعليق يعمل أو التلقائي مفعّل، auto ⇐ وضع VOX-AUTO،
   *  notice ⇐ بلافتة عربية صادقة عند تعذّر الميك (تدهور معلن لا صمت) */
  | { t: 'voice'; on: boolean; auto: boolean; notice?: string }
  | { t: 'paused'; paused: boolean }
  /** arrived ⇐ وصل الدليل فعلاً (رفعٌ وتوليدٌ من الخادم) — وإلّا فلا توست كذب */
  | { t: 'ended'; arrived?: boolean }
  /** إنهاء وهو غير مقترن: البطاقة تدعوه للربط والدليل يُشحن حال اقترانه */
  | { t: 'pairing-needed' }
  | { t: 'auth'; phase: AuthPhase; userCode?: string; email?: string }

export interface WidgetController {
  /** بدء الجلسة: اشتراكاتٌ جاهزةٌ قبل أول نبضة ثم تشغيل المستشعرات — مزدوجُ البدء محروس */
  start(voice: boolean): Promise<void>
  pause(): void
  resume(): void
  /** إسقاط الجلسة بلا أي تسليم */
  cancel(): Promise<void>
  /** تجميع الدليل وتسليمه للطابور ثم ended */
  finish(): Promise<void>
  /** ميك الشريط: في الوضع التلقائي مفتاحُه كلّه، وفي العادية تعليقٌ يدويّ
   *  على آخر خطوة (بدءٌ ثم إيقاف — قرار VOX المجمد) */
  toggleVoice(): Promise<void>
  /** ميك بطاقة اللقطة — يبدأ التعليق على الخطوة المعروضة أو ينهيه */
  cardMic(): Promise<void>
  /** «إلغاء» على بطاقة اللقطة — إيقافٌ بلا حفظ */
  cardCancelMemo(): Promise<void>
  /** فُتحت بطاقةُ مستخدم — بطاقةُ اللقطة تُسلّم مكانها ولا تعود تطويها */
  cardYield(): void
  onEvent(cb: (e: ControllerEvent) => void): () => void
  /** المصادقة: جلب الحالة وبدء الربط وفتح صفحة الموافقة وفكّه — كلٌّ يبثّ auth */
  pairStart(): Promise<void>
  openVerify(code: string): Promise<void>
  forget(): Promise<void>
}

/** حدود الاقتران المحقونة — إنتاجيًّا createDesktopAuth من الجسر */
export interface ControllerAuth {
  status(): Promise<{ paired: boolean; email?: string }>
  pairStart(deviceName: string): Promise<{ userCode: string; verifyUrl: string }>
  forget(): Promise<void>
  openVerify(code: string): Promise<void>
  onAuthEvent(cb: (p: unknown) => void): () => void
}

export interface ControllerDeps {
  bridge: Bridge & { ready(): Promise<void> }
  recording: { start(): Promise<{ sessionId: string }>; stop(): Promise<void> }
  /** بكسلات اللقطة المؤقّتة — بطاقة لحظة الالتقاط */
  thumb: (localId: string) => Promise<{ dataUrl: string }>
  delivery: DeliveryCommands & DeliveryEvents
  auth: ControllerAuth
  /** مستطيلات نوافذ الودجة الفيزيائيّة — استثناء نقراتها من الالتقاط (٣و) */
  widgetRects: () => Array<{ x: number; y: number; w: number; h: number }>
  /** مصنع مسجّل التعليق — الإنتاج ‏makeMemoRecorder (ميكروفون حقيقيّ)،
   *  والاختبارات تُحقن بمزيّف كي لا تلمس المتصفح */
  recorder?: () => MemoRecorderHost
}

export function createWidgetController(deps: ControllerDeps): WidgetController {
  let session: RecorderSession | null = null
  let sessionId: string | null = null
  /** علم الإيقاف المؤقّت — مرآة meta للصوت وتحويلات أحداث paused */
  let pausedFlag = false
  /** اشتراكات الجلسة الجارية — تُفكّ عند الانتهاء كي لا يبني جسدٌ قديمٌ خطوات */
  let cancels: Array<() => void> = []
  let listeners: Array<(e: ControllerEvent) => void> = []
  // حالة الاقتران — مرآة خزنة Rust (الرمز السرّي لا يعبر هنا أبدًا)
  let auth: AuthState = { phase: 'unknown' }

  // ───────────── الصوت (المرحلة ٢ — VOX-AUTO): مكدّس التعليق والسياسة ─────────────
  interface VoiceStack {
    store: Map<number, StoredVoiceMemo>
    memo: ReturnType<typeof makeVoiceMemo>
    auto: ReturnType<typeof createAutoMemo>
    /** نوع الجلسة: بدأت «مع تعليق صوتي» ⇐ ميك الشريط مفتاحُ التلقائيّ كله */
    autoMode: boolean
    /** الحالة اللحظية للتعلّق التلقائي (يقلبها ميك الشريط في وضع autoMode) */
    autoOn: boolean
    /** بين طلب الإنهاء وحلّه: لا تعليقًا جديدًا على خطوات الإغلاق الأخيرة */
    ending: boolean
  }
  let voiceStack: VoiceStack | null = null
  /** آلة بطاقة اللقطة — تحيا مع الجلسة وتموت معها */
  let card: FlashCard | null = null

  const voiceMeta = () => ({
    capturing: session !== null && !voiceStack?.ending,
    paused: pausedFlag,
    stepCount: session?.stepCount() ?? 0,
    autoMemo: voiceStack?.autoOn ?? false,
  })
  const voiceOn = (): boolean =>
    !!voiceStack && (voiceStack.autoOn || voiceStack.memo.activeMemo() !== null)
  const emitVoice = (notice?: string): void => {
    // البطاقة تعكس التسجيل الجاري أيًّا كان بادئُه (الوضع التلقائي يبدأه وحده)
    // — `syncRecording` يصف ولا ينادي الصوت فلا حلقة رجعيّة
    card?.syncRecording(voiceOn())
    emit({ t: 'voice', on: voiceOn(), auto: voiceStack?.autoOn ?? false, ...(notice ? { notice } : {}) })
  }

  const emit = (e: ControllerEvent): void => {
    for (const l of listeners) l(e)
  }
  const emitAuth = (): void => {
    emit({ t: 'auth', phase: auth.phase, ...(auth.userCode ? { userCode: auth.userCode } : {}), ...(auth.email ? { email: auth.email } : {}) })
  }

  async function refreshAuth(): Promise<void> {
    try {
      const s = await deps.auth.status()
      auth = s.paired ? { phase: 'paired', email: s.email } : { phase: 'unpaired' }
    } catch (e) {
      console.error('[controller] authStatus:', e)
      auth = { phase: 'unknown' }
    }
    emitAuth()
  }
  void refreshAuth()
  deps.auth.onAuthEvent(() => {
    void refreshAuth()
  })

  const widgetRects = deps.widgetRects
  const ignorePoint = (x: number, y: number): boolean =>
    widgetRects().some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)

  /** لحظة بناء خطوة: مصغّرةٌ للبطاقة الحيّة — فشلُها لا يُسقط الحدث
   *  (null بصدق). طابورُ اللقطات نفسه مالكه deliverGuide عند الإنهاء
   *  (٣د-٣: يُدرّع بالرفع ويستبدل المعرّفات قبل تسليم الجسم) */
  async function handleStep(s: {
    title: string
    kind: string
    shot: ScreenshotMeta | MissingScreenshot | null
    frame?: { w: number; h: number }
  }): Promise<void> {
    const rec = session
    if (!rec) return
    const meta = s.shot && !isMissingScreenshot(s.shot) ? s.shot : null
    let thumbDataUrl: string | null = null
    if (meta) {
      try {
        thumbDataUrl = (await deps.thumb(meta.fileId)).dataUrl
      } catch (e) {
        console.error('[controller] thumb:', e)
      }
    }
    // التحويل لنِسَب بالنواة وحدها (markBoxRect) — المتحكّم يركّب ولا يحسب.
    // بلا أبعاد إطارٍ صادقة لا نِسَبَ تُدَّعى: علامةٌ في غير موضعها أسوأ من غيابها
    const markPct =
      meta?.mark && s.frame ? markBoxRect(meta.mark.rect, s.frame.w, s.frame.h) : null
    // البكسلات وصلت ⇐ البطاقة تُملأ بالحقيقة. الآلة وحدها تقرّر ماذا يظهر:
    // قد تكون في `recording` فتحدّث الصورة بلا قطعِ كلامٍ جارٍ
    if (thumbDataUrl) {
      card?.step(rec.stepCount(), { src: thumbDataUrl, ...(markPct ? { mark: markPct } : {}) })
    } else {
      // لا بكسلات (لقطة محميّة أو فشل مصغّرة) — البطاقة لا تعلّق منتظرةً للأبد
      card?.dropped()
    }
    emit({
      t: 'step',
      steps: rec.stepCount(),
      title: s.title,
      thumbDataUrl,
      ...(markPct ? { markPct } : {}),
    })
  }

  /** ذيل الإسقاط المشترك (إلغاءٌ وإنهاءٌ سواء): فكُّ اشتراكات الجلسة ثم محو مراجعها */
  function teardown(): void {
    for (const un of cancels) un()
    cancels = []
    card?.reset() // لا بطاقةَ يتيمة تبقى بعد موت الجلسة، ولا مهلةَ معلّقة
    card = null
    session = null
    sessionId = null
  }

  return {
    async start(voice: boolean): Promise<void> {
      if (session) return
      // الصوت (المرحلة ٢): «ابدأ مع تعليق صوتي» ⇐ مكدّس VOX-AUTO كامل — والبدء
      // العادي يبنيه أيضًا بوضعٍ يدويّ كي يعمل ميك الشريط (بدء ثم إيقاف)
      {
        const store = new Map<number, StoredVoiceMemo>()
        const recorderHost = deps.recorder?.() ?? makeMemoRecorder()
        const memo = makeVoiceMemo({ recorder: recorderHost, store })
        const stack: VoiceStack = { store, memo, auto: null!, autoMode: voice, autoOn: voice, ending: false }
        stack.auto = createAutoMemo({
          memo,
          meta: voiceMeta,
          setAutoMemo: (v: boolean) => {
            stack.autoOn = v
            emitVoice()
          },
          onNotice: (t: string) => emitVoice(t),
        })
        voiceStack = stack
      }
      pausedFlag = false
      // جسرٌ مُحصَّر بالجلسة: اشتراكاتها تُفكّ كلها عند الانتهاء
      const scoped: Bridge = {
        listen: (evt, cb) => {
          const un = deps.bridge.listen(evt, cb)
          cancels.push(un)
          return un
        },
        invoke: (cmd, args) => deps.bridge.invoke(cmd, args),
        factsRefresh: (seq) => deps.bridge.factsRefresh(seq),
        frameBlur: (localId, rects) => deps.bridge.frameBlur(localId, rects),
      }
      // ساعة البطاقة من `sensor://tick` (Rust) لا من `setTimeout`: مؤقّتات
      // WebView تُخنَق في نافذةٍ غير مركَّز عليها — والمستخدم بطبيعة العمل في
      // تطبيقٍ آخر. نفس علّة ساعة الجلسة (خطّة ٣ج §٧)
      let tickMs = 0
      let dueList: Array<{ fn: () => void; at: number }> = []
      cancels.push(
        deps.bridge.listen('sensor://tick', (p) => {
          const v = p as { qpcMs?: number }
          if (typeof v.qpcMs !== 'number') return
          tickMs = v.qpcMs
          const due = dueList.filter((e) => tickMs >= e.at)
          dueList = dueList.filter((e) => tickMs < e.at)
          for (const e of due) e.fn()
        }),
      )
      card = createFlashCard({
        now: () => tickMs,
        schedule: (fn, ms) => {
          const e = { fn, at: tickMs + ms }
          dueList.push(e)
          return () => {
            dueList = dueList.filter((x) => x !== e)
          }
        },
        // الآلة تطلب ولا تملك — مصدر الحقيقة يبقى voiceStack واحدًا
        voice: {
          start: async () => {
            const stack = voiceStack
            const rec0 = session
            if (!stack || !rec0) return false
            const r = await stack.memo.startMemo(rec0.stepCount() - 1)
            if (!r.ok) {
              emitVoice(r.errorAr) // تدهور معلن لا صمت
              return false
            }
            emitVoice()
            return true
          },
          stop: async () => {
            const stack = voiceStack
            if (!stack || !stack.memo.activeMemo()) return
            await stack.memo.stopMemo('user').catch(() => undefined)
            emitVoice()
          },
          cancel: async () => {
            const stack = voiceStack
            if (!stack || !stack.memo.activeMemo()) return
            await stack.memo.cancelMemo().catch(() => undefined)
            emitVoice()
          },
        },
        onView: (view) => emit({ t: 'card', view }),
      })
      const rec = createRecorderSession(scoped, {
        ignorePoint,
        onStepBuilt: (s) => {
          void handleStep(s)
          // إصلاح 2026-09-30: يُنادى **دائمًا** لا في الوضع التلقائي وحده.
          // `auto-memo` موثَّق بأنّ «الجلسة العادية يعمل الخطّاف نفسه بإيقاف
          // التعليق الجاري عند بطاقة جديدة» — والحراسة بـautoOn كانت تُبقي
          // تعليقًا يدويًّا جاريًا يُلصَق بالخطوة **القديمة** وخطواتٌ جديدة تتوالى.
          // الوحدة تحرس نفسها: بلا autoMemo توقف ولا تبدأ بديلًا
          if (!voiceStack?.ending) {
            void voiceStack?.auto.onNewStep(rec.stepCount() - 1)
          }
        },
        // الإشارة الفوريّة: تقفز البطاقة لحظة القبول، والإسقاط يغلقها بصدق
        onGestureAccepted: (n) => {
          void card?.capturing(n)
          emit({ t: 'capturing', steps: n })
        },
        onGestureDropped: () => {
          card?.dropped()
          emit({ t: 'dropped' })
        },
      })
      // الاشتراكات قبل أوّل نبضة (عقد bridge.ready) ثم المستشعرات
      await deps.bridge.ready()
      const ack = await deps.recording.start()
      sessionId = ack.sessionId
      session = rec
    },

    pause(): void {
      session?.pause()
      pausedFlag = true
      // VOX-06: لا صوت يُسمع في غيابك — الجاري يُحفظ والتسلسل يتوقف
      void voiceStack?.auto.suspend().then(() => emitVoice())
      emit({ t: 'paused', paused: true })
    },

    resume(): void {
      session?.resume()
      pausedFlag = false
      // الاستئناف: الوضع التلقائي وحده يعيد التعليق على آخر بطاقة
      void voiceStack?.auto.resumeAfterPause().then(() => emitVoice())
      emit({ t: 'paused', paused: false })
    },

    async cancel(): Promise<void> {
      if (!session) return
      const stack = voiceStack
      voiceStack = null
      if (stack) {
        stack.ending = true
        await stack.auto.stopForFinish().catch(() => undefined)
        stack.memo.purge() // إلغاءٌ بلا تسليم: لا تعليقًا يتيمًا يبقى في الذاكرة
      }
      await deps.recording.stop().catch(() => {})
      teardown()
      emit({ t: 'ended' })
    },

    /** الإنهاء (٣د-٣): يُسلَّم لتنسيقِ ‏deliverGuide — رفعُ اللقطات ثم
     *  استبدال المعرّفات ثم تسليم الجسم ثم فتح العارض عند guide-created
     *  (كل ذلك داخل تنسيقه). ‏ended يصل لاحقًا: arrived ⇐ وصل فعلاً ⇐ توست،
     *  وغير المقترن ⇐ pairing-needed تدعوه للربط والدليل يُشحن حال اقترانه */
    finish(): Promise<void> {
      const rec = session
      if (!rec) return Promise.resolve()
      const sid = sessionId
      const stack = voiceStack
      void (async () => {
        try {
          // الصوت أولًا: إنهاء التعليق الجاري (إنهاء الالتقاط: الجاري يُحفظ)،
          // وعلم الإغلاق يمنع تعليقًا جديدًا على خطوات الإغلاق الأخيرة
          if (stack) {
            stack.ending = true
            await stack.auto.stopForFinish().catch(() => undefined)
          }
          const guide = await rec.stop()
          // ربطُ التعليقات المحفوظة بخطوات الدليل — الرفعُ ومعرّفُه الحقيقيّ
          // لمسار الطابور (deliverGuide) والفشل يبقيها pending لا مفقودة
          if (stack) {
            applyMemosToGuide(guide, stack.store)
          }
          await deps.recording.stop().catch(() => {})
          teardown()
          if (!sid) return
          const voiceSource = stack ? { chunksOf: (i: number) => stack.store.get(i)?.chunks ?? null } : undefined
          const d = deliverGuide(sid, guide, deps.delivery, deps.delivery, voiceSource)
          const arrived = await d.submitted.then(
            () => true,
            (e: unknown) => {
              console.error('[controller] submit:', e)
              return false
            },
          )
          emit({ t: 'ended', arrived })
        } catch (e) {
          console.error('[controller] finish:', e)
          emit({ t: 'ended', arrived: false })
        }
      })()
      if (auth.phase !== 'paired') emit({ t: 'pairing-needed' })
      return Promise.resolve()
    },

    /** ميك الشريط — القرار المجمد: جلسة «مع تعليق صوتي» ⇐ مفتاحُ التعلّق
     *  التلقائيّ كله (إيقاف/إعادة)، وجلسة عادية ⇐ تعليقٌ يدويّ على آخر خطوة
     *  (بدء ثم إيقاف) — الفرق بنوع الجلسة لا بالحالة اللحظية */
    async toggleVoice(): Promise<void> {
      const stack = voiceStack
      if (!stack || session === null) {
        emitVoice(t('dt.noSession'))
        return
      }
      if (stack.autoMode) {
        const ack = await stack.auto.toggle()
        if (!ack.ok) {
          emitVoice(ack.errorAr)
          return
        }
        emitVoice()
        return
      }
      // وضع يدويّ: يعمل إن كان واقفًا ويوقف إن كان يعمل — بلا خطوة لا معنى
      if (stack.memo.activeMemo()) {
        const r = await stack.memo.stopMemo('user')
        emitVoice(r.ok ? undefined : r.errorAr)
        return
      }
      const last = session.stepCount() - 1
      const r = await stack.memo.startMemo(last)
      if (!r.ok) {
        emitVoice(r.errorAr)
        return
      }
      emitVoice()
    },

    /** ميك البطاقة — الآلة تعرف حالتها فتبدأ أو تنهي؛ والمتحكّم يوصّل فقط */
    async cardMic(): Promise<void> {
      await card?.mic()
    },

    async cardCancelMemo(): Promise<void> {
      await card?.cancel()
    },

    cardYield(): void {
      void card?.userCard()
    },

    onEvent(cb: (e: ControllerEvent) => void): () => void {
      listeners.push(cb)
      return () => {
        listeners = listeners.filter((l) => l !== cb)
      }
    },

    /** بدء الربط: pairing فورًا (نبضة العنبر) ثم الرمز القصير عند وصوله —
     *  فشلُ الخادم يعيد unpaired بصدق. ولا حدثَ اقترانٍ من Rust فالاستقصاء
     *  أثناء الانتظار حصرًا هو ما يقلب البطاقة أخضرَ حيًّا */
    async pairStart(): Promise<void> {
      auth = { phase: 'pairing' }
      emitAuth()
      try {
        const info = await deps.auth.pairStart(t('dt.deviceName'))
        auth = { phase: 'pairing', userCode: info.userCode }
      } catch (e) {
        console.error('[controller] pairStart:', e)
        auth = { phase: 'unpaired' }
      }
      emitAuth()
      if (auth.phase !== 'pairing') return
      const poll = async (): Promise<void> => {
        while (auth.phase === 'pairing') {
          await new Promise((r) => setTimeout(r, 2500))
          if (auth.phase !== 'pairing') return
          try {
            const s = await deps.auth.status()
            if (s.paired) {
              auth = { phase: 'paired', email: s.email }
              emitAuth()
              return
            }
          } catch {
            // الخادم غائب لحظةً — تستمر النبضة حتى الموافقة
          }
        }
      }
      void poll()
    },

    async openVerify(code: string): Promise<void> {
      await deps.auth.openVerify(code).catch((e: unknown) => {
        console.error('[controller] openVerify:', e)
      })
    },

    async forget(): Promise<void> {
      await deps.auth.forget().catch((e: unknown) => {
        console.error('[controller] forget:', e)
      })
      await refreshAuth()
    },
  }
}
