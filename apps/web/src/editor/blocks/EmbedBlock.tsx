import { t } from '../../i18n'
import { arDigits } from '../../lib/format'

/**
 * BKL-01: بطاقة الدليل المضمّن — مطوية افتراضيًا، والمؤلف يقرر فردها.
 * تُستعمل في المحرر (بزر إزالة) وفي العارض (بلا زر إزالة، ومعه رابط «اقرأ»).
 * الدليل المفقود (محذوف أو غير متاح عبر الرابط) يعرض رسالة صادقة لا بطاقة فارغة.
 */
export function EmbedBlock({
  title,
  stepCount,
  expanded,
  onToggle,
  onRemove,
  missing,
  missingText,
  thumbUrl,
  openHref,
  children,
}: {
  title: string
  /** غيابه يعني «لم يصل العدد بعد» — لا نكتب صفرًا كاذبًا */
  stepCount?: number
  expanded: boolean
  onToggle: () => void
  onRemove?: () => void
  missing?: boolean
  /** نص الغياب — يختلف بين المحرر (محذوف) والعارض (غير متاح عبر هذا الرابط) */
  missingText?: string
  /** خصوصيّة ٢ب: رابط المصغّرة الموقَّع — لا تركيب من المعرّف */
  thumbUrl?: string
  openHref?: string
  /** الخطوات المفرودة — يمرّرها المستدعي كي لا تعرف البطاقة كيف تُرسم الخطوة */
  children?: React.ReactNode
}) {
  if (missing) {
    return (
      <div className="embed-card embed-card-missing">
        <p className="embed-missing-text">{missingText ?? t('editor.embedMissing')}</p>
        {onRemove && (
          <button type="button" className="embed-remove" onClick={onRemove}>
            {t('editor.embedRemove')}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="embed-card">
      <div className="embed-head">
        {thumbUrl ? (
          <img className="embed-thumb" src={thumbUrl} alt="" loading="lazy" />
        ) : (
          <span className="embed-thumb embed-thumb-letter" aria-hidden>
            {title.trim().charAt(0) || '؟'}
          </span>
        )}
        <div className="embed-meta">
          <span className="embed-title">{title}</span>
          {stepCount !== undefined && (
            <span className="embed-count">{t('editor.embedSteps', { n: arDigits(stepCount) })}</span>
          )}
        </div>
        <div className="embed-actions no-print">
          {openHref && (
            <a className="embed-open" href={openHref}>
              {t('booklet.embedOpen')}
            </a>
          )}
          <button type="button" className="embed-toggle" onClick={onToggle}>
            {expanded ? t('editor.embedCollapse') : t('editor.embedExpand')}
          </button>
          {onRemove && (
            <button type="button" className="embed-remove" onClick={onRemove}>
              {t('editor.embedRemove')}
            </button>
          )}
        </div>
      </div>
      {expanded && children ? <div className="embed-body">{children}</div> : null}
    </div>
  )
}
