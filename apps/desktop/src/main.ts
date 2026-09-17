import { zGuide } from '@dalili/shared'
import { invoke } from '@tauri-apps/api/core'
import { PhysicalPosition, getCurrentWindow } from '@tauri-apps/api/window'
import { createRecorderSession, type RecorderSession } from './recorder/session'
import {
  createDesktopAuth,
  createDesktopDelivery,
  createTauriBridge,
} from './recorder/bridge'
import { deliverGuide } from './recorder/deliver'
import {
  initialWidgetState,
  reduceWidget,
  type WidgetAction,
  type WidgetState,
} from './recorder/widget'
import { restorePlacement, trackPlacement, type WidgetWindow } from './recorder/placement'
import {
  initialAuthUiState,
  reduceAuthUi,
  type AuthUiAction,
  type AuthUiState,
} from './recorder/auth-ui'

/** لوحة الودجة (٣هـ-٢) — عرضٌ رقيق يرسم حالة المُصغِّر النقيّ (widget.ts)
 *  ويُصدِر أفعالًا: أزرار لكل وضع، نقطة نبض، وعدّاد حيّ من أحداث المستشعرات.
 *  الإيقاف المؤقّت سياسة جلسة TS (بوّابة sensor://input في session.ts) —
 *  ‏recording_pause في Rust يبقى no-op موثَّقًا لا يُتّكأ عليه. خطّ التسليم
 *  ‏(deliverGuide، ٣د-٣) مستهلَك كما هو بلا مساس — لا شبكة هنا ولا في أيّ وضع. */

