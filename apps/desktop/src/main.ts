/**
 * الودجة بنوافذ منفصلة — الفصل النظيف (طلب المالك 2026-09-19) + الربط
 * الحقيقي (مرحلة ١ 2026-09-20):
 * - نافذة ‏main = الحصاة الدائمة ٤٤×٤٤ لا تتحوّل أبدًا؛ تستقبل أحداث
 *   المتحكّم (controller) فتُصدر أوامر العرض للمنبثقة — ولا تعرف أصلًا
 *   من أين تأتي الحقيقة (قانون المرحلة: الواجهة صمّاء).
 * - نافذة ‏popout = البطاقات (قائمة/شريط/شريحة/تأكيد/بناء/توست/لقطة/
 *   حبّة التدريب) تنبثق فوق الحصاة بمحاذاة الحافة اليمنى.
 * - الجلسة حقيقيّة عبر المتحكّم: نقرات المستخدم خارج الودجة تبني خطواتٍ
 *   فعلية، وبطاقة اللقطة تعرض اللقطة الفعلية، والإنهاء يسلّم الدليل
 *   لطابور الرفع. عجلاتُ التدريب جولتان في localStorage.
 * - السحب (>٦px) ينقل الحصاة فيخفي المنبثقة أولًا، والموضع يُحفظ.
 */

import { emit, listen } from '@tauri-apps/api/event'
import { PhysicalPosition, PhysicalSize, currentMonitor, getCurrentWindow } from '@tauri-apps/api/window'
import { POPOUT_SIZES, SQUARE_SIZE, popoutAbove, type AnchorRect, type PopoutForm } from './recorder/expand'
import { restorePlacement, trackPlacement, bottomRightPosition, type WidgetWindow } from './recorder/placement'
import { createWidgetController, type AuthState } from './recorder/controller'
import {
  createTauriBridge,
  createDesktopAuth,
  createDesktopDelivery,
  createAppControls,
  createRecordingControls,
} from './recorder/bridge'
import { applyLocale, readLocale, setLocale, subscribeLocale, t, arDigits } from './i18n'

const app = document.getElementById('app')

// I18N-01: اللغة المحفوظة تُطبَّق قبل أول رسم (لا قفز اتجاه) — قبل أي نداء Tauri
applyLocale(readLocale())

const win = getCurrentWindow()
const isPebble = win.label === 'main'
document.body.dataset.win = isPebble ? 'main' : 'popout'

// عنوان النافذة يتبع اللغة في شريط المهام؛ العربي يبقى على قيم tauri.conf الافتراضيّة
void win.setTitle(t(isPebble ? 'dt.title' : 'dt.popTitle'))
// التبديل الحيّ من المنبثقة يعيد عنوان هذه النافذة بلغة الجديدة
subscribeLocale(() => {
  void win.setTitle(t(isPebble ? 'dt.title' : 'dt.popTitle'))
})

