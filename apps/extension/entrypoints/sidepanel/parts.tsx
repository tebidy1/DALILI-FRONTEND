import { useEffect, useState } from 'react'
import { toArabicDigits } from '@/lib/ar-digits'
import { ItqanMark } from '@/lib/itqan-mark'
import type { SessionMeta, StepSummary } from '@/lib/protocol'
import { TrashIcon, MicIcon, PauseIcon, PlayIcon, BlurIcon, CheckIcon, GearIcon, BellIcon } from './icons'

/** أجزاء اللوحة الجانبية المشتركة — اقتطاع من App.tsx لقانون الحجم */

type SendMsg = 'start' | 'start-with-audio' | 'finish' | 'pause' | 'resume' | 'cancel'

/** الترويسة: الشعار، رمز الحالة، ثم زرّا الجرس والترس (2026-09-10) — هادئان بلا إطار */
export function HeadBar({ meta, unread, onBell, onSettings }: { meta: SessionMeta; unread: number; onBell: () => void; onSettings: () => void }) {
  const { state } = meta
  const capturing = state === 'capturing' || state === 'paused'
  return (
    <div className="head">
      {/* الشعار مصغّر ٢٥٪ بطلب المالك (٦٥px، كان ٨٦px) والعبارة سطر صغير تحته —
          نمط الترويسة الاحترافي المضغوط. الخطّان الجانبيان للقفل يستحيلان هنا:
          عرض ٦٥px يبتلعهما فيصيران عرقًا، فالعبارة وحدها هي البديل المضغوط.
          القفل الرسمي كاملًا يبقى مكانه الصحيح: شاشة الدخول وشاشة الإقلاع. */}
      <div className="brand">
        <ItqanMark width={65} stroke={13} />
        <span className="brand-latin" aria-label="ACTIVE SOP">
          <b aria-hidden>ACTIVE.</b> <i aria-hidden>SOP</i>
        </span>
      </div>
      <div className="head-side">
        <span className={`chip ${capturing ? 'rec' : ''}`}>
          {state === 'idle' && '● جاهز'}
          {state === 'capturing' && (<><span className="dot" /> {meta.autoMemo ? 'تعليق تلقائي ●' : 'يسجّل الآن'}</>)}
          {state === 'paused' && (<><span className="dot paused" /> متوقف مؤقتًا</>)}
          {state === 'saving' && 'يحفظ…'}
          {state === 'draft' && 'مسودة محلية'}
        </span>
        <button className="head-ic" aria-label="التنبيهات" title="التنبيهات" onClick={onBell}>
          <BellIcon />
          {unread > 0 && <span className="head-dot" role="img" aria-label="تنبيهات جديدة" />}
        </button>
        <button className="head-ic" aria-label="الإعدادات" title="الإعدادات" onClick={onSettings}>
          <GearIcon />
        </button>
      </div>
    </div>
  )
}

/** VOX-09/AUTO: نصّا زر الميك حسب الوضع — التلميح يشرح والإعلان يختصر، فدالة واحدة بدل سلكي ثلاثية متوازية في JSX */
function micCopy(autoMemo: boolean, memoLive: SessionMeta['memoLive'], stepCount: number): { title: string; label: string } {
  if (autoMemo) {
    return memoLive
      ? { title: 'إيقاف التعليق التلقائي لهذه الجلسة', label: 'إيقاف التعليق التلقائي' }
      : { title: 'التعليق التلقائي يعمل — كل بطاقة جديدة يبدأ عليها التسجيل', label: 'تشغيل التعليق التلقائي' }
  }
  if (memoLive) return { title: 'إيقاف التعليق الصوتي', label: 'إيقاف التعليق الصوتي' }
  if (stepCount === 0) return { title: 'التقط خطوة أولًا ثم علّق عليها بصوتك', label: 'التقط خطوة أولًا ثم علّق عليها بصوتك' }
  return { title: 'سجّل تعليقًا صوتيًا لهذه الخطوة — يتوقف ذاتيًا عند بطاقة تالية', label: 'سجّل تعليقًا صوتيًا لهذه الخطوة' }
}