const app = document.getElementById('app')
if (app) {
  let widget: WidgetState = { ...initialWidgetState }
  let auth: AuthUiState = { ...initialAuthUiState }
  let session: RecorderSession | null = null
  let currentSessionId: string | null = null
  let unlisten: Array<() => void> = []

  const row = document.createElement('div')
  row.className = 'row'
  const status = document.createElement('p')
  status.textContent = 'جاهز — اضغط «بدء» ثم اعمل في تطبيقك.'
  app.replaceChildren(row, status)

  // ثبات موضع الودجة (٣هـ-٣): استرجاع آخر موضع عند الإقلاع وتتبّع السحب بحفظٍ
  // مُخنَّق — كل المسارات try/catch داخل placement.ts فلا فشل يهرب للمستخدم
  // مستطيل الودجة الفيزيائيّ الحيّ (إصلاح برهان المالك): بوّابة الجلسة تستثني
  // أيّ نقرة داخلَه — نقرات أزرار الودجة واجهةٌ لا عمل مستخدم. يُحدَّث عند
  // الإقلاع ومع كل سحب (onMoved)؛ فشل القراءة ⇒ بلا فلتر لحظتها فلا ضرر.
  // لا Rust ولا شبكة — قراءتا outerPosition/outerSize بنفس الفضاء الفيزيائيّ
  // الذي يرسل به الخطّاف إحداثيّات النقر (عقد ٣ب §٣.٢).
  let ownRect: { x: number; y: number; w: number; h: number } | null = null
  const refreshOwnRect = async (): Promise<void> => {
    try {
      const w = getCurrentWindow()
      const [pos, size] = await Promise.all([w.outerPosition(), w.outerSize()])
      ownRect = { x: pos.x, y: pos.y, w: size.width, h: size.height }
    } catch {
      ownRect = null
    }
  }
  const ignorePoint = (x: number, y: number): boolean =>
    ownRect !== null &&
    x >= ownRect.x &&
    x <= ownRect.x + ownRect.w &&
    y >= ownRect.y &&
    y <= ownRect.y + ownRect.h

  const widgetWindow: WidgetWindow = {
    outerPosition: async () => {
      const p = await getCurrentWindow().outerPosition()
      return { x: p.x, y: p.y }
    },
    setPosition: (p) => getCurrentWindow().setPosition(new PhysicalPosition(p.x, p.y)),
    onMoved: (h) => {
      let un: (() => void) | undefined
      void getCurrentWindow()
        .onMoved((p) => {
          void refreshOwnRect()
          h({ x: p.payload.x, y: p.payload.y })
        })
        .then((f) => {
          un = f
        })
      return () => un?.()
    },
  }
  void refreshOwnRect()
  void restorePlacement(widgetWindow, localStorage)
  trackPlacement(widgetWindow, localStorage)

  // الاقتران (اق-٢) — توصيل فوق createDesktopAuth القائم، بلا منطق نقل:
  // الرمز السرّي في خزنة ويندوز وحده، والحالة هنا بريد ورمز موافقة فحسب
  const ipcAuth = createDesktopAuth()
  const authDispatch = (a: AuthUiAction): void => {
    auth = reduceAuthUi(auth, a)
    render()
  }
  void ipcAuth.status().then((st) =>
    authDispatch({ t: 'status', paired: st.paired, email: st.email }),
  )
  ipcAuth.onAuthEvent('auth://paired', (p) => {
    const email = (p as { email?: string }).email
    authDispatch({ t: 'paired', email })
  })
  ipcAuth.onAuthEvent('auth://lost', (p) => {
    const reason = (p as { reasonAr?: string }).reasonAr
    if (reason) status.textContent = reason
    authDispatch({ t: 'lost' })
  })

  // تقدّم الرفع (اق-٣ + تمهيد ٣و): عدّاد عرضٍ فقط فوق أحداث البثّ — مستمعٌ
  // ثانٍ بمعزلٍ عن مستمع deliverGuide الداخلي، **مُرشَّح بـsessionId** كي لا
  // تختلط أحداث جلسات متتالية، والفتح يبقى داخله حصرًا
  const ipcDelivery = createDesktopDelivery()
  let uploadSessionId: string | null = null
  let uploadDone = 0
  let uploadTotal = 0
  const clearUploadTracking = (): void => {
    uploadSessionId = null
    uploadDone = 0
    uploadTotal = 0
  }
  ipcDelivery.onUploaded((e) => {
    if (uploadTotal === 0 || uploadDone >= uploadTotal) return
    if (e.sessionId !== uploadSessionId) return
    uploadDone += 1
    if (uploadDone < uploadTotal) {
      status.textContent = `جارٍ الرفع… ${uploadDone}/${uploadTotal}`
    }
  })

  async function startPairing(): Promise<void> {
    try {
      // اسم جهاز ثابت وصفيّ — لا بيانات مستخدم في الطلب
      const info = await ipcAuth.pairStart('إتقان — سطح المكتب')
      authDispatch({ t: 'start', userCode: info.userCode })
      status.textContent = `رمز الموافقة: ${info.userCode} — أكمل في المتصفّح الذي فُتح.`
      await ipcAuth.openVerify(info.userCode)
    } catch (e) {
      status.textContent = `تعذّر بدء الاقتران: ${String(e)}`
      authDispatch({ t: 'lost' })
    }
  }

  async function unpair(): Promise<void> {
    try {
      await ipcAuth.forget()
      status.textContent = 'فُصل الجهاز عن الحساب.'
    } catch (e) {
      status.textContent = `تعذّر الفصل: ${String(e)}`
    } finally {
      authDispatch({ t: 'forget' })
    }
  }

  const dispatch = (a: WidgetAction): void => {
    widget = reduceWidget(widget, a)
    render()
  }

  // عناصر الودجة تُبنى مرّة واحدة ويُحدَّث عرضها بالخصائص حصرًا (إصلاح برهان
  // المالك): كان render يعيد replaceChildren عند كل حدث مستشعر — الضغطة نفسها
  // كانت تستبدل الزرّ بين نزولها ورفعها فيموت الحدث click ولا يعمل ⏸/⏹
  // أصلًا. بهويّة عنصر ثابتة تنجو النقرة مهما تلاحقت الأحداث، وrender عند كل
  // نبضة يصير رخيصًا (تحديث خصائص لا إعمار DOM).
  const dot = document.createElement('span')
  const mode = document.createElement('span')
  mode.className = 'mode'
  const count = document.createElement('span')
  count.className = 'count'
  const primaryBtn = document.createElement('button')
  const stopBtn = document.createElement('button')
  stopBtn.textContent = '⏹'
  stopBtn.title = 'إيقاف وبناء الدليل'
  stopBtn.addEventListener('click', () => void stopFlow())
  const authDot = document.createElement('span')
  const email = document.createElement('span')
  email.className = 'email'
  const authBtn = document.createElement('button')
  row.replaceChildren(dot, mode, count, primaryBtn, stopBtn, authDot, email, authBtn)

  // أفعال الزرّين المتغيّرة حسب الوضع — تُعاد كتابتُها في render والعنصر نفسه باقٍ
  let primaryAction: (() => void) | null = null
  let authBtnAction: (() => void) | null = null
  primaryBtn.addEventListener('click', () => primaryAction?.())
  authBtn.addEventListener('click', () => authBtnAction?.())

  function render(): void {
    const rec = widget.mode === 'recording'
    const held = widget.mode === 'paused'
    dot.className = rec ? 'dot rec' : 'dot held'
    dot.hidden = !(rec || held)
    mode.hidden = !(rec || held)
    mode.textContent = rec ? 'تسجيل' : 'مُوقَت'
    count.hidden = !(widget.steps > 0)
    count.textContent = String(widget.steps)

    if (widget.mode === 'idle') {
      primaryAction = () => void start()
      primaryBtn.textContent = '▶'
      primaryBtn.title = 'بدء التسجيل'
      primaryBtn.hidden = false
    } else if (rec) {
      primaryAction = () => {
        session?.pause()
        dispatch('pause')
      }
      primaryBtn.textContent = '⏸'
      primaryBtn.title = 'إيقاف مؤقّت'
      primaryBtn.hidden = false
    } else if (held) {
      primaryAction = () => {
        session?.resume()
        dispatch('resume')
      }
      primaryBtn.textContent = '▶'
      primaryBtn.title = 'استئناف التسجيل'
      primaryBtn.hidden = false
    } else {
      // building: بلا زرّ أساسيّ — البناء والتسليم جارٍ
      primaryAction = null
      primaryBtn.hidden = true
    }
    stopBtn.hidden = !(rec || held)

    // الاقتران (اق-٢): نقطة الحالة دائمًا، والزرّان في idle حصرًا توفيرًا
    // للفضاء الضيّق — الربط لا يُبدأ وسط تسجيلٍ جارٍ
    authDot.hidden = auth.phase === 'unknown'
    authDot.className =
      auth.phase === 'paired'
        ? 'dot auth-ok'
        : auth.phase === 'pairing'
          ? 'dot auth-wait'
          : 'dot'
    email.hidden = !(auth.phase === 'paired' && !!auth.email)
    email.title = auth.email ?? ''
    email.textContent = auth.email ?? ''
    const showPair = widget.mode === 'idle' && auth.phase === 'unpaired'
    const showForget = widget.mode === 'idle' && auth.phase === 'paired'
    authBtn.hidden = !(showPair || showForget)
    if (showPair) {
      authBtn.textContent = 'اقتران'
      authBtn.title = 'ربط الجهاز بحسابك على الويب'
      authBtnAction = () => void startPairing()
    } else if (showForget) {
      authBtn.textContent = 'فصل'
      authBtn.title = 'فصل الجهاز عن الحساب'
      authBtnAction = () => void unpair()
    } else {
      authBtnAction = null
    }
  }

  async function start(): Promise<void> {
    try {
      const bridge = createTauriBridge()
      // بوّابة استثناء الودجة نفسها: نقرات أزرارها واجهةٌ لا خطوات
      const s = createRecorderSession(bridge, { ignorePoint })
      // العدّاد مزامَن من حقيقة الجلسة (stepCount) لا من عدّ الأحداث: نقرات
      // الودجة المستثناة لا تزيده، وخطوات navigate تُحسَب كما هي، وtick
      // (كل 50مث) يجرّ آخر الحالات المبنية خلال ≤ نبضة واحدة
      const syncCount = (): void => {
        if (session) dispatch({ t: 'count', steps: session.stepCount() })
      }
      unlisten = [
        bridge.listen('sensor://input', syncCount),
        bridge.listen('sensor://facts', syncCount),
        bridge.listen('sensor://tick', syncCount),
      ]
      await bridge.ready() // كل الاشتراكات عبر IPC قبل أوّل نبضة كي لا يُفوَّت شيء
      const ack = await invoke<{ sessionId: string }>('recording_start')
      currentSessionId = ack.sessionId
      session = s
      dispatch('start')
      status.textContent = 'جارٍ التسجيل — اعمل في تطبيقك، والعدّاد هنا.'
    } catch (e) {
      status.textContent = `تعذّر بدء التسجيل: ${String(e)}`
    }
  }

  async function stopFlow(): Promise<void> {
    if (!session) return
    dispatch('stop') // building فورًا — لا نقر مزدوج أثناء الإنهاء
    try {
      const guide = await session.stop()
      dispatch({ t: 'count', steps: guide.steps.length }) // العدد النهائيّ الحقيقيّ
      await invoke('recording_stop')
      const ok = zGuide.safeParse(guide).success
      const saved = ok
        ? `انتهى التسجيل — دليل v2 صالح (${guide.steps.length} خطوة).`
        : 'انتهى التسجيل — خلل في العقد، راجع التركيب.'
      // حارس «غير مقترن» (اق-٣): العامل يتوقّف بلا رمز فلا يُحلّ التسليم —
      // نصّ صريح بدل تعليقٍ صامت. التسليم **يُطلَق دائمًا**: الطابور لا يمتلئ
      // إلا داخله (نسخ اللقطات إلى القرص) فيبقى محفوظًا ويُستأنف بعد الاقتران
      status.textContent =
        ok && auth.phase !== 'paired'
          ? `${saved} حُفظ محليًّا — اقترن لِنشره؛ يُستأنف الرفع بعد الاقتران.`
          : saved
      // التسليم (٣د-٣) كما هو بلا مساس: طابور اللقطات ⇐ استبدال المعرّفات ⇐
      // تسليم الدليل ⇐ فتح — كل الشبكة في Rust وهنا أوامرُ IPC وأحداث اشتراك فقط
      if (currentSessionId) {
        uploadDone = 0
        uploadSessionId = currentSessionId
        // N = لقطات الجلسة ذات المعرّف المحلّيّ (كما تميّزها deliverGuide)
        uploadTotal = guide.steps.filter((s) => {
          const shot = s.screenshot
          return !!shot && !('missing' in shot) && /^f-\d+$/.test(shot.fileId)
        }).length
        const d = deliverGuide(currentSessionId, guide, ipcDelivery, ipcDelivery)
        void d.submitted.then(
          () => {
            status.textContent = 'جارٍ إنشاء الدليل على حسابك…'
          },
          (e) => {
            clearUploadTracking() // مسار الخطأ لا يحمل تقدّمًا معلّقًا (تمهيد ٣و)
            status.textContent = `تعذّر تسليم الدليل: ${String(e)} — العناصر باقية في الطابور`
          },
        )
        void d.delivered.then(
          (id) => {
            clearUploadTracking()
            status.textContent = `الدليل جاهز على الويب: /g/${id}`
          },
          (e) => {
            clearUploadTracking()
            status.textContent = `تعذّر فتح الدليل: ${String(e)}`
          },
        )
      }
    } catch (e) {
      status.textContent = `تعذّر بناء الدليل: ${String(e)}`
    } finally {
      for (const u of unlisten) u()
      unlisten = []
      session = null
      currentSessionId = null
      dispatch('done')
    }
  }

  render()
}

export {}
