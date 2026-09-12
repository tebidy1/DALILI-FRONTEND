import { useEffect, useRef, useState } from 'react'
import { DaliliClient, type MeDto } from '@dalili/shared'
import { META_KEY, type SessionMeta, type StepSummary } from '@/lib/protocol'
import type { MemoToggleAck } from '@/lib/protocol'
import { readStepSummaries, readShotAt } from '@/lib/steps-read'
import { clearAllSteps, publishSteps } from '@/lib/publish'
import { autoTranscribeSteps } from '@/lib/voice-memo-upload'
import { API_BASE, WEB_BASE } from '@/lib/config'
import { filterByTitle, searchHref, type RecentGuide } from '@/lib/recent'
import { hostOf } from '@/lib/discover'
import { urlTokens } from '@dalili/core'
import { CANCEL_ARM_WINDOW_MS, CancelArm } from '@/lib/cancel-arm'
import { useArmCountdown } from './useArmCountdown'
import type { DiscoverResponseDto } from '@dalili/shared'
import { CaptureBar, HeadBar } from './parts'
import { IdleScreen } from './IdleScreen'
import { StepsList } from './StepsList'
import { SettingsSheet, BellSheet } from './Sheets'
import { usePrefs, panelActivity } from './usePrefs'

const client = new DaliliClient(API_BASE)
const IDLE: SessionMeta = { state: 'idle', sessionId: '', startedAt: 0, stepCount: 0 }
const getKeys = (keys: string[]) => chrome.storage.local.get(keys)

type BtnMsg = 'start' | 'start-with-audio' | 'finish' | 'pause' | 'resume' | 'cancel'
type Sheet = 'none' | 'settings' | 'bell'