export function CaptureBar({
  paused,
  blurOn,
  toggleBlur,
  cancelArmed,
  cancelLeft,
  onCancelPress,
  memoLive,
  autoMemo,
  stepCount,
  memoDenied,
  onMemoPress,
  onFinishPress,
  send,
}: {
  paused: boolean
  blurOn: boolean
  toggleBlur: () => void
  cancelArmed: boolean
  /** المرحلة ٤: ثوانٍ التسليح المتبقية — تُرى على الزر */
  cancelLeft: number
  onCancelPress: () => void
  memoLive: SessionMeta['memoLive']
  autoMemo: boolean
  stepCount: number
  memoDenied: boolean
  onMemoPress: () => void
  /** المرحلة ٣: الإنهاء يمر باللوحة أولًا — سطر الاسم الاختياري قبل النشر */
  onFinishPress: () => void
  send: (t: SendMsg) => void
}) {
  const mic = micCopy(autoMemo, memoLive, stepCount)
  return (
    <div className="capbar">
      <div className="capbar-tools">
        {paused ? (
          <button className="tool" title="استئناف التسجيل" aria-label="استئناف التسجيل" onClick={() => send('resume')}>
            <PlayIcon /> استئناف
          </button>
        ) : (
          <button className="tool" title="إيقاف مؤقت" aria-label="إيقاف مؤقت" onClick={() => send('pause')}>
            <PauseIcon /> إيقاف
          </button>
        )}
        <button
          className={`tool ${blurOn ? 'on' : ''}`}
          title="طمس منطقة حساسة — اسحب فوقها في الصفحة"
          aria-label="طمس منطقة حساسة"
          aria-pressed={blurOn}
          disabled={paused}
          onClick={toggleBlur}
        >
          <BlurIcon /> طمس
        </button>
        {/* VOX-09/AUTO: الميك يدوي في الوضع العادي (يتوقف ذاتًا عند بطاقة جديدة)،
            وفي الوضع التلقائي مفتاح إيقاف/تشغيل التعليق التلقائي كله */}
        <button
          className={`tool mic-tool${memoLive ? ' live' : ''}`}
          title={mic.title}
          aria-label={mic.label}
          disabled={paused || memoDenied || (!autoMemo && stepCount === 0)}
          onClick={onMemoPress}
        >
          <MicIcon /> {memoLive ? 'يسجّل' : autoMemo ? 'تلقائي' : 'ميك'} {memoLive && <MemoTimer startedAt={memoLive.startedAt} />}
        </button>
        <button
          className={`tool danger${cancelArmed ? ' armed' : ''}`}
          title={cancelArmed ? `اضغط مجددًا لتأكيد الإلغاء (${toArabicDigits(cancelLeft)})` : 'إلغاء التسجيل'}
          aria-label={cancelArmed ? 'اضغط مجددًا لتأكيد الإلغاء' : 'إلغاء التسجيل'}
          onClick={onCancelPress}
        >
          <TrashIcon /> {cancelArmed ? `تأكيد الإلغاء (${toArabicDigits(cancelLeft)})` : 'إلغاء'}
        </button>
      </div>
      <button className="cap-finish" aria-label="إنهاء ونشر الدليل" onClick={onFinishPress}>
        <CheckIcon /> إنهاء الالتقاط
      </button>
    </div>
  )
}

/** VOX-09: مؤقت التعليق الجاري — عرض فقط (setInterval مسموح لعرض الزمن الجاري) */
export function MemoTimer({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const s = Math.max(0, Math.floor((now - startedAt) / 1000))
  return (
    <span className="memo-timer">
      {toArabicDigits(Math.floor(s / 60))}:{toArabicDigits(s % 60).padStart(2, '٠')}
    </span>
  )
}

/** VOX-09: نص شارة التعليق — «١٢ ث» */
export function voiceBadgeAr(durationMs: number): string {
  return `${toArabicDigits(Math.round(durationMs / 1000))} ث`
}

export function kindLabel(kind: StepSummary['kind']): string {
  switch (kind) {
    case 'click': return 'نقرة'
    case 'input': return 'إدخال'
    case 'select': return 'اختيار'
    case 'toggle': return 'تبديل'
    case 'navigate': return 'تنقّل'
    case 'keypress': return 'مفتاح'
  }
}