if (isPebble) {
  // ───────────── نافذة الحصاة الدائمة — مرآة المتحكّم ومُصدِر الأوامر ─────────────
  let session = false
  let paused = false
  let voice = false
  let popoutOpen = false
  // عدد الخطوات الحقيقيّ مرآةً من المتحكّم — للتوست ولقطة العدم
  let steps = 0
  // حارس بطاقة البناء (بلاغ المالك: «علق عند جارٍ بناء الدليل»): التسليم
  // قد يتعثر (خادم غائب/تفكيك مستشعرات) — البطاقة لا تُعلّق للأبد، والدليل
  // المربوط في الطابور يُرفع تلقائيًّا حين يتوفر الخادم
  let finishWatchdog: ReturnType<typeof setTimeout> | null = null
  let finishSettled = true
  function armFinishWatchdog(): void {
    finishSettled = false
    if (finishWatchdog) clearTimeout(finishWatchdog)
    finishWatchdog = setTimeout(() => {
      finishWatchdog = null
      if (finishSettled) return
      finishSettled = true
      session = false
      paused = false
      voice = false
      render()
      if (popoutOpen && openForm === 'build') void emit('widget-popout', { action: 'hide' })
      console.warn('[widget] finish watchdog: التسليم تأخر — الدليل محفوظ في الطابور وسيُرفع تلقائيًّا')
    }, 15000)
  }
  // عجلات التدريب (المرجع خطوة ٩): أول جولتين بالحبّة الكاملة ثم القائمة
  const TOURS_KEY = 'itqan.widget.tours'
  let tours = Number.parseInt(localStorage.getItem(TOURS_KEY) ?? '0', 10)
  if (!Number.isFinite(tours) || tours < 0) tours = 0

  // مستطيلا النافذتين الفيزيائيّان — استثناء نقرات الودجة من الالتقاط (٣و)
  let pebblePhys = { x: 0, y: 0, w: 66, h: 66 }
  let popoutPhys: { x: number; y: number; w: number; h: number } | null = null
  // شكل البطاقة المعروضة الآن (لتحديثها حين تتغيّر حالتها وهي مفتوحة)
  let openForm: PopoutForm | null = null
  // بطاقة الانتظار المؤقّتة (capturing): تُكمَل بالحقيقة عند step وتُغلق عند dropped
  let pendingCapture = false
  // حالة الاقتران — مرآة من أحداث المتحكّم (الرمز السرّي لا يعبر هنا)
  let authState: AuthState = { phase: 'unknown' }

  // المتحكّم: الجلسة الحقيقيّة (مستشعرات/لقطات/طابور/اقتران) أحداثَ بروتوكول
  const recording = createRecordingControls()
  const appCtl = createAppControls()
  const desktopAuth = createDesktopAuth()
  const controller = createWidgetController({
    bridge: createTauriBridge(),
    recording,
    thumb: recording.thumb,
    delivery: createDesktopDelivery(),
    auth: {
      ...desktopAuth,
      // حدثا الاقتران معًا (وصل/فُقد) يُحدّثان الحالة من خزنة Rust
      onAuthEvent: (cb) => {
        const u1 = desktopAuth.onAuthEvent('auth://paired', cb)
        const u2 = desktopAuth.onAuthEvent('auth://lost', cb)
        return () => {
          u1()
          u2()
        }
      },
    },
    widgetRects: () => (popoutOpen && popoutPhys ? [pebblePhys, popoutPhys] : [pebblePhys]),
  })
  controller.onEvent((e) => {
    if (e.t === 'step') {
      steps = e.steps
      // العدّاد يصل المنبثقة (تأكيد الإلغاء والتوست) — صدى الحالة نفسه
      void emit('widget-state', { steps: e.steps })
      if (popoutOpen) {
        // بطاقة الانتظار المؤقّتة مفتوحة ⇐ تُكمِل بالحقيقة في مكانها (الرقم
        // يصحّ والبكسلات تصل)؛ بطاقةُ مستخدمٍ مفتوحة ⇐ لا تُطوى
        if (pendingCapture && openForm === 'flash') {
          pendingCapture = false
          void openFlash(e.thumbDataUrl, e.mark, { n: e.steps })
        }
      } else {
        void openFlash(e.thumbDataUrl, e.mark)
      }
    } else if (e.t === 'capturing') {
      // الإشارة الفوريّة (بلاغ المالك): البطاقة تقفز فورًا بالرقم المتوقّع
      // والبكسلات تتبعها — المستخدم لا ينتظر الالتقاط ليرى أن نقرةً عُدّت
      if (!popoutOpen) {
        pendingCapture = true
        void openFlash(null, undefined, { pending: true, n: e.steps })
      }
    } else if (e.t === 'dropped') {
      // الإيماءة سقطت (لا حقائق) — البطاقة المؤقّتة وحدها تُغلق بصدق
      if (pendingCapture && popoutOpen && openForm === 'flash') {
        void emit('widget-popout', { action: 'hide' })
      }
      pendingCapture = false
    } else if (e.t === 'voice') {
      // المرحلة ٢: الحصاة ترتدّ بالحالة الصادقة من المتحكّم (المايك الأحمر)
      voice = e.on
      render()
      // صدى الحالة للمنبثقة المفتوحة (نقطة الميك وحالة البطاقات)
      void emit('widget-state', { voice: e.on })
      if (e.notice) console.info('[widget] voice:', e.notice)
    } else if (e.t === 'paused') {
      paused = e.paused
      render()
    } else if (e.t === 'ended') {
      finishSettled = true
      if (finishWatchdog) {
        clearTimeout(finishWatchdog)
        finishWatchdog = null
      }
      session = false
      voice = false
      paused = false
      render()
      if (e.arrived) {
        // وصل فعلاً ⇐ توست الوصول (والعارض فُتح من تنسيق التسليم نفسه)
        void showUserCard('toast')
      } else if (popoutOpen && openForm === 'build') {
        // لا وصول ⇐ لا توست كذب — البطاقة تُخفى صامتة
        void emit('widget-popout', { action: 'hide' })
      }
    } else if (e.t === 'pairing-needed') {
      // أنهى وهو غير مقترن: بطاقة الحساب تدعوه للربط — والدليل يُشحن حال اقترانه
      if (popoutOpen && openForm === 'build') void emit('widget-popout', { action: 'hide' })
      void showUserCard('account')
    } else if (e.t === 'auth') {
      authState = { phase: e.phase, userCode: e.userCode, email: e.email }
      // بطاقة الحساب مفتوحة ⇐ تُحدَّث فورًا (وصول الرمز/تأكيد الربط/فكّه)
      if (popoutOpen && openForm === 'account') void showUserCard('account')
    }
  })

  const widgetWindow: WidgetWindow = {
    outerPosition: async () => {
      const p = await win.outerPosition()
      return { x: p.x, y: p.y }
    },
    setPosition: (p) => win.setPosition(new PhysicalPosition(p.x, p.y)),
    onMoved: (h) => {
      let un: (() => void) | undefined
      void win
        .onMoved((p) => {
          pebblePhys = { x: p.payload.x, y: p.payload.y, w: 66, h: 66 }
          h({ x: p.payload.x, y: p.payload.y })
        })
        .then((f) => {
          un = f
        })
      return () => un?.()
    },
  }
  // وضع الاستثناء يبدأ من الموضع الفعلي فورًا (قبل أيّ سحب)
  void win.outerPosition().then((p) => {
    pebblePhys = { x: p.x, y: p.y, w: 66, h: 66 }
  })
  // الموضع الطبيعي: آخر سحب ينتصر، وإلّا الركن السفلي الأيمن — على مقاس المربع
  void restorePlacement(widgetWindow, localStorage).then(async (restored) => {
    if (restored) return
    try {
      const m = await currentMonitor()
      if (!m) return
      const sf = m.scaleFactor
      const pos = bottomRightPosition(
        { position: m.position, size: m.size, scaleFactor: sf },
        { width: Math.round(SQUARE_SIZE.w * sf), height: Math.round(SQUARE_SIZE.h * sf) },
      )
      await win.setPosition(new PhysicalPosition(pos.x, pos.y))
    } catch {
      // بلا موضع محفوظ ولا ركن محسوب — وضع الإعداد يبقى، بلا ضرر
    }
  })
  trackPlacement(widgetWindow, localStorage)

  function render(): void {
    document.body.classList.toggle('session', session)
    document.body.classList.toggle('paused', paused)
    document.body.classList.toggle('voice', voice)
  }

  // المنبثقة تردّ بأفعال الجلسة — والمتحكّم مصدر الحقيقة الوحيد
  void listen('widget-state', (e) => {
    const p = e.payload as {
      session?: boolean
      paused?: boolean
      voice?: boolean
      voiceToggle?: boolean
      finish?: boolean
      account?: boolean
      openVerify?: string
      forget?: boolean
      exit?: boolean
    }
    if (p.exit === true) {
      // الإغلاق الرسميّ الوحيد — الإعدادات ← إنهاء التطبيق
      void appCtl.exit()
      return
    }
    if (p.account === true) {
      // غير مربوط ⇐ يبدأ الربط أوّلًا ثم تُفتح البطاقة بالرمز القصير
      void (async () => {
        if (authState.phase === 'unpaired') await controller.pairStart()
        await showUserCard('account')
      })()
      return
    }
    if (typeof p.openVerify === 'string') {      void controller.openVerify(p.openVerify)
      return
    }
    if (p.forget === true) {
      void controller.forget()
      return
    }
    if (p.finish === true) {
      // الإنهاء الحقيقي: بطاقةُ البناء تُعرض من المنبثقة، ورفعُ اللقطات
      // واستبدالُ المعرّفات لِـdeliverGuide، والتوست عند الوصول الفعليّ
      void controller.finish()
      armFinishWatchdog()
      return
    }
    if (typeof p.session === 'boolean') {
      if (p.session) {
        session = true
        // جولة تدريب اكتملت (بدءٌ من الحبّة أو القائمة يُحتسب جولة)
        tours += 1
        try {
          localStorage.setItem(TOURS_KEY, String(tours))
        } catch {
          // بلا تخزين — تعود العجلات في الإقلاع القادم، بلا ضرر
        }
        void controller.start(p.voice === true).catch((err: unknown) => {
          console.error('[widget] start:', err)
          session = false
          render()
        })
      } else {
        session = false
        void controller.cancel()
      }
    }
    if (typeof p.paused === 'boolean') {
      if (p.paused) controller.pause()
      else controller.resume()
    }
    if (p.voiceToggle === true) {
      // المرحلة ٢: ميك الشريط يمرّ للمتحكّم — والحصاة ترتدّ بالحالة الصادقة
      void controller.toggleVoice()
      return
    }
    if (typeof p.voice === 'boolean') voice = p.voice
    render()
  })
  // المنبثقة تخفي نفسها من داحلها (بدء جلسة/إنهاء/‏✕) — فيعرف الحصاة
  // أن النقرة القادمة تنبثق لا تخفي
  void listen('widget-popout', (e) => {
    const p = e.payload as { action?: string }
    if (p.action === 'hidden') {
      popoutOpen = false
      openForm = null
    }
  })

  function hidePopout(): void {
    if (!popoutOpen) return
    popoutOpen = false
    pendingCapture = false
    void emit('widget-popout', { action: 'hide' })
  }

  /** النقر على الحصاة: أثناء الإيقاف يُستأنف التسجيل (علامة ▶ على
   *  الحصاة — طلب المالك)، وإن كانت منبثقةٌ مفتوحة أخفاها، وإلّا أنبثق
   *  بطاقة الحالة (قائمة البدء في العدم، شريط التحكّم في الجلسة).
   *  اللقطة والتوست محيطيّان يذوبان وحدهما — نقرتُ الحصاة عليهما تستبدلهما
   *  بالبطاقة المقصودة لا تُخفيهما (بلاغ المالك: النقر أثناء الالتقاط
   *  كان يخفي اللقطة فيبدو كأن القائمة لا تظهر) */
  function togglePopout(): void {
    if (paused) {
      // الاستئناف عبر المتحكّم — وحدث paused يعود من أحداثه
      controller.resume()
      hidePopout()
      return
    }
    if (popoutOpen) {
      if (openForm === 'flash' || openForm === 'toast') {
        pendingCapture = false
        void openPopout()
        return
      }
      hidePopout()
      return
    }
    void openPopout()
  }

  /** شكل العدم: عجلات التدريب تعرض الحبّة الكاملة أول جولتين حصرًا */
  function idleForm(): PopoutForm {
    return tours < 2 ? 'pillz' : 'menu'
  }

  /** حسبة العرض المشتركة: موضع البطاقة الفيزيائيّ فوق الحصاة وحالتها */
  async function showPayload(form: PopoutForm): Promise<Record<string, unknown>> {
    const p = await win.outerPosition()
    const s = await win.outerSize()
    const m = await currentMonitor()
    const sf = m ? m.scaleFactor : 1
    const anchor: AnchorRect = { left: p.x, top: p.y, right: p.x + s.width, bottom: p.y + s.height }
    const pos = popoutAbove(
      anchor,
      POPOUT_SIZES[form],
      sf,
      m ? { x: m.position.x, y: m.position.y, w: m.size.width, h: m.size.height } : null,
    )
    popoutPhys = { x: pos.x, y: pos.y, w: pos.w, h: pos.h }
    openForm = form
    return { form, x: pos.x, y: pos.y, w: pos.w, h: pos.h, sf, anchor, voice, paused, steps, auth: authState }
  }

  /** فتح المنبثقة: موضع البطاقة يُحسب فوق الحصاة ثم يُؤمر بالعرض —
   *  وبلا موضعٍ محسوب لا منبثقة هذه المرة، بلا ضرر */
  async function showCard(form: PopoutForm, extra: Record<string, unknown> = {}): Promise<void> {
    try {
      const payload = await showPayload(form)
      popoutOpen = true
      await emit('widget-popout', { action: 'show', ...payload, ...extra })
    } catch {
      // بلا موضعٍ محسوب — لا بطاقة هذه المرة، بلا ضرر
    }
  }

  async function openPopout(): Promise<void> {
    await showCard(session ? 'strip' : idleForm())
  }

  /** بطاقة اللقطة الحيّة: بكسلات الخطوة الفعلية (data URL) وحلقة العلامة
   *  بموضعها — ولا تُعرض والبطاقات مفتوحة كي لا تُطويها. حالة الانتظار
   *  (pending) تقفز بالرقم المتوقّع قبل وصول البكسلات ثم تُحدَّث بالحقيقة */
  async function openFlash(
    thumbDataUrl: string | null,
    mark?: { x: number; y: number; w: number; h: number },
    opts?: { pending?: boolean; n?: number },
  ): Promise<void> {
    await showCard('flash', {
      ...(opts?.pending ? { pending: true } : {}),
      ...(opts?.n !== undefined ? { steps: opts.n } : {}),
      shot: thumbDataUrl ? { src: thumbDataUrl, ...(mark ? { mark } : {}) } : null,
    })
  }

  /** عرضُ بطاقةٍ عامّ (توست/حساب/إعدادات لاحقًا) بحالتها من المرآة */
  async function showUserCard(form: PopoutForm): Promise<void> {
    pendingCapture = false // بطاقة مستخدم تفتح — أي انتظارٍ مؤقّت انتهى
    await showCard(form)
  }

  // ───────────── السحب والنقر: ضغطة-وحركة (>٦px سحب، والنقرة الهادئة تنبثق) ─────────────
  let press: { x: number; y: number } | null = null
  let dragged = false
  app?.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return
    press = { x: e.clientX, y: e.clientY }
    dragged = false
  })
  window.addEventListener('mousemove', (e) => {
    if (!press || dragged) return
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 6) {
      dragged = true
      hidePopout()
      void win.startDragging()
    }
  })
  window.addEventListener('mouseup', () => {
    // click يُطلق بعد mouseup — التفريغ يؤجَّل دورةً كي تقرأه نقرةُ ما
    // بعد السحب فيُقتل («النقرة بعد السحب ميتة»)
    setTimeout(() => {
      press = null
      dragged = false
    }, 0)
  })
  app?.addEventListener('click', () => {
    if (dragged) return
    togglePopout()
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && popoutOpen) hidePopout()
  })
} else {
  // ───────────── نافذة المنبثقة — تعرض البطاقات وتردّ بالحالة ─────────────
  let sf = 1
  let voice = false
  let paused = false
  let anchor: AnchorRect | null = null
  let form: PopoutForm | null = null
  let flashTimer: ReturnType<typeof setTimeout> | null = null
  // مرآة الاقتران — تصل مع أمر العرض (الرمز السرّي لا يعبر أبدًا)
  let authSnapshot: { phase: string; userCode?: string; email?: string } = { phase: 'unknown' }
  // نصوص حالة الاقتران بوعي اللغة — وما غاب عنها فالرجوع الصادق «غير مربوط»
  function phaseLabel(phase: string): string {
    if (phase === 'paired') return t('dt.paired')
    if (phase === 'pairing') return t('dt.pairing')
    if (phase === 'unknown') return '…'
    return t('dt.notLinked')
  }

  function render(): void {
    if (form) document.body.dataset.form = form
    document.body.classList.toggle('voice', voice)
    document.body.classList.toggle('paused', paused)
    const mic = document.getElementById('stripMic')
    if (mic) mic.title = voice ? t('dt.micLive') : t('dt.mic')
  }

  /** تحوّلٌ داخل المنبثقة: البطاقة التالية بمقاسها وموضعها فوق الحصاة */
  function apply(next: PopoutForm): void {
    form = next
    // تغيّر البطاقة يُطفئ ذوبان لقطةٍ معلّقة (المرجع: closeCards)
    if (flashTimer) {
      clearTimeout(flashTimer)
      flashTimer = null
    }
    render()
    if (!anchor) return
    const pos = popoutAbove(anchor, POPOUT_SIZES[next], sf, null)
    void win.setSize(new PhysicalSize(pos.w, pos.h))
    void win.setPosition(new PhysicalPosition(pos.x, pos.y))
  }

  function hideSelf(): void {
    form = null
    if (flashTimer) {
      clearTimeout(flashTimer)
      flashTimer = null
    }
    // إعلانٌ للحصاة: نُخفي أنفسنا — نقرةُ القادمة تنبثق لا تخفي
    void emit('widget-popout', { action: 'hidden' })
    void win.hide()
  }

  function endSession(): void {
    voice = false
    paused = false
    void emit('widget-state', { session: false, voice: false, paused: false })
    hideSelf()
  }

  // أمر العرض من الحصاة: قائمة/شريط/لقطة بحالة الجلسة والصوت والخطوة
  void listen('widget-popout', (e) => {
    const p = e.payload as {
      action: string
      form?: PopoutForm
      x?: number
      y?: number
      w?: number
      h?: number
      sf?: number
      anchor?: AnchorRect
      voice?: boolean
      paused?: boolean
      steps?: number
      shot?: { src: string; mark?: { x: number; y: number; w: number; h: number } } | null
      /** بطاقة الانتظار: تقفز بالرقم قبل وصول البكسلات ثم تُحدَّث */
      pending?: boolean
      auth?: { phase: string; userCode?: string; email?: string }
    }
    if (p.action === 'hide') {
      hideSelf()
      return
    }
    if (p.action !== 'show' || !p.form || !p.anchor) return
    anchor = p.anchor
    sf = p.sf ?? 1
    voice = !!p.voice
    paused = !!p.paused
    apply(p.form)
    // الجدولة بعد apply حصرًا — apply يُطفئ أيّ مؤقّت سابق (علّة الذوبان)
    if (p.form === 'flash') prepareFlash(p.steps ?? 1, p.shot ?? null, p.pending === true)
    if (p.form === 'toast') armToast()
    authSnapshot = p.auth ?? { phase: 'unknown' }
    if (p.form === 'settings') renderSettings()
    if (p.form === 'account') prepareAccount()
    void win.show()
  })

  /** نصّ حالة صفّ الربط في الإعدادات — من المرآة الحيّة */
  function renderSettings(): void {
    const st = document.getElementById('linkState')
    if (st)
      st.textContent =
        authSnapshot.phase === 'paired' ? t('dt.paired') : authSnapshot.phase === 'unknown' ? '…' : t('dt.notLinked')
  }

  /** بطاقة الحساب: الحالة تُرسم من data-phase والرمز والبريد من المرآة */
  function prepareAccount(): void {
    document.body.dataset.phase = authSnapshot.phase
    const st = document.getElementById('acctState')
    if (st) st.textContent = phaseLabel(authSnapshot.phase)
    const code = document.getElementById('pairCode')
    if (code) code.textContent = authSnapshot.userCode ?? '····-····'
    const mail = document.getElementById('acctMail')
    if (mail) mail.textContent = authSnapshot.email ?? ''
  }

  /** عدّاد الخطوات الحقيقيّ يبثّه المتحكّم صدىً من الحصاة — للتأكيد والتوست.
   *  آخر حملة تُحفظ كي يعيد تبديلُ اللغة رسمها بالنصّ الجديد */
  let lastStatePayload: { steps?: number; voice?: boolean } | null = null
  function applyStatePayload(p: { steps?: number; voice?: boolean }): void {
    if (typeof p.voice === 'boolean') {
      // صدى الحالة من الحصاة: نقطة الميك في الشريط المفتوح تحيا فورًا
      voice = p.voice
      render()
    }
    if (typeof p.steps !== 'number') return
    const n = document.getElementById('confirmN')
    if (n) n.textContent = t('dt.stepsN', { n: arDigits(p.steps) })
    const ts = document.getElementById('toastSub')
    if (ts) ts.textContent = t('dt.stepsN', { n: arDigits(p.steps) })
  }
  void listen('widget-state', (e) => {
    const p = e.payload as { steps?: number; voice?: boolean }
    lastStatePayload = p
    applyStatePayload(p)
  })

  // أزرار الترس (القائمة والحبّة) تفتح الإعدادات — آليّة التطبيق الأول (طلب المالك)
  for (const id of ['menuGear', 'pillzGear']) {
    document.getElementById(id)?.addEventListener('click', (e) => {
      e.stopPropagation()
      apply('settings')
    })
  }
  // صفوف الإعدادات الثلاثة: الربط يفتح بطاقة الحساب (ويبدأ الربط إن لزم — قرار
  // الحصاة)، واللغة تتبدّل فورًا، وإنهاء التطبيق هو الإغلاق الرسميّ الوحيد
  document.getElementById('rowLink')?.addEventListener('click', (e) => {
    e.stopPropagation()
    void emit('widget-state', { account: true })
  })
  // I18N-01: صفّ اللغة — تبديل عربي ⇄ إنجليزي يُطبَّق حيًّا على كل نصوص البطاقات
  document.getElementById('rowLocale')?.addEventListener('click', (e) => {
    e.stopPropagation()
    setLocale(readLocale() === 'ar' ? 'en' : 'ar')
  })
  subscribeLocale(() => {
    render()
    if (document.getElementById('settingsBox')) renderSettings()
    if (document.getElementById('accountBox')) prepareAccount()
    if (lastStatePayload) applyStatePayload(lastStatePayload)
  })
  document.getElementById('rowExit')?.addEventListener('click', (e) => {
    e.stopPropagation()
    void emit('widget-state', { exit: true })
  })
  // بطاقة الحساب: الربط وفتح صفحة الموافقة وفكّ الربط — الحصاة مصدر الحقيقة
  document.getElementById('btnPair')?.addEventListener('click', (e) => {
    e.stopPropagation()
    void emit('widget-state', { account: true })
  })
  document.getElementById('btnOpenVerify')?.addEventListener('click', (e) => {
    e.stopPropagation()
    const code = authSnapshot.userCode
    if (code) void emit('widget-state', { openVerify: code })
  })
  document.getElementById('btnCancelPair')?.addEventListener('click', (e) => {
    e.stopPropagation()
    apply('settings')
  })
  document.getElementById('btnForget')?.addEventListener('click', (e) => {
    e.stopPropagation()
    void emit('widget-state', { forget: true })
  })

  /** لحظة الالتقاط: رقم الخطوة وشارة الصوت واللقطة الحقيقية بحلقة العلامة
   *  على موضعها الفعلي — ثم ذوبان بعد ٢.٣ث (مدّة المرجع). الانتظار (pending)
   *  يقفز أولًا بالرقم وحده: صندوق اللقطة ينبض هادئًا حتى تصل البكسلات في
   *  إعادة عرضٍ تُحدّث البطاقة في مكانها ويعيد عدّاد الذوبان (بلاغ المالك:
   *  المستخدم يرى أثر نقرته فورًا لا بعد ثانية) */
  function prepareFlash(
    step: number,
    shot: { src: string; mark?: { x: number; y: number; w: number; h: number } } | null,
    pending = false,
  ): void {
    const label = document.getElementById('flashStep')
    if (label) label.textContent = t('dt.stepN', { n: arDigits(step) })
    const fv = document.getElementById('flashVoice')
    if (fv) fv.hidden = !voice
    const img = document.getElementById('shotImg') as HTMLImageElement | null
    const ring = document.getElementById('shotRing')
    const shotBox = img?.parentElement ?? null
    if (shotBox) shotBox.classList.toggle('wait', pending || !shot)
    if (ring) ring.style.display = 'none'
    flashTimer = setTimeout(() => {
      flashTimer = null
      hideSelf()
    }, 2300)
    if (!shot || !img || !ring) return
    img.onload = () => {
      // احتواء الصورة في صندوق اللقطة ثم حلقة العلامة بمقياسها الفعلي
      const box = img.parentElement
      const iw = img.naturalWidth
      const ih = img.naturalHeight
      if (!box || !iw || !ih) return
      const scale = Math.min(box.clientWidth / iw, box.clientHeight / ih)
      const rw = iw * scale
      const rh = ih * scale
      img.style.width = rw + 'px'
      img.style.height = rh + 'px'
      const m = shot.mark
      if (m) {
        const d = Math.max(m.w, m.h) * scale
        ring.style.display = 'block'
        ring.style.width = d + 'px'
        ring.style.height = d + 'px'
        ring.style.left = (m.x + m.w / 2) * scale + (box.clientWidth - rw) / 2 - d / 2 + 'px'
        ring.style.top = (m.y + m.h / 2) * scale + (box.clientHeight - rh) / 2 - d / 2 + 'px'
      }
    }
    img.src = shot.src
  }

  // قائمة البدء والحبّة الكاملة (عجلات التدريب): الخيارات الأربعة تبدأ
  // الجلسة وتخفي المنبثقة (الحصاة تبقى بنبضتها)
  for (const id of ['btnCap', 'btnCapV', 'btnPillz', 'btnPillzV']) {
    document.getElementById(id)?.addEventListener('click', (e) => {
      e.stopPropagation()
      voice = id === 'btnCapV' || id === 'btnPillzV'
      void emit('widget-state', { session: true, voice, paused: false })
      hideSelf()
    })
  }
  // الشريط: ✕ يخفيه (الجلسة باقية)، الإيقاف يفتح الشريحة، الإلغاء
  // التأكيد، الميك يبدّل مكانه، والإنهاء يمرّ بالبناء والتوست
  document.getElementById('stripHide')?.addEventListener('click', (e) => {
    e.stopPropagation()
    hideSelf()
  })
  /** متابعة التسجيل بعد الإيقاف — من زرّ الإيقاف أو من الشريحة نفسها */
  function resume(): void {
    paused = false
    void emit('widget-state', { paused: false })
    apply('strip')
  }

  document.getElementById('stripPause')?.addEventListener('click', (e) => {
    e.stopPropagation()
    if (paused) {
      resume()
    } else {
      paused = true
      // الحصاة تعرف: نبضتها تتوقف وتظهر علامة ▶ (النقر عليها يُستأنف)
      void emit('widget-state', { paused: true })
      apply('chip')
    }
  })
  document.getElementById('stripCancel')?.addEventListener('click', (e) => {
    e.stopPropagation()
    apply('confirm')
  })
  document.getElementById('stripMic')?.addEventListener('click', (e) => {
    e.stopPropagation()
    // المرحلة ٢: الميك قرارُ صوتٍ لا شعارًا — الحصاة (والمتحكّم) مصدر الحقيقة:
    // جلسة «مع تعليق صوتي» ⇐ مفتاح التعلّق التلقائي كله، وجلسة عادية ⇐ تعليق يدويّ
    void emit('widget-state', { voiceToggle: true })
    render()
    // طلب المالك: اختيار الميك يخفي القائمة — والحصاة تعلن بالمايك الأحمر
    hideSelf()
  })
  document.getElementById('stripFinish')?.addEventListener('click', (e) => {
    e.stopPropagation()
    // الإنهاء الحقيقي: بطاقة البناء تجري بينما يجمع المتحكّم الدليل ويسلّمه
    // للطابور، والحصاة تأمر بالتوست عند التسليم (أو تخفي عند الفشل الصادق)
    void emit('widget-state', { finish: true })
    apply('build')
  })
  // «تراجع» في بطاقة اللقطة (قرار المالك: بلا حذفٍ حقيقي) — تذوّب البطاقة
  document.getElementById('btnUndo')?.addEventListener('click', (e) => {
    e.stopPropagation()
    hideSelf()
  })

  // شريحة الإيقاف: النقر عليها يُتابع التسجيل — تعود الشريط بنبضةٍ موقوفة الهدوء
  document.getElementById('chipPaused')?.addEventListener('click', (e) => {
    e.stopPropagation()
    resume()
  })
  // بطاقة التأكيد: «نعم، احذف الكل» ينهي الجلسة، «متابعة التسجيل» يعيد الشريط
  document.getElementById('btnYes')?.addEventListener('click', (e) => {
    e.stopPropagation()
    endSession()
  })
  document.getElementById('btnNo')?.addEventListener('click', (e) => {
    e.stopPropagation()
    apply('strip')
  })

  /** توست الوصول: يأمر به الحصاة بعد تسليمٍ حقيقيٍّ (المتحكّم يجمع الدليل
   *  أثناء بطاقة البناء) — ويذوب بعد ٣.٤ث صامتًا (مدّة المرجع) */
  function armToast(): void {
    setTimeout(() => {
      if (form !== 'toast') return
      endSession()
    }, 3400)
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    // البناء والتوست مسارٌ غير مقاطوع — Esc لا يوقفهما
    if (form === 'build' || form === 'toast') return
    hideSelf()
  })
}