export function App() {
  const [meta, setMeta] = useState<SessionMeta>(IDLE)
  const [me, setMe] = useState<MeDto | null>(null)
  const [steps, setSteps] = useState<StepSummary[]>([])
  const [lastShot, setLastShot] = useState<string | undefined>()
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState('')
  const [recent, setRecent] = useState<RecentGuide[]>([])
  const [recentErr, setRecentErr] = useState('')
  const [query, setQuery] = useState('')
  const [discover, setDiscover] = useState<DiscoverResponseDto | null>(null)
  // زرّا الترويسة (2026-09-10): أي لوحة مفتوحة، ومن كان جديدًا في السجل لحظة فتح الجرس
  const [sheet, setSheet] = useState<Sheet>('none')
  const [freshIds, setFreshIds] = useState<ReadonlySet<string>>(new Set())
  const prefs = usePrefs(me, client)
  // CAP-13: زر «طمس» في شريط اللوحة — يفعّل سحب الطمس على التبويب النشط
  const [blurOn, setBlurOn] = useState(false)
  // CAP-02: الإلغاء بتأكيد خطوتين — النقرة الأولى تُسلّح الزر (٤ث)، والثانية تلغي فعلًا
  const cancelArm = useRef(new CancelArm())
  const [cancelArmed, setCancelArmed] = useState(false)
  const cancelArmTimer = useRef<number | undefined>(undefined)
  // المرحلة ٢: الحذوف السريعة كلها خطوتان بنفس النمط — حذف خطوة، حذف تعليق صوتي، حذف المسودة.
  // لا نوافذ منبثقة داخل شاشة عمل ضيقة: النقرة الأولى تُسلّح والثانية داخل النافذة تنفّذ
  const [armedKey, setArmedKey] = useState<string | null>(null)
  const armTimer = useRef<number | undefined>(undefined)
  // المرحلة ٤: عدّاد الأربع ثوانٍ يُرى على الزر المسلَّح بدل تخمينه
  const armLeft = useArmCountdown(armedKey !== null, armedKey ?? '')
  const cancelLeft = useArmCountdown(cancelArmed)
  const ar = (n: number) => n.toLocaleString('ar-EG')
  function armedPress(key: string, run: () => void) {
    window.clearTimeout(armTimer.current)
    if (armedKey === key) {
      setArmedKey(null)
      run()
      return
    }
    setArmedKey(key)
    armTimer.current = window.setTimeout(() => setArmedKey((k) => (k === key ? null : k)), CANCEL_ARM_WINDOW_MS)
  }
  // VOX-09/AUTO: زر الميك — يدويًا في الوضع العادي، ومفتاح التعليق التلقائي في وضع «ابدأ مع تعليق صوتي»
  const [memoDenied, setMemoDenied] = useState(false)
  const [memoProgress, setMemoProgress] = useState('')
  // كشف يدوي للقطات خطوات سابقة (فهرس→dataURL) — الأحدث تُعرض دائمًا عبر lastShot
  const [revealed, setRevealed] = useState<Record<number, string>>({})
  const stepsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let live = true
    async function load() {
      const got = (await chrome.storage.local.get(META_KEY))[META_KEY] as SessionMeta | undefined
      const m = got ?? IDLE
      if (!live) return
      setMeta(m)
      if (m.state === 'capturing' || m.state === 'paused') {
        setSteps(await readStepSummaries(m.sessionId, m.stepCount, getKeys))
        // البطاقة الأحدث تعرض لقطتها هي حصرًا (لا آخر لقطة متاحة) — أثناء فجوة
        // الالتقاط تبقى undefined فيظهر العنصر النائب «يرسم التحديد…» بدل لقطة سابقة
        setLastShot(await readShotAt(m.sessionId, m.stepCount - 1, getKeys))
      } else {
        setSteps([])
        setLastShot(undefined)
      }
    }
    void load()
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local') return
      const keys = Object.keys(changes)
      // خطوة جديدة أو حذف: البطاقات السابقة تنطوي لعنوان فقط (الأحدث وحدها تعرض لقطتها)
      // VOX-09: مفتاح صوت جديد = انتهى تسجيل تعليق — الشارة تظهر بالمدة بلا طيّ المعاينات
      const stepsTouched = keys.some((k) => k.startsWith('dalili:step:') || k.startsWith('dalili:shot:'))
      const voiceTouched = keys.some((k) => k.startsWith('voice:'))
      if (stepsTouched) setRevealed({})
      if (stepsTouched || voiceTouched || keys.includes(META_KEY)) void load()
    }
    chrome.storage.onChanged.addListener(onChanged)
    client
      .me()
      .then((m) => {
        if (!live) return
        setMe(m)
        // الأدلة الأخيرة تُجلب فقط لمن سجّل دخوله — الضيف لا أدلة له بعد
        if (m) {
          client
            .listGuides({ limit: 8, sort: 'updated', order: 'desc' })
            .then((r) => {
              if (!live) return
              setRecent(
                r.items.map((it) => ({ id: it.id, title: it.title, updatedAt: it.updatedAt, stepCount: it.stepCount })),
              )
            })
            .catch(() => live && setRecentErr('تعذّر جلب الأدلة الأخيرة'))
        }
      })
      .catch(() => live && setError('تعذر الوصول للخادم — تأكد من تشغيله على المنفذ 8787'))
    return () => {
      live = false
      chrome.storage.onChanged.removeListener(onChanged)
    }
  }, [])

  /**
   * SRCH-04: شارة الاكتشاف — أدلة المالك على نطاق التبويب النشط.
   * أحداث فقط (تفعيل/تحديث تبويب) بلا دوران؛ صمت صادق عند الفشل (الشارة كمالية)،
   * وتختفي على صفحات المتصفح الداخلية وفوق دليل بلا أدلة على نطاقه.
   */
  useEffect(() => {
    if (!me) return
    let live = true
    const ac = new AbortController()
    async function refresh(tab: chrome.tabs.Tab | undefined) {
      const host = tab?.url ? hostOf(tab.url) : null
      if (!host || !tab?.url) {
        if (live) setDiscover(null)
        return
      }
      try {
        // SRCH-04 تطوّر: نرسل رموز الشاشة الحالية (مُجزّئ core نفسه المستعمل في الفهرس)
        const screen = urlTokens(tab.url).screen.join(' ')
        const res = await client.discover(host, screen, ac.signal)
        if (live) setDiscover(res.count > 0 ? res : null)
      } catch {
        if (live) setDiscover(null)
      }
    }
    const queryActive = () => {
      chrome.tabs
        .query({ active: true, currentWindow: true })
        .then((ts) => refresh(ts[0]))
        .catch(() => {})
    }
    const onActivated = () => queryActive()
    const onUpdated = (tabId: number, info: chrome.tabs.OnUpdatedInfo, tab: chrome.tabs.Tab) => {
      if (tab.active && (info.url || info.status === 'complete')) refresh(tab).catch(() => {})
    }
    queryActive()
    chrome.tabs.onActivated.addListener(onActivated)
    chrome.tabs.onUpdated.addListener(onUpdated)
    return () => {
      live = false
      ac.abort()
      chrome.tabs.onActivated.removeListener(onActivated)
      chrome.tabs.onUpdated.removeListener(onUpdated)
    }
  }, [me])

  async function send(t: BtnMsg, title?: string) {
    setError('')
    await chrome.runtime.sendMessage(title ? { t, title } : { t }).catch(() => setError('لا يستجيب — أعد تحميل الامتداد'))
  }

  /** رسالة نارية محصّنة — موت العامل أو غياب الرد لا يرمي في واجهة المستخدم */
  function fire(msg: Record<string, unknown>) {
    try {
      const p = chrome.runtime.sendMessage(msg) as unknown
      if (p && typeof (p as Promise<unknown>).catch === 'function') void (p as Promise<unknown>).catch(() => {})
    } catch {
      // العامل غير متاح الآن — لا شيء تفعله الواجهة
    }
  }
  // CAP-13: تبديل وضع الطمس على الصفحة الجارية — يُطفأ تلقائيًا خارج التسجيل الفعلي
  function toggleBlur() {
    const next = !blurOn
    setBlurOn(next)
    void chrome.runtime.sendMessage({ t: 'blur-mode', on: next }).catch(() => {})
  }

  // CAP-02: الإلغاء خطوتين — الأولى تُسلّح مع مؤقت إبقاء قصير، والثانية داخل النافذة تُلغي فعلًا
  function onCancelPress() {
    const r = cancelArm.current.press(Date.now())
    window.clearTimeout(cancelArmTimer.current)
    if (r === 'confirm') {
      setCancelArmed(false)
      cancelArm.current.disarm()
      void send('cancel')
      return
    }
    setCancelArmed(true)
    cancelArmTimer.current = window.setTimeout(() => {
      setCancelArmed(false)
      cancelArm.current.disarm()
    }, CANCEL_ARM_WINDOW_MS)
  }

  // خروج الجلسة من التسجيل الفعلي (إيقاف/إنهاء) يعيد زر الطمس لوضعه المطفأ
  useEffect(() => {
    if (meta.state !== 'capturing' && blurOn) setBlurOn(false)
  }, [meta.state, blurOn])

  // البطاقة الأحدث أسفل القائمة — نمرّر إليها تلقائيًا عند كل خطوة جديدة
  useEffect(() => {
    const el = stepsRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [meta.stepCount])

  // المرحلة ٢: تغيّر عدد الخطوات يبطل التسليح — لا زر مسلَّح على فهرس قديم
  useEffect(() => {
    setArmedKey(null)
  }, [meta.stepCount])

  // المرحلة ٣ (قرار المالك): سطر الاسم الاختياري قبل النشر — التسمية لحظة «امتلاك» الدليل
  const [askTitle, setAskTitle] = useState(false)
  const [guideTitle, setGuideTitle] = useState('')
  const [draftTitle, setDraftTitle] = useState('')
  function onFinishPress() {
    // بلا خطوات: تمرّر للخلفية تعرض رسالتها الصادقة — والإضافة لدليل قائم لا تعيد تسميته
    if (meta.stepCount === 0 || meta.appendTo) {
      void send('finish')
      return
    }
    setAskTitle(true)
  }
  function publishNow() {
    const title = guideTitle.trim()
    setAskTitle(false)
    setGuideTitle('')
    void send('finish', title || undefined)
  }

  // المرحلة ٤: شارة الإضافة تذكر اسم الدليل الهدف — يُجلب مرة واحدة لحظة ظهور الإضافة
  const [appendTitle, setAppendTitle] = useState<string | null>(null)
  const appendTitleFor = useRef<string | null>(null)
  useEffect(() => {
    const target = meta.appendTo
    if (!target || appendTitleFor.current === target) return
    appendTitleFor.current = target
    const client = new DaliliClient(API_BASE)
    client
      .getGuide(target)
      .then((d) => setAppendTitle(d.guide.title))
      .catch(() => {})
  }, [meta.appendTo])

  // المرحلة ٣: بطاقة «دليلك جاهز» — النجاح يُرى ولا يُبتلع، وتزول بنفسها بعد دقيقتين
  const [successHidden, setSuccessHidden] = useState<string | null>(null)
  const lastPub = meta.lastPublished
  const showSuccess =
    meta.state === 'idle' && !!lastPub && successHidden !== lastPub.guideId && Date.now() - lastPub.at < 120_000

  function deleteStep(index: number) {
    armedPress(`s:${index}`, () => {
      void chrome.runtime.sendMessage({ t: 'delete-step', index }).catch(() => {})
    })
  }

  // VOX-09: ضغطة الميك — في الوضع التلقائي مفتاح إيقاف/تشغيل، وإلا بدء/إيقاف يدوي على آخر بطاقة
  async function onMemoPress() {
    if (meta.autoMemo) {
      try {
        const ack = (await chrome.runtime.sendMessage({ t: 'auto-memo-toggle' }).catch(() => null)) as { ok: boolean; errorAr?: string } | null
        if (ack && !ack.ok && ack.errorAr) setError(ack.errorAr)
      } catch {
        // الخلفية ميتة لحظة — البث سيأتي
      }
      return
    }
    if (meta.memoLive) {
      // الإيقاف ينتظر الجواب: فشل التسجيل (صمت ميكروفون) يُعرض بصدق بدل صمت الأزرار
      try {
        const ack = (await chrome.runtime.sendMessage({ t: 'memo-toggle' }).catch(() => null)) as MemoToggleAck | null
        if (ack && !ack.ok && ack.errorAr) setError(ack.errorAr)
      } catch {
        // الخلفية ميتة لحظة — البث سيأتي
      }
      return
    }
    try {
      const p = await navigator.permissions.query({ name: 'microphone' as PermissionName })
      if (p.state === 'denied') {
        setMemoDenied(true)
        setError('لا صوت — الالتقاط مستمر بلا تعليق. فعّل الميكروفون من إعدادات الموقع')
        return
      }
      if (p.state === 'granted') {
        const ack = (await chrome.runtime.sendMessage({ t: 'memo-toggle' }).catch(() => null)) as MemoToggleAck | null
        if (ack && !ack.ok && ack.errorAr) {
          setError(ack.errorAr)
          if (ack.errorAr.includes('الميكروفون')) setMemoDenied(true)
        }
        return
      }
      fire({ t: 'memo-request' })
    } catch {
      // المتصفح بلا permissions API — مسار صفحة الإذن هو القانون (VOX-06)
      fire({ t: 'memo-request' })
    }
  }

  function deleteMemo(index: number) {
    armedPress(`m:${index}`, () => fire({ t: 'memo-delete', index }))
  }

  // كشف/طيّ لقطة بطاقة سابقة — تُحمّل كسولًا عند أول كشف
  async function toggleReveal(index: number) {
    if (revealed[index] !== undefined) {
      setRevealed((prev) => {
        const next = { ...prev }
        delete next[index]
        return next
      })
      return
    }
    const shot = await readShotAt(meta.sessionId, index, getKeys)
    if (shot) setRevealed((prev) => ({ ...prev, [index]: shot }))
  }

  async function publishDraft(title?: string) {
    if (publishing) return
    setPublishing(true)
    setError('')
    setMemoProgress('')
    try {
      const who = await client.me()
      if (!who) {
        window.open(`${WEB_BASE}/login?return=extension`, '_blank')
        return
      }
      // VOX-09: تعليقات البطاقات تُرفع خلال النشر ثم تُفرَّغ نصيًا فوق عناوينها
      const published = await publishSteps(client, meta.sessionId, meta.stepCount, meta.appendTo, meta.insertAt, {
        onMemoProgress: setMemoProgress,
        // المرحلة ٣: الاسم للدليل الجديد وحده — الإضافة لدليل قائم لا تعيد تسميته
        title: meta.appendTo ? undefined : title,
      })
      await clearAllSteps()
      // المرحلة ٣: النجاح يُرى — بطاقة «دليلك جاهز» فوق شاشة الخمول
      await chrome.storage.local.set({
        [META_KEY]: { ...IDLE, lastPublished: { guideId: published.guideId, stepCount: meta.stepCount, at: Date.now() } },
      })
      // التفريغ التلقائي: كلام كل تعليق يُلحق تحت عنوان بطاقته — الفشل لافتة إعادة محاولة بالمحرر
      const sttSteps = await autoTranscribeSteps(client, published.guideId, published.memoTotal > 0)
      if (!sttSteps.ok)
        void panelActivity
          .push('stt', 'تعذّر تفريغ التعليقات الصوتية نصًا — أعد المحاولة من المحرر', `${WEB_BASE}/g/${published.guideId}`)
          .catch(() => {})
      window.open(`${WEB_BASE}/g/${published.guideId}${sttSteps.ok ? '' : '?stt=failed'}`, '_blank')
      // النشر الناجح حدثٌ في الجرس برابط دائم — بطاقة النجاح تزول بعد دقيقتين، الحدث يبقى
      void panelActivity.push('publish', 'نُشر دليلك بنجاح — افتحه متى شئت', `${WEB_BASE}/g/${published.guideId}`).catch(() => {})
    } catch (e) {
      setError((e instanceof Error ? e.message : 'فشل النشر') + ' — الخطوات ما زالت محفوظة')
      void panelActivity.push('draft', 'تعذّر نشر الدليل — محفوظ مسودة في اللوحة، أعد النشر حين يتاح الخادم').catch(() => {})
    } finally {
      setPublishing(false)
    }
  }

  async function discardDraft() {
    await clearAllSteps()
    await chrome.storage.local.set({ [META_KEY]: IDLE })
  }

  // المرحلة ٢: «حذف المسودة» خطوتان — نفس حماية حذفها من الإعدادات، فالمسودة عمل لم يُنشر
  const draftArm = useRef(new CancelArm())
  const [draftArmed, setDraftArmed] = useState(false)
  const draftArmTimer = useRef<number | undefined>(undefined)
  const draftLeft = useArmCountdown(draftArmed)
  function onDraftDiscardPress() {
    const r = draftArm.current.press(Date.now())
    window.clearTimeout(draftArmTimer.current)
    if (r === 'confirm') {
      setDraftArmed(false)
      draftArm.current.disarm()
      void discardDraft()
      return
    }
    setDraftArmed(true)
    draftArmTimer.current = window.setTimeout(() => {
      setDraftArmed(false)
      draftArm.current.disarm()
    }, CANCEL_ARM_WINDOW_MS)
  }

  async function openBell() {
    setSheet('bell')
    setFreshIds(await prefs.readAll())
  }

  async function onLogout() {
    await client.logout().catch(() => {})
    window.location.reload()
  }

  const { state, stepCount } = meta
  const capturing = state === 'capturing' || state === 'paused'
  const paused = state === 'paused'

  return (
    <div className="wrap">
      <HeadBar meta={meta} unread={prefs.unread} onBell={() => void openBell()} onSettings={() => setSheet('settings')} />

      {error && <div className="body" style={{ paddingBottom: 0 }}><div className="err">{error}</div></div>}

      {state === 'idle' && (
        <>
          {/* المرحلة ٣: لحظة النجاح — النشر أكمل اللحظة المُكافئة فتُرى ولا تمرّ صامتة */}
          {showSuccess && lastPub && (
            <div className="body">
              <div className="success-card" role="status">
                <div className="success-title">✓ دليلك جاهز</div>
                <div className="muted">
                  {lastPub.stepCount.toLocaleString('ar-EG')} خطوة — نُشرت في مكتبتك
                </div>
                <div className="row">
                  <button onClick={() => window.open(`${WEB_BASE}/g/${lastPub.guideId}`, '_blank')}>
                    افتح الدليل ↗
                  </button>
                  <button className="ghost" onClick={() => setSuccessHidden(lastPub.guideId)}>
                    تم
                  </button>
                </div>
              </div>
            </div>
          )}
          <IdleScreen send={send} me={me} query={query} setQuery={setQuery} discover={discover} recent={recent} recentErr={recentErr} preferredStart={prefs.settings.preferredStart} />
        </>
      )}

      {capturing && (
        <>
          <div className="countline">
            {meta.appendTo ? (
              <span className="append-badge">
                تُضاف الخطوات إلى «{appendTitle ?? 'دليل قائم'}» عند الإنهاء
              </span>
            ) : null}
            <b>{stepCount}</b> خطوة — كل نقرة وإدخال يوثَّق تلقائيًا
          </div>
          {meta.notice && <div className="notice">{meta.notice}</div>}
          {meta.limited && <div className="notice">بلغت الحد ٢٠٠ خطوة — أنهِ التسجيل</div>}

          <div className="steps" ref={stepsRef}>
            <StepsList
              steps={steps}
              meta={meta}
              lastShot={lastShot}
              revealed={revealed}
              armedKey={armedKey}
              armLeft={armLeft}
              onReveal={toggleReveal}
              onDeleteStep={deleteStep}
              onDeleteMemo={deleteMemo}
            />
          </div>

          {/* المرحلة ٣: سطر الاسم الاختياري قبل النشر — التسمية اختيار لا إلزام */}
          {askTitle && (
            <div className="ask-title">
              <label htmlFor="guide-name">اسم الدليل — اختياري</label>
              <input
                id="guide-name"
                dir="rtl"
                autoFocus
                maxLength={120}
                value={guideTitle}
                placeholder="يُشتق من عنوان الصفحة تلقائيًا"
                onChange={(e) => setGuideTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    publishNow()
                  }
                  if (e.key === 'Escape') setAskTitle(false)
                }}
              />
              <div className="row">
                <button onClick={publishNow}>نشر الآن</button>
                <button className="ghost" onClick={() => setAskTitle(false)}>
                  رجوع
                </button>
              </div>
            </div>
          )}

          {/* شريط تحكم سفلي ثابت بأسلوب اسكرايب: صف أدوات ثم زر إنهاء عريض */}
          <CaptureBar
            paused={paused}
            blurOn={blurOn}
            toggleBlur={toggleBlur}
            cancelArmed={cancelArmed}
            cancelLeft={cancelLeft}
            onCancelPress={onCancelPress}
            memoLive={meta.memoLive}
            autoMemo={!!meta.autoMemo}
            stepCount={stepCount}
            memoDenied={memoDenied}
            onMemoPress={onMemoPress}
            onFinishPress={onFinishPress}
            send={send}
          />
        </>
      )}

      {state === 'saving' && (
        <div className="body">
          <div className="spin" />
          <div className="ok center">جارٍ رفع اللقطات وإنشاء الدليل…</div>
          {meta.notice && <div className="notice">{meta.notice}</div>}
        </div>
      )}

      {state === 'draft' && (
        <div className="body">
          <div className="countline"><b>{stepCount}</b> خطوة محفوظة محليًا</div>
          <div className="ok">{meta.draftReason ?? 'دليل محفوظ محليًا'}</div>
          {publishing && memoProgress && <div className="notice">{memoProgress}</div>}
          {/* المرحلة ٣: التسمية متاحة هنا أيضًا — من نشر مسودة قديمة يستطيع تسميتها أولًا */}
          <label className="ask-title" htmlFor="draft-name">
            اسم الدليل — اختياري
            <input
              id="draft-name"
              dir="rtl"
              maxLength={120}
              value={draftTitle}
              placeholder="يُشتق من عنوان الصفحة تلقائيًا"
              onChange={(e) => setDraftTitle(e.target.value)}
            />
          </label>
          <button onClick={() => void publishDraft(draftTitle.trim() || undefined)} disabled={publishing}>
            {publishing ? 'جارٍ النشر…' : 'نشر الدليل الآن'}
          </button>
          <div className="row">
            <button className="ghost" onClick={() => window.open(`${WEB_BASE}/login?return=extension`, '_blank')}>
              فتح تسجيل الدخول
            </button>
            <button className="danger" onClick={onDraftDiscardPress}>
              {draftArmed ? `اضغط مجددًا لتأكيد حذف المسودة (${ar(draftLeft)})` : 'حذف المسودة'}
            </button>
          </div>
        </div>
      )}

      {sheet === 'settings' && (
        <SettingsSheet
          me={me}
          settings={prefs.settings}
          onPreferredStart={prefs.onPreferredStart}
          theme={prefs.theme}
          onTheme={prefs.onTheme}
          hasDraft={state === 'draft'}
          onDiscardDraft={() => {
            void discardDraft()
            setSheet('none')
          }}
          onLogout={() => void onLogout()}
          onClose={() => setSheet('none')}
        />
      )}
      {sheet === 'bell' && (
        <BellSheet
          events={prefs.events}
          freshIds={freshIds}
          onClose={() => setSheet('none')}
          // المرحلة ٣: الجرس يوصلك للحل — المسودة تُدار من شاشتها في اللوحة
          onDraftClick={() => {
            setSheet('none')
            if (meta.state !== 'draft') setError('انتهت هذه المسودة — نُشرت أو حُذفت')
          }}
        />
      )}
    </div>
  )
}
