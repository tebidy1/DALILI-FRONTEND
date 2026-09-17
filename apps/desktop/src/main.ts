import { zGuide } from '@dalili/shared'
import type { ScreenshotMeta } from '@dalili/core'
import { invoke } from '@tauri-apps/api/core'
import { LogicalSize, PhysicalPosition, currentMonitor, getCurrentWindow } from '@tauri-apps/api/window'
import { createRecorderSession, type RecorderSession } from './recorder/session'
import { thumbLayout } from './recorder/thumb-layout'
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
import { restorePlacement, trackPlacement, bottomRightPosition, type WidgetWindow } from './recorder/placement'
import {
  initialAuthUiState,
  reduceAuthUi,
  type AuthUiAction,
  type AuthUiState,
} from './recorder/auth-ui'
import { createArm } from './recorder/arm'
import { createExpander, PILL_SIZE, type SizeWindow } from './recorder/expand'
import { arDigits, countPhrase, kindLabel } from './recorder/panel-text'

/**
 * لوحة الودجة بحالتين (توصية UX الموافق عليها 2026-09-17): حبة ٣٢٠×٧٢ وقت
 * الخمول، ولوحة زجاجية شفّافة وقت التسجيل ترى التطبيقَ الهدف من خلالها
 * (expand.ts يقيس والنافذة شفّافة بالإعداد). تجربة الإضافة منقولة دالًّا:
 * أسماء الأزرار نفسها (إيقاف/استئناف/إنهاء الالتقاط)، وإلغاء بنقرتين (arm)،
 * وقائمة خطوات حيّة بعناوين مولّد النواة نفسه، وبريدُ المستخدم وفصلُ الدخول
 * خلف الترس لا على السطح (قرار المالك). الهيكل ثابت في index.html والعرض هنا
 * يحدّث الخصائص حصرًا (درس برهان المالك: إعمار الزر بين نزول الضغطة ورفعها
 * يقتل الحدث). لا شبكة هنا — النقل كلّه ٣د عبر deliverGuide كما هو.
 */

/** ارتفاعا الحالتين بالمنطقيّ — لوحة التسجيل ≈ نصف طول لوحة الإضافة (بطاقة وربع) */
const PANEL_HEIGHT = 400
/** الإعدادات: كتلة الاقتران + فاصل + «إنهاء التطبيق» (طلب المالك ٢٠٢٦-٠٩-١٧) */
const SETTINGS_HEIGHT = 240

