import { useEffect, useRef, useState } from 'react'
import { DaliliClient, type MeDto } from '@dalili/shared'
import { META_KEY, type SessionMeta, type StepSummary } from '@/lib/protocol'
import type { MemoToggleAck } from '@/lib/protocol'
import { audioStateKey, type AudioSessionState } from '@/lib/audio-store'
import { readStepSummaries, readLastShot, readShotAt } from '@/lib/steps-read'
import { clearAllSteps, publishSteps } from '@/lib/publish'
import { buildAudioMeta, autoTranscribe } from '@/lib/audio-publish'
import { autoTranscribeSteps } from '@/lib/voice-memo-upload'
import { API_BASE, WEB_BASE } from '@/lib/config'
import { filterByTitle, searchHref, type RecentGuide } from '@/lib/recent'
import { hostOf } from '@/lib/discover'
import { urlTokens } from '@dalili/core'
import { CANCEL_ARM_WINDOW_MS, CancelArm } from '@/lib/cancel-arm'
import { PathMark } from '@/lib/path-mark'
import type { DiscoverResponseDto } from '@dalili/shared'
import { CaptureBar } from './parts'
import { IdleScreen } from './IdleScreen'
import { StepsList } from './StepsList'

const client = new DaliliClient(API_BASE)
const IDLE: SessionMeta = { state: 'idle', sessionId: '', startedAt: 0, stepCount: 0 }
const getKeys = (keys: string[]) => chrome.storage.local.get(keys)

type BtnMsg = 'start' | 'start-with-audio' | 'finish' | 'pause' | 'resume' | 'cancel'

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
  // CAP-13: زر «طمس» في شريط اللوحة — يفعّل سحب الطمس على التبويب النشط
  const [blurOn, setBlurOn] = useState(false)
  // CAP-02: الإلغاء بتأكيد خطوتين — النقرة الأولى تُسلّح الزر (٤ث)، والثانية تلغي فعلًا
  const cancelArm = useRef(new CancelArm())
  const [cancelArmed, setCancelArmed] = useState(false)
  const cancelArmTimer = useRef<number | undefined>(undefined)
  // VOX-09: زر الميك — الرفض يعطل الزر لهذه الجلسة مع لافتة صادقة، وتقدم رفع التعليقات
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
        setLastShot(await readLastShot(m.sessionId, m.stepCount, getKeys))
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

  async function send(t: BtnMsg) {
    setError('')
    await chrome.runtime.sendMessage({ t }).catch(() => setError('لا يستجيب — أعد تحميل الامتداد'))
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

  function deleteStep(index: number) {
    void chrome.runtime.sendMessage({ t: 'delete-step', index }).catch(() => {})
  }

  // VOX-09: ضغطة الميك — ممنوح يبدأ/يوقف عبر الخلفية، غير ممنوح تُفتح صفحة الإذن بمسار التعليق
  async function onMemoPress() {
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
    fire({ t: 'memo-delete', index })
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

  async function publishDraft() {
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
      // VOX: مسودة بصوت — الحالة تُقرأ من التخزين (قد مات العامل) ثم تُجمَّع وتُرفع
      let audio
      if (meta.micOn) {
        const key = audioStateKey(meta.sessionId)
        const saved = (await chrome.storage.local.get(key))[key] as AudioSessionState | undefined
        if (saved && saved.sid === meta.sessionId) {
          audio = await buildAudioMeta(client, meta.sessionId, saved)
        }
      }
      const published = await publishSteps(client, meta.sessionId, meta.stepCount, meta.appendTo, meta.insertAt, audio, {
        onMemoProgress: setMemoProgress,
      })
      await clearAllSteps()
      await chrome.storage.local.set({ [META_KEY]: IDLE })
      // التفريغ التلقائي: صوت الدليل وتعليقات الخطوات كلها — الفشل لافتة إعادة محاولة بالمحرر
      const stt = await autoTranscribe(client, published.guideId, !!audio)
      const sttSteps = await autoTranscribeSteps(client, published.guideId, published.memoTotal > 0)
      window.open(`${WEB_BASE}/g/${published.guideId}${stt.ok && sttSteps.ok ? '' : '?stt=failed'}`, '_blank')
    } catch (e) {
      setError((e instanceof Error ? e.message : 'فشل النشر') + ' — الخطوات ما زالت محفوظة')
    } finally {
      setPublishing(false)
    }
  }

  async function discardDraft() {
    await clearAllSteps()
    await chrome.storage.local.set({ [META_KEY]: IDLE })
  }

  const { state, stepCount } = meta
  const capturing = state === 'capturing' || state === 'paused'
  const paused = state === 'paused'

  return (
    <div className="wrap">
      <div className="head">
        <span className="brand">
          <PathMark size={18} /> دليلي
        </span>
        <span className={`chip ${capturing ? 'rec' : ''}`}>
          {state === 'idle' && '● جاهز'}
          {state === 'capturing' && (<><span className="dot" /> {meta.micOn ? 'ميكروفون ● يسجّل' : 'يسجّل الآن'}</>)}
          {state === 'paused' && (<><span className="dot paused" /> متوقف مؤقتًا</>)}
          {state === 'saving' && 'يحفظ…'}
          {state === 'draft' && 'مسودة محلية'}
        </span>
      </div>

      {error && <div className="body" style={{ paddingBottom: 0 }}><div className="err">{error}</div></div>}

      {state === 'idle' && (
        <IdleScreen send={send} me={me} query={query} setQuery={setQuery} discover={discover} recent={recent} recentErr={recentErr} />
      )}

      {capturing && (
        <>
          <div className="countline">
            {meta.appendTo ? (
              <span className="append-badge">تُضاف الخطوات لدليل قائم عند الإنهاء</span>
            ) : null}
            <b>{stepCount}</b> خطوة — كل نقرة وإدخال يوثَّق تلقائيًا
          </div>
          {meta.notice && <div className="notice">{meta.notice}</div>}
          {meta.limited && <div className="notice">بلغت الحد 200 خطوة — أنهِ التسجيل</div>}

          <div className="steps" ref={stepsRef}>
            <StepsList
              steps={steps}
              meta={meta}
              lastShot={lastShot}
              revealed={revealed}
              onReveal={toggleReveal}
              onDeleteStep={deleteStep}
              onDeleteMemo={deleteMemo}
            />
          </div>

          {/* شريط تحكم سفلي ثابت بأسلوب اسكرايب: صف أدوات ثم زر إنهاء عريض */}
          <CaptureBar
            paused={paused}
            blurOn={blurOn}
            toggleBlur={toggleBlur}
            cancelArmed={cancelArmed}
            onCancelPress={onCancelPress}
            memoLive={meta.memoLive}
            stepCount={stepCount}
            memoDenied={memoDenied}
            onMemoPress={onMemoPress}
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
          <button onClick={publishDraft} disabled={publishing}>
            {publishing ? 'جارٍ النشر…' : 'نشر الدليل الآن'}
          </button>
          <div className="row">
            <button className="ghost" onClick={() => window.open(`${WEB_BASE}/login?return=extension`, '_blank')}>
              فتح تسجيل الدخول
            </button>
            <button className="danger" onClick={discardDraft}>حذف المسودة</button>
          </div>
        </div>
      )}
    </div>
  )
}
