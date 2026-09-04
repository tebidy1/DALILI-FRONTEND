import type { SessionMeta, StepSummary } from '@/lib/protocol'
import { ChevronIcon, TrashIcon } from './icons'
import { PreviewShot, kindLabel, voiceBadgeAr } from './parts'

/** قائمة خطوات الالتقاط في اللوحة — الاقتطاع من App.tsx لقانون الحجم.
 * VOX-09: شارة 🎙 قابلة للحذف، وحلقة حمراء نابضة حول معاينة الخطوة المدموجة */
export function StepsList({
  steps,
  meta,
  lastShot,
  revealed,
  onReveal,
  onDeleteStep,
  onDeleteMemo,
}: {
  steps: StepSummary[]
  meta: SessionMeta
  lastShot: string | undefined
  revealed: Record<number, string>
  onReveal: (index: number) => void
  onDeleteStep: (index: number) => void
  onDeleteMemo: (index: number) => void
}) {
  const stepCount = meta.stepCount
  return (
    <div>
      {steps.length === 0 && <div className="empty">تفاعل مع الصفحة (نقرة أو كتابة) لتظهر الخطوات هنا</div>}
      {steps.map((s) => {
        const isNewest = s.i === stepCount - 1
        // الأحدث تعرض لقطتها دائمًا؛ السابقة تُكشف يدويًا بزر المثلث
        const shot = isNewest ? lastShot : revealed[s.i]
        const expanded = shot !== undefined
        const num = (s.i + 1).toLocaleString('ar-EG')
        // VOX-09: التعليق الجاري يضيء حلقة حمراء حول معاينة الخطوة المدموجة
        const memoOnStep = meta.memoLive?.stepIndex === s.i
        return (
          <div key={s.i} className={`step ${isNewest ? 'fresh' : ''} ${s.sensitive ? 'sensitive' : ''} ${expanded ? 'expanded' : ''}`}>
            <div className="step-row">
              <span className="n">{num}</span>
              <div className="tx">
                <span className="ttl">{s.title}</span>
                <small>{s.missingReason ? s.missingReason : s.sensitive ? 'محجوبة تلقائيًا 🔒' : kindLabel(s.kind)}</small>
                {s.voice && (
                  <span className="voice-badge" title="تعليق صوتي مدموج مع هذه الخطوة">
                    🎙 {voiceBadgeAr(s.voice.durationMs)}
                    <button className="voice-del" aria-label="حذف التعليق الصوتي" title="حذف التعليق الصوتي" onClick={() => onDeleteMemo(s.i)}>
                      ✕
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
              <button className="del" aria-label="حذف الخطوة" title="حذف الخطوة" onClick={() => onDeleteStep(s.i)}>
                <TrashIcon />
              </button>
            </div>
            {memoOnStep && expanded && shot && <div className="memo-hint">🎙 صوتك يُدمج مع هذه الخطوة</div>}
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