const app = document.getElementById('app')
if (app) {
  const $ = (id: string): HTMLElement => {
    const el = document.getElementById(id)
    if (!el) throw new Error(`عنصر القشرة غائب: #${id}`)
    return el
  }
  const shell = $('shell')
  const pill = $('pill')
  const startBtn = $('startBtn') as HTMLButtonElement
  const authDot = $('authDot')
  const gearBtn = $('gearBtn') as HTMLButtonElement
  const status = $('status')
  const panel = $('panel')
  const chip = $('chip')
  const chipText = $('chipText')
  const countEl = $('count')
  const pauseBtn = $('pauseBtn') as HTMLButtonElement
  const cancelBtn = $('cancelBtn') as HTMLButtonElement
  const finishBtn = $('finishBtn') as HTMLButtonElement
  // نصّا الزرّين تتبدّل في render والأيقونات SVG ثابتة في HTML — blurBtn
  // معطَّل دائمًا من HTML (الطمس آليّ) فلا مرجعًا له ولا مستمعًا
  const pauseTxt = $('pauseTxt')
  const cancelTxt = $('cancelTxt')
  const stepsEl = $('steps')
  const settingsView = $('settings')
  const authStatus = $('authStatus')
  const emailText = $('emailText')
  const pairBtn = $('pairBtn') as HTMLButtonElement
  const forgetBtn = $('forgetBtn') as HTMLButtonElement
  const backBtn = $('backBtn') as HTMLButtonElement
  const exitBtn = $('exitBtn') as HTMLButtonElement

  let widget: WidgetState = { ...initialWidgetState }
  let auth: AuthUiState = { ...initialAuthUiState }
  let session: RecorderSession | null = null
  let currentSessionId: string | null = null
  let unlisten: Array<() => void> = []
  let settingsOpen = false
  let lastSteps = -1
  const arm = createArm()

  /** كل كتابة حالة عبر هذا — يطفي إضاءة النجاح عن الكتابات اللاحقة */
  const setStatus = (text: string): void => {
    status.classList.remove('ok')
    status.textContent = text
  }

  // مستطيل الودجة الفيزيائيّ الحيّ (إصلاح برهان المالك): نقرات الودجة واجهةٌ
  // لا خطوات. يُحدَّث عند الإقلاع وكل سحب و**كل تغيير مقاس** (التوسعة
  // للوحة تُغيّر المستطيل — من تحديثه تُسجَّل نقرات اللوحة خطواتٍ)
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
  // الموضع الطبيعي (طلب المالك ٢٠٢٦-٠٩-١٧): آخر موضعٍ سحبه المستخدم ينتصر،
  // وعند غياب أيّ حفظ تُقلع الودجة في الركن السفلي الأيمن للشاشة الحالية —
  // يُحسب على مقاس الحبة (PILL_SIZE) فتُطبَع الإحداثيات قبل أيّ توسعة
  void restorePlacement(widgetWindow, localStorage).then((restored) => {
    if (restored) return
    void (async () => {
      try {
        const m = await currentMonitor()
        if (!m) return
        const sf = m.scaleFactor
        const pos = bottomRightPosition(
          { position: m.position, size: m.size, scaleFactor: sf },
          { width: Math.round(PILL_SIZE.width * sf), height: Math.round(PILL_SIZE.height * sf) },
        )
        await getCurrentWindow().setPosition(new PhysicalPosition(pos.x, pos.y))
        void refreshOwnRect()
      } catch {
        // لا موضع محفوظ ولا ركن محسوب — وضع الإعداد (الوسط) يبقى، بلا ضرر
      }
    })()
  })
  trackPlacement(widgetWindow, localStorage)
  // تغيير المقاس (توسعة/انكماش) لا يطلق onMoved بالضرورة — مستطيل الاستثناء يُحدَّث هنا أيضًا
  void getCurrentWindow().onResized(() => void refreshOwnRect())

  // السحب اليدوي للودجة (طلب المالك ٢٠٢٦-٠٩-١٧): سمة data-tauri-drag-region
  // وحدها لا تكفي — فحص Tauri للعنصر الهدف حصرًا والأبناء يغطّون السطح كله.
  // نتفوّض هنا: أي ضغطة يسارى على سطحٍ غير تفاعلي تحرّك الودجة، والأزرار
  // وقائمة الخطوات (لتمريرها باليد) تبقى للنقر حصرًا
  shell.addEventListener('mousedown', (e) => {
    if (e.buttons !== 1 || e.detail !== 1) return
    const t = e.target as Element | null
    if (t && t.closest('button, .steps')) return
    void getCurrentWindow().startDragging()
  })

  // توسعة/انكماش الودجة — الحافة العليا ثابتة، والانزياح للأعلى عند الحاجة
  const sizeWin: SizeWindow = {
    outerPosition: widgetWindow.outerPosition,
    setSize: (s) => getCurrentWindow().setSize(new LogicalSize(s.width, s.height)),
    setPosition: (p) => getCurrentWindow().setPosition(new PhysicalPosition(p.x, p.y)),
  }
  const expander = createExpander(sizeWin, async () => {
    const m = await currentMonitor()
    return m
      ? {
          position: { x: m.position.x, y: m.position.y },
          size: { width: m.size.width, height: m.size.height },
          scaleFactor: m.scaleFactor,
        }
      : null
  })
  // مصالحة الإقلاع (بلاغ المالك الثاني): إعادة تحميل صفحة الواجهة وسط جلسة
  // (ظاهرة وضع التطوير الأولى) تُرجع الحالة خمولًا وتترك النافذة موسَّعةً
  // يتيمة — فالإقلاع يضبط المقاس على الحبة دائمًا فتبقى الواجهة والنافذة في
  // وجهٍ واحد مهما حدث
  void expander.collapse()

  // الاقتران (اق-٢) — الرمز السرّي في خزنة ويندوز وحده، والحالة هنا بريد ورمز موافقة فحسب
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
    if (reason) setStatus(reason)
    authDispatch({ t: 'lost' })
  })

  // تقدّم الرفع (اق-٣ + تمهيد ٣و): عدّاد عرضٍ فقط مُرشَّح بـsessionId
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
      setStatus(`جارٍ الرفع… ${uploadDone}/${uploadTotal}`)
    }
  })

  const dispatch = (a: WidgetAction): void => {
    widget = reduceWidget(widget, a)
    render()
  }

  /** صفّ الخطوة النصّيّ (رقم هندي + عنوان + نوع) — مشترك بين القائمة والبطاقة الأحدث */
  function buildStepRow(s: { title: string; kind: string }, i: number, fresh: boolean): HTMLDivElement {
    const row = document.createElement('div')
    row.className = fresh ? 'step-row fresh' : 'step-row'
    const n = document.createElement('span')
    n.className = 'n'
    n.textContent = arDigits(i + 1)
    const tx = document.createElement('span')
    tx.className = 'tx'
    const ttl = document.createElement('span')
    ttl.className = 'ttl'
    ttl.textContent = s.title
    ttl.title = s.title
    const kd = document.createElement('span')
    kd.className = 'kd'
    kd.textContent = kindLabel(s.kind)
    tx.append(ttl, kd)
    row.append(n, tx)
    return row
  }

  /** مصغّرة البطاقة الأحدث (تكافؤ PreviewShot في الإضافة): بكسلات اللقطة بـ
   *  frame_thumb ثم zoomFrame يوسّط حلقة النقرة ويكبّرها. فشل الجلب ⇐ النائب
   *  يزول والبطاقة تبقى بلا صورة بصدق — لا تعليق أبديّ ولا صورة مكسورة */
  async function renderThumb(box: HTMLElement, shot: ScreenshotMeta): Promise<void> {
    try {
      const { dataUrl } = await invoke<{ dataUrl: string }>('frame_thumb', { localId: shot.fileId })
      const img = new Image()
      img.decoding = 'async'
      img.src = dataUrl
      await img.decode().catch(() => {})
      const natW = img.naturalWidth
      const natH = img.naturalHeight
      // يُقاس بعد العلّق (نداء frame_thumb أطول من بناء القائمة) والقيمان
      // احتياطٌ لأول رسم قبل تخطيط CSS
      const viewW = box.clientWidth || 288
      const viewH = box.clientHeight || 132
      const layout = shot.mark ? thumbLayout(shot.mark.rect, natW, natH, viewW, viewH) : null
      box.dataset.pending = ''
      box.replaceChildren()
      const layer = document.createElement('div')
      layer.className = 'shot-zoom'
      if (layout) {
        layer.style.transform = layout.layerTransform
        layer.style.transformOrigin = '0 0'
      }
      layer.append(img)
      if (layout) {
        const ring = document.createElement('span')
        ring.className = 'shot-mark' // حلقة فارغة عبر border-radius في CSS
        Object.assign(ring.style, {
          left: `${layout.markPct.left}%`,
          top: `${layout.markPct.top}%`,
          width: `${layout.markPct.width}%`,
          height: `${layout.markPct.height}%`,
        })
        layer.append(ring)
      }
      box.append(layer)
    } catch {
      box.dataset.pending = ''
    }
  }

  /** كتابة صادقة لا تجري unless تغيّر — عدّاد ولقطة القائمة معًا */
  function refreshStepList(): void {
    if (!session) return
    const sess = session // الإغلاق أدناه يفقد التضييق — مرجع محليّ مؤكَّد
    const summaries = sess.stepSummaries()
    const frag = document.createDocumentFragment()
    summaries.forEach((s, i) => {
      const isLast = i === summaries.length - 1
      // البطاقة الأحدث: مصغّرة بحلقة (تكافؤ الإضافة) — لقطة ناجحة بعلامة حصرًا؛
      // الأقدم تبقى صفوفًا نصّيّة (نفس انطواء الإضافة بلا زر كشف في هذه المرحلة)
      const shot = isLast ? sess.latestShot() : null
      if (shot && !('missing' in shot) && shot.mark && /^f-\d+$/.test(shot.fileId)) {
        const card = document.createElement('div')
        card.className = 'step-card fresh'
        const shotBox = document.createElement('div')
        shotBox.className = 'step-shot'
        shotBox.dataset.pending = '1' // «يرسم التحديد…» حتى تصل البكسلات
        card.append(buildStepRow(s, i, false), shotBox)
        frag.append(card)
        void renderThumb(shotBox, shot)
      } else {
        frag.append(buildStepRow(s, i, isLast))
      }
    })
    stepsEl.replaceChildren(frag)
    stepsEl.scrollTop = stepsEl.scrollHeight // الأحدث أسفل القائمة كما في الإضافة
  }

  // العدّاد مزامَن من حقيقة الجلسة (stepCount): نقرات الودجة المستثناة لا تزيده،
  // وtick يجرّ آخر المبنيّ. الرسم مَصروف عند التغيّر فقط، ما عدا عدّ التسليح
  // التنازلي على زر الإلغاء فيُرسم مع كل نبضة وهو مسلَّح. تغيّر العدد يُبطل
  // التسليح (قاعدة الإضافة: لا زر مسلَّح على فهرس قديم)
  const syncCount = (): void => {
    if (!session) return
    const n = session.stepCount()
    if (n !== lastSteps) {
      lastSteps = n
      arm.disarm()
      dispatch({ t: 'count', steps: n })
      refreshStepList()
      return
    }
    if (arm.remaining() > 0) render()
  }

  function render(): void {
    const rec = widget.mode === 'recording'
    const held = widget.mode === 'paused'
    const building = widget.mode === 'building'
    const settingsMode = settingsOpen && widget.mode === 'idle'
    const modeClass = settingsMode
      ? 'settings'
      : rec
        ? 'rec'
        : held
          ? 'held'
          : building
            ? 'build'
            : 'idle'
    shell.className = `shell ${modeClass}`
    // الإعدادات **تستبدل** الحبة لا تتراكم فوقها (برهان بصريّ ٢٠٢٦-٠٩-١٧:
    // تراكمهما سحق زر «إنهاء التطبيق» خارج النافذة) — القائمة تُفتح من الترس
    // فتظهر وحدها، والرجوع يعيد الحبة
    pill.hidden = widget.mode !== 'idle' || settingsMode
    panel.hidden = !(rec || held || building)
    settingsView.hidden = !settingsMode

    // شريط الحالة بلغة الإضافة حرفيًّا
    chip.className = rec ? 'chip rec' : held ? 'chip held' : 'chip'
    chipText.textContent = rec ? 'يسجّل الآن' : held ? 'متوقف مؤقتًا' : building ? 'جارٍ البناء…' : 'جاهز'
    countEl.textContent = countPhrase(widget.steps)
    pauseTxt.textContent = held ? 'استئناف' : 'إيقاف'
    // أيقونتا الإيقاف/الاستئناف تتبادلان بالخاصيّة — toggleAttribute آمنة على SVG
    pauseBtn.querySelector('.ic-pause')?.toggleAttribute('hidden', held)
    pauseBtn.querySelector('.ic-play')?.toggleAttribute('hidden', !held)
    pauseBtn.title = held ? 'استئناف التسجيل' : 'إيقاف مؤقت'
    pauseBtn.hidden = building
    cancelBtn.hidden = building
    finishBtn.hidden = building
    const left = arm.remaining()
    cancelTxt.textContent = left > 0 ? `تأكيد الإلغاء (${arDigits(left)})` : 'إلغاء'
    cancelBtn.classList.toggle('armed', left > 0)

    // الاقتران: نقطة الحالة في الحبة، والإدارة كلها خلف الترس — لا بريد ولا
    // «فصل» على السطح دائم الظهور (قرار المالك)
    authDot.hidden = auth.phase === 'unknown'
    authDot.className =
      auth.phase === 'paired'
        ? 'dot auth-ok'
        : auth.phase === 'pairing'
          ? 'dot auth-wait'
          : 'dot'
    authDot.title =
      auth.phase === 'paired' ? (auth.email ?? 'مربوط') : auth.phase === 'pairing' ? 'جارٍ الاقتران…' : 'غير مقترن'
    authStatus.textContent =
      auth.phase === 'paired'
        ? 'الجهاز مربوط بحسابك — النشر يعمل.'
        : auth.phase === 'pairing'
          ? `رمز الموافقة: ${auth.userCode ?? ''} — أكمل في المتصفّح.`
          : 'غير مقترن — الالتقاط يعمل، والنشر يحتاج اقترانًا.'
    const showEmail = auth.phase === 'paired' && !!auth.email
    emailText.hidden = !showEmail
    emailText.textContent = showEmail ? (auth.email ?? '') : ''
    pairBtn.hidden = auth.phase !== 'unpaired'
    forgetBtn.hidden = auth.phase !== 'paired'
  }

  async function start(): Promise<void> {
    try {
      startBtn.disabled = true
      setStatus('جارٍ بدء الالتقاط…')
      // **الجلسة أولًا ثم التوسعة** — قرار الإصلاح بعد بلاغ المالك (نافذة
      // موسَّعة على واجهة خمولة): النافذة لا تنمو إلا بعد تأكيد أن التسجيل
      // يعمل فعلًا، فلا حالة وسطى معلّقة. فشل التوسعة بعد بدء الجلسة ⇐
      // إلغاء صادق فوري (انظر cancelFlow) — يستحيل البقاء موسَّعين بلا محتوى
      const bridge = createTauriBridge()
      const s = createRecorderSession(bridge, { ignorePoint })
      unlisten = [
        bridge.listen('sensor://input', syncCount),
        bridge.listen('sensor://facts', syncCount),
        bridge.listen('sensor://tick', syncCount),
      ]
      await bridge.ready() // كل الاشتراكات عبر IPC قبل أوّل نبضة كي لا يُفوَّت شيء
      const ack = await invoke<{ sessionId: string }>('recording_start')
      currentSessionId = ack.sessionId
      session = s
      lastSteps = 0
      stepsEl.replaceChildren() // صفوف جلسة سابقة/ملغاة لا تبقى معلّقة في اللوحة الجديدة
      dispatch('start')
      const grown = await expander.expandTo(PANEL_HEIGHT)
      if (!grown) {
        await cancelFlow('تعذّر توسعة لوحة الالتقاط (صلاحيّة نافذة قديمة؟) — أُلغي البدء. أعد تشغيل التطبيق وجرّب من جديد.')
        return
      }
      void refreshOwnRect()
      setStatus('')
    } catch (e) {
      setStatus(`تعذّر بدء التسجيل: ${String(e)}`)
      for (const u of unlisten) u()
      unlisten = []
      session = null
      currentSessionId = null
      lastSteps = -1
      dispatch('done')
      await expander.collapse()
      void refreshOwnRect()
    } finally {
      startBtn.disabled = false
    }
  }

  function togglePause(): void {
    if (!session) return
    if (widget.mode === 'paused') {
      session.resume()
      dispatch('resume')
    } else {
      session.pause()
      dispatch('pause')
    }
  }

  /** الإلغاء خطوتان كالإضافة تمامًا: الأولى تُسلّح (٤ث)، والثانية تُلغي فعلًا */
  function onCancelPress(): void {
    if (!session) return
    if (arm.press() === 'confirm') void cancelFlow()
    else render()
  }

  /** الإلغاء = إلقاء كل شيء: لا بناء ولا رفع — الاشتراكات تُقطع والمرجع
   *  يُهمَل فيموت المخزن مع الإغلاق، والتقاط Rust يُوقَف */
  async function cancelFlow(reason = 'أُلغي التسجيل — لم يُحفظ شيء.'): Promise<void> {
    session = null
    currentSessionId = null
    for (const u of unlisten) u()
    unlisten = []
    arm.disarm()
    lastSteps = -1
    try {
      await invoke('recording_stop')
    } catch {
      // الجلسة قد تكون أُغلقت قبلها — لا ضرر ولا رسالة
    }
    dispatch('cancel')
    await expander.collapse()
    void refreshOwnRect()
    setStatus(reason)
  }

  async function startPairing(): Promise<void> {
    try {
      // اسم جهاز ثابت وصفيّ — لا بيانات مستخدم في الطلب
      const info = await ipcAuth.pairStart('إتقان — سطح المكتب')
      authDispatch({ t: 'start', userCode: info.userCode })
      setStatus(`رمز الموافقة: ${info.userCode} — أكمل في المتصفّح الذي فُتح.`)
      await ipcAuth.openVerify(info.userCode)
    } catch (e) {
      setStatus(`تعذّر بدء الاقتران: ${String(e)}`)
      authDispatch({ t: 'lost' })
    }
  }

  async function unpair(): Promise<void> {
    try {
      await ipcAuth.forget()
      setStatus('فُصل الجهاز عن الحساب.')
    } catch (e) {
      setStatus(`تعذّر الفصل: ${String(e)}`)
    } finally {
      authDispatch({ t: 'forget' })
    }
  }

  async function openSettings(): Promise<void> {
    settingsOpen = true
    render()
    const grown = await expander.expandTo(SETTINGS_HEIGHT)
    if (!grown) {
      // نفس عقد البدء الآمن: لوحة حساب لا تتّسع لنافذتها ⇐ رجوع فوري بصدق
      settingsOpen = false
      render()
      setStatus('تعذّر فتح لوحة الحساب — أعد تشغيل التطبيق وجرّب من جديد.')
      return
    }
    void refreshOwnRect()
  }

  function closeSettings(): void {
    settingsOpen = false
    render()
    void expander.collapse().then(() => refreshOwnRect())
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
      // حارس «غير مقترن» (اق-٣): نصّ صريح بدل تعليقٍ صامت. التسليم **يُطلَق
      // دائمًا**: الطابور لا يمتلئ إلا داخله فيبقى محفوظًا ويُستأنف بعد الاقتران
      setStatus(
        ok && auth.phase !== 'paired'
          ? `${saved} حُفظ محليًّا — اقترن لِنشره؛ يُستأنف الرفع بعد الاقتران.`
          : saved,
      )
      if (currentSessionId) {
        uploadDone = 0
        uploadSessionId = currentSessionId
        uploadTotal = guide.steps.filter((s) => {
          const shot = s.screenshot
          return !!shot && !('missing' in shot) && /^f-\d+$/.test(shot.fileId)
        }).length
        const d = deliverGuide(currentSessionId, guide, ipcDelivery, ipcDelivery)
        void d.submitted.then(
          () => setStatus('جارٍ إنشاء الدليل على حسابك…'),
          (e) => {
            clearUploadTracking()
            setStatus(`تعذّر تسليم الدليل: ${String(e)} — العناصر باقية في الطابور`)
          },
        )
        void d.delivered.then(
          (id) => {
            clearUploadTracking()
            // لحظة النجاح تُرى كما في الإضافة — بطاقة «دليلك جاهز» مصغّرة على الحبة
            status.textContent = `✓ دليلك جاهز — فُتح على الويب (/g/${id}).`
            status.classList.add('ok')
            setTimeout(() => status.classList.remove('ok'), 8000)
          },
          (e) => {
            clearUploadTracking()
            setStatus(`تعذّر فتح الدليل: ${String(e)}`)
          },
        )
      }
    } catch (e) {
      setStatus(`تعذّر بناء الدليل: ${String(e)}`)
    } finally {
      for (const u of unlisten) u()
      unlisten = []
      session = null
      currentSessionId = null
      arm.disarm()
      lastSteps = -1
      dispatch('done')
      await expander.collapse()
      void refreshOwnRect()
    }
  }

  startBtn.addEventListener('click', () => void start())
  pauseBtn.addEventListener('click', togglePause)
  cancelBtn.addEventListener('click', onCancelPress)
  finishBtn.addEventListener('click', () => void stopFlow())
  gearBtn.addEventListener('click', openSettings)
  backBtn.addEventListener('click', closeSettings)
  pairBtn.addEventListener('click', () => void startPairing())
  forgetBtn.addEventListener('click', () => void unpair())
  // الإنهاء = إغلاق التطبيق تمامًا (طلب المالك): مسار Tauri الرسمي في Rust
  // فيُطوى الخطّاف والحلقات مع العملية — لا حالة معلّقة بعده
  exitBtn.addEventListener('click', () => void invoke('app_exit'))

  render()
}

export {}
