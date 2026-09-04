import { useMemo, useState } from 'react'
import type { GuideDto } from '@dalili/shared'
import { replaceStepUrls } from '@dalili/core'
import { t } from '../i18n'
import { Button } from '../ui/Button'

/**
 * EDT-07: حوار «استبدال روابط» — حقلان باتجاه LTR (القديم ← الجديد) وزر معاينة
 * يعرض الخطوات المتأثرة بعدّها الصريح قبل أي تنفيذ، و«تطبيق» ينفذ الكل بتراجع واحد.
 * لا تطابق = رسالة صادقة بلا تعديل. Enter الصريح وزر إرسال (قانون IAB).
 */
export function UrlReplaceDialog({
  guide,
  onApply,
  onClose,
}: {
  guide: GuideDto
  onApply: (steps: GuideDto['steps'], changed: number) => void
  onClose: () => void
}) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [previewed, setPreviewed] = useState(false)

  const result = useMemo(() => {
    if (!previewed || !from.trim()) return null
    return replaceStepUrls(guide.steps, from.trim(), to.trim())
  }, [previewed, from, to, guide.steps])

  const affected = useMemo(() => {
    if (!result || result.changed === 0) return []
    return guide.steps
      .map((s, i) => ({ title: s.title, before: s.url, after: result.steps[i]!.url, changed: s.url !== result.steps[i]!.url }))
      .filter((x) => x.changed)
  }, [result, guide.steps])

  function submitPreview() {
    setPreviewed(true)
  }

  function apply() {
    if (!result || result.changed === 0) return
    onApply(result.steps, result.changed)
  }

  return (
    <div className="url-dialog-backdrop no-print" onClick={onClose}>
      <div
        className="url-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t('editor.urlReplaceTitle')}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>{t('editor.urlReplaceTitle')}</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submitPreview()
          }}
        >
          <label className="url-field">
            <span>{t('editor.urlReplaceFrom')}</span>
            <input
              dir="ltr"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value)
                setPreviewed(false)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  submitPreview()
                }
              }}
              placeholder="https://erp.old.com/invoices"
            />
          </label>
          <label className="url-field">
            <span>{t('editor.urlReplaceTo')}</span>
            <input
              dir="ltr"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="https://erp.new.com/fawatir"
            />
          </label>
          <button type="submit" className="icon-btn wide">
            {t('editor.urlReplacePreview')}
          </button>
        </form>

        {result && result.changed === 0 && <p className="muted">{t('editor.urlReplaceNone')}</p>}
        {affected.length > 0 && (
          <>
            <p className="url-affected-count">{t('editor.urlReplaceAffected', { count: affected.length })}</p>
            <ul className="url-affected-list">
              {affected.map((a) => (
                <li key={a.title + a.before}>
                  <bdi>{a.title}</bdi>
                  <span dir="ltr" className="url-old">{a.before}</span>
                  <span dir="ltr" className="url-new">{a.after}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="row">
          <Button onClick={apply} disabled={!result || result.changed === 0}>
            {t('editor.urlReplaceApply')}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t('editor.urlReplaceClose')}
          </Button>
        </div>
      </div>
    </div>
  )
}
