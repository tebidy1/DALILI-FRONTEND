import { useEffect, useState } from 'react'
import { markBoxStyle } from '@/lib/mark-box'
import { toArabicDigits } from '@/lib/ar-digits'
import type { SessionMeta, StepSummary } from '@/lib/protocol'
import { ChevronIcon, TrashIcon, MicIcon, PauseIcon, PlayIcon, BlurIcon, CheckIcon } from './icons'

/** أجزاء اللوحة الجانبية المشتركة — اقتطاع من App.tsx لقانون الحجم */

type SendMsg = 'start' | 'start-with-audio' | 'finish' | 'pause' | 'resume' | 'cancel'

export function CaptureBar({
  paused,
  blurOn,
  toggleBlur,
  cancelArmed,
  onCancelPress,
  memoLive,
  stepCount,
  memoDenied,
  onMemoPress,
  send,
}: {
  paused: boolean
  blurOn: boolean
  toggleBlur: () => void
  cancelArmed: boolean
  onCancelPress: () => void
  memoLive: SessionMeta['memoLive']
  stepCount: number
  memoDenied: boolean
  onMemoPress: () => void
  send: (t: SendMsg) => void
}) {
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
        {/* VOX-09: زر الميك — التعليق يدمج مع آخر خطوة ملتقطة، فمعطى قبلها بتلميح صادق */}
        <button
          className={`tool mic-tool${memoLive ? ' live' : ''}`}
          title={memoLive ? 'إيقاف التعليق الصوتي' : stepCount === 0 ? 'التقط خطوة أولًا ثم علّق عليها بصوتك' : 'سجّل ملاحظة صوتية لهذه الخطوة'}
          aria-label={memoLive ? 'إيقاف التعليق الصوتي' : stepCount === 0 ? 'التقط خطوة أولًا ثم علّق عليها بصوتك' : 'سجّل ملاحظة صوتية لهذه الخطوة'}
          disabled={stepCount === 0 || paused || memoDenied}
          onClick={onMemoPress}
        >
          <MicIcon /> {memoLive ? <MemoTimer startedAt={memoLive.startedAt} /> : 'ميك'}
        </button>
        <button
          className={`tool danger${cancelArmed ? ' armed' : ''}`}
          title={cancelArmed ? 'اضغط مجددًا لتأكيد الإلغاء' : 'إلغاء التسجيل'}
          aria-label={cancelArmed ? 'اضغط مجددًا لتأكيد الإلغاء' : 'إلغاء التسجيل'}
          onClick={onCancelPress}
        >
          <TrashIcon /> {cancelArmed ? 'تأكيد الإلغاء' : 'إلغاء'}
        </button>
      </div>
      <button className="cap-finish" aria-label="إنهاء ونشر الدليل" onClick={() => send('finish')}>
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
  const box = mark && nat ? markBoxStyle(mark, nat.w, nat.h) : null
  return (
    <div className="step-shot">
      <img
        ref={readNat}
        src={src}
        alt={alt}
        onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
      />
      {box && <span className="shot-mark" style={box} aria-hidden="true" />}
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
