import { useEffect, useRef, useState } from 'react'
import { markBoxStyle } from '@/lib/mark-box'
import { zoomFrame } from '@/lib/zoom-frame'
import { toArabicDigits } from '@/lib/ar-digits'
import { PathMark } from '@/lib/path-mark'
import type { SessionMeta, StepSummary } from '@/lib/protocol'
import { ChevronIcon, TrashIcon, MicIcon, PauseIcon, PlayIcon, BlurIcon, CheckIcon, GearIcon, BellIcon } from './icons'

/** أجزاء اللوحة الجانبية المشتركة — اقتطاع من App.tsx لقانون الحجم */

type SendMsg = 'start' | 'start-with-audio' | 'finish' | 'pause' | 'resume' | 'cancel'

/** الترويسة: الشعار، رمز الحالة، ثم زرّا الجرس والترس (2026-09-10) — هادئان بلا إطار */
export function HeadBar({ meta, unread, onBell, onSettings }: { meta: SessionMeta; unread: number; onBell: () => void; onSettings: () => void }) {
  const { state } = meta
  const capturing = state === 'capturing' || state === 'paused'
  return (
    <div className="head">
      <span className="brand">
        <PathMark size={18} /> دليلي
      </span>
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
  const ar = (n: number) => n.toLocaleString('ar-EG')
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
          title={
            autoMemo
              ? memoLive
                ? 'إيقاف التعليق التلقائي لهذه الجلسة'
                : 'التعليق التلقائي يعمل — كل بطاقة جديدة يبدأ عليها التسجيل'
              : memoLive
                ? 'إيقاف التعليق الصوتي'
                : stepCount === 0
                  ? 'التقط خطوة أولًا ثم علّق عليها بصوتك'
                  : 'سجّل تعليقًا صوتيًا لهذه الخطوة — يتوقف ذاتيًا عند بطاقة تالية'
          }
          aria-label={
            autoMemo
              ? memoLive
                ? 'إيقاف التعليق التلقائي'
                : 'تشغيل التعليق التلقائي'
              : memoLive
                ? 'إيقاف التعليق الصوتي'
                : stepCount === 0
                  ? 'التقط خطوة أولًا ثم علّق عليها بصوتك'
                  : 'سجّل تعليقًا صوتيًا لهذه الخطوة'
          }
          disabled={paused || memoDenied || (!autoMemo && stepCount === 0)}
          onClick={onMemoPress}
        >
          <MicIcon /> {memoLive ? 'يسجّل' : autoMemo ? 'تلقائي' : 'ميك'} {memoLive && <MemoTimer startedAt={memoLive.startedAt} />}
        </button>
        <button
          className={`tool danger${cancelArmed ? ' armed' : ''}`}
          title={cancelArmed ? `اضغط مجددًا لتأكيد الإلغاء (${ar(cancelLeft)})` : 'إلغاء التسجيل'}
          aria-label={cancelArmed ? 'اضغط مجددًا لتأكيد الإلغاء' : 'إلغاء التسجيل'}
          onClick={onCancelPress}
        >
          <TrashIcon /> {cancelArmed ? `تأكيد الإلغاء (${ar(cancelLeft)})` : 'إلغاء'}
        </button>
      </div>
      <button className="cap-finish" aria-label="إنهاء ونشر الدليل" onClick={onFinishPress}>
        <CheckIcon /> إنهاء الالتقاط
      </button>
    </div>
  )
}

export function PreviewShot({
  src,
  mark,
  alt,
}: {
  src: string
  mark?: { x: number; y: number; w: number; h: number }
  alt: string
}) {
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null)
  // نافذة العرض بالبكسل — تُقاس في مسار التكبير وحده لحساب إطار zoomFrame
  const [view, setView] = useState<{ w: number; h: number } | null>(null)
  const boxRef = useRef<HTMLDivElement | null>(null)
  // علة «التحديد لا يظهر في المعاينة أبدًا»: الاعتماد على onLoad وحده يسقط حين
  // تُفكّ صورة data:URL متزامنةً قبل ربط المستمع، فلا يُضبط nat فلا يُحسب الإطار.
  // نقرأ الأبعاد فور توفر العنصر (complete) عبر callback ref، وonLoad يبقى للحالة
  // غير المتزامنة. reset عند تبدّل المصدر كي لا تُستعمل أبعاد لقطة سابقة.
  const readNat = (img: HTMLImageElement | null) => {
    if (img && img.complete && img.naturalWidth > 0) {
      setNat((prev) =>
        prev && prev.w === img.naturalWidth && prev.h === img.naturalHeight
          ? prev
          : { w: img.naturalWidth, h: img.naturalHeight },
      )
    }
  }
  useEffect(() => setNat(null), [src])
  // قياس نافذة التكبير ومتابعة تغيّر عرض اللوحة — ResizeObserver يطلق نداءً أوليًا بالمقاس الحالي
  useEffect(() => {
    const el = boxRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setView({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const img = (
    <img
      ref={readNat}
      src={src}
      alt={alt}
      onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
    />
  )

  // بلا إطار (تنقّل / مستطيل ضامر): اللقطة كاملةً كما اليوم — لا عنصر لتأكيده فلا تكبير
  if (!mark) return <div className="step-shot">{img}</div>

  // مسار التكبير: نافذة بنسبة ثابتة تقصّ، وطبقة مكبّرة تضمّ الصورة والإطار معًا
  // فيبقى الإطار الأحمر منطبقًا على العنصر بعد التحويل (طلب المالك 2026-09-11).
  const box = nat ? markBoxStyle(mark, nat.w, nat.h) : null
  const frame = nat && view ? zoomFrame(mark, nat.w, nat.h, view.w, view.h) : null
  const layerStyle = frame
    ? {
        transform: `translate(${frame.translateX}px, ${frame.translateY}px) scale(${frame.scale})`,
        transformOrigin: '0 0',
      }
    : undefined
  return (
    <div className="step-shot zoom" ref={boxRef}>
      <div className="shot-zoom" style={layerStyle}>
        {img}
        {box && <span className="shot-mark" style={box} aria-hidden="true" />}
      </div>
    </div>
  )
}

/** عنصر نائب «يرسم التحديد…» — يملأ نافذة البطاقة الأحدث أثناء انتظار وصول اللقطة
 *  المكبّرة (نافذة الثانية بين ظهور صف الخطوة وانتهاء الالتقاط). طلب المالك 2026-09-11. */
export function PendingShot() {
  return (
    <div className="step-shot pending" role="img" aria-label="يجري رسم التحديد">
      <span className="pending-sheen" aria-hidden="true" />
      <span className="pending-cap">يرسم التحديد…</span>
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
