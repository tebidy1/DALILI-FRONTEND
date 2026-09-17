import type { CSSProperties } from 'react'
import type { SessionMeta, StepSummary } from '@/lib/protocol'
import { toArabicDigits } from '@/lib/ar-digits'
import { ChevronIcon, TrashIcon } from './icons'
import { kindLabel, voiceBadgeAr } from './parts'
import { PreviewShot, PendingShot } from './Shot'

/** عدسة الموجة: ٣٦ عمودًا بطور مزاح يرسم موجة سفر أفقية واحدة عبر الشريط */
const WAVE_BARS = Array.from({ length: 36 }, (_, i) => i)

/** قائمة خطوات الالتقاط في اللوحة — الاقتطاع من App.tsx لقانون الحجم.
 * VOX-09: شارة 🎙 قابلة للحذف، وشريط موجي حي أعلى البطاقة قيد التسجيل */
export function StepsList({
  steps,
  meta,
  lastShot,
  revealed,
  armedKey,
  armLeft,
  onReveal,
  onDeleteStep,
  onDeleteMemo,
}: {
  steps: StepSummary[]
  meta: SessionMeta
  lastShot: string | undefined
  revealed: Record<number, string>
  /** المرحلة ٢: مفتاح الزر المسلَّح الآن («s:i» خطوة / «m:i» تعليق) — النقرة الثانية داخل النافذة تحذف */
  armedKey: string | null
  /** المرحلة ٤: ثوانٍ التسليح المتبقية — تُرى على الزر بدل تخمينها */
  armLeft: number
  onReveal: (index: number) => void
  onDeleteStep: (index: number) => void
  onDeleteMemo: (index: number) => void
}) {
  const stepCount = meta.stepCount
  const ar = toArabicDigits
  return (
    <div>
      {steps.length === 0 && <div className="empty">تفاعل مع الصفحة (نقرة أو كتابة) لتظهر الخطوات هنا</div>}
      {steps.map((s) => {
        const isNewest = s.i === stepCount - 1
        // الأحدث تعرض لقطتها دائمًا؛ السابقة تُكشف يدويًا بزر المثلث
        const shot = isNewest ? lastShot : revealed[s.i]
        const expanded = shot !== undefined
        const num = ar(s.i + 1)
        // VOX-09: التعليق الجاري يُظهر شريط الموجة أعلى بطاقته
        const memoOnStep = meta.memoLive?.stepIndex === s.i
        // المرحلة ٢: الحذف خطوتان — الأزرار تتبدل تسميتها وتحمرّ عند التسليح
        const stepArmed = armedKey === `s:${s.i}`
        const memoArmed = armedKey === `m:${s.i}`
        return (
          <div key={s.i} className={`step ${isNewest ? 'fresh' : ''} ${s.sensitive ? 'sensitive' : ''} ${expanded ? 'expanded' : ''}`}>
            {/* شريط التسجيل الحي: موجة أفقية أعلى البطاقة — يظهر فور بدء الصوت ولو لم تصل اللقطة بعد */}
            {memoOnStep && (
              <div className="memo-wave" role="status" aria-label="جارٍ تسجيل تعليق صوتي على هذه البطاقة">
                <span className="memo-wave-label">🎙 جارٍ التسجيل</span>
                <span className="memo-wave-bars" aria-hidden="true">
                  {WAVE_BARS.map((i) => (
                    <i key={i} style={{ '--i': i } as CSSProperties} />
                  ))}
                </span>
              </div>
            )}
            <div className="step-row">
              <span className="n">{num}</span>
              <div className="tx">
                <span className="ttl">{s.title}</span>
                <small>{s.missingReason ? s.missingReason : s.sensitive ? 'محجوبة تلقائيًا 🔒' : kindLabel(s.kind)}</small>
                {s.voice && (
                  <span className="voice-badge" title="تعليق صوتي مدموج مع هذه الخطوة">
                    🎙 {voiceBadgeAr(s.voice.durationMs)}
                    <button
                      className={`voice-del${memoArmed ? ' armed' : ''}`}
                      aria-label={memoArmed ? 'اضغط مجددًا لتأكيد حذف التعليق الصوتي' : 'حذف التعليق الصوتي'}
                      title={memoArmed ? `اضغط مجددًا للتأكيد (${ar(armLeft)})` : 'حذف التعليق الصوتي'}
                      onClick={() => onDeleteMemo(s.i)}
                    >
                      {memoArmed ? ar(armLeft) : '✕'}
                    </button>
                  </span>
                )}
              </div>
              {!isNewest && (
                <button
                  className={`reveal ${expanded ? 'open' : ''}`}
                  aria-label={expanded ? 'إخفاء لقطة الخطوة' : 'إظهار لقطة الخطوة'}
                  aria-expanded={expanded}
                  title={expanded ? 'إخفاء اللقطة' : 'إظهار اللقطة'}
                  onClick={() => onReveal(s.i)}
                >
                  <ChevronIcon />
                </button>
              )}
              <button
                className={`del${stepArmed ? ' armed' : ''}`}
                aria-label={stepArmed ? 'اضغط مجددًا لتأكيد حذف الخطوة' : 'حذف الخطوة'}
                title={stepArmed ? `اضغط مجددًا للتأكيد (${ar(armLeft)})` : 'حذف الخطوة'}
                onClick={() => onDeleteStep(s.i)}
              >
                <TrashIcon />
                {stepArmed && <b className="arm-n">{ar(armLeft)}</b>}
              </button>
            </div>
            {/* نافذة الالتقاط: البطاقة الأحدث تعرض «يرسم التحديد…» حتى تصل لقطتها المكبّرة */}
            {isNewest && !expanded && !s.missingReason && <PendingShot />}
            {expanded && shot && (
              <div className={memoOnStep ? 'memo-live' : ''}>
                <PreviewShot src={shot} mark={s.mark} alt={`لقطة الخطوة ${num}`} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
