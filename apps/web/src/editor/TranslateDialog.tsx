import { t } from '../i18n'
import { Button } from '../ui/Button'

/**
 * TRNS-01: بطاقة الترجمة — صدق كامل قبل التنفيذ: ماذا يُترجَم، ماذا لا، وسطر الخصوصية.
 * الحالات: info (زر بدء/إعادة + تنويهة قدم إن وجدت) · running (بلا زر) · error (رسالة + زر عائد).
 */
export type TranslatePhase = 'info' | 'running' | 'error'

export function TranslateDialog({
  phase,
  errorMsg,
  hasTranslation,
  stale,
  onTranslate,
  onClose,
}: {
  phase: TranslatePhase
  errorMsg?: string
  hasTranslation: boolean
  stale: boolean
  onTranslate: () => void
  onClose: () => void
}) {
  return (
    <div className="url-dialog-backdrop no-print" onClick={onClose}>
      <div
        className="url-dialog translate-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t('editor.translate.title')}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>{t('editor.translate.title')}</h3>
        {stale && <p className="translate-stale">{t('editor.translate.stale')}</p>}
        <p>{t('editor.translate.what')}</p>
        <p>{t('editor.translate.notWhat')}</p>
        <p className="translate-privacy">{t('editor.translate.privacy')}</p>
        {phase === 'error' && errorMsg && <p className="translate-error">{errorMsg}</p>}
        {phase === 'running' ? (
          <p className="translate-running">{t('editor.translate.running')}</p>
        ) : (
          <div className="url-dialog-actions">
            <Button variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button variant="solid" onClick={onTranslate}>
              {hasTranslation ? t('editor.translate.again') : t('editor.translate.action')}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
