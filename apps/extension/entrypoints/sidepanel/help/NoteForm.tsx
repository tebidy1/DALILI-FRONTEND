import { useState } from 'react'
import { toArabicDigits } from '@/lib/ar-digits'
import { t } from '@/lib/i18n'
import type { HelpPublishInput } from './useHelp'

/** هـ ج١ (HLP) نموذج الشريك في اللوحة — النصوص الحرفية من جدول الخطة، والعدّاد
 *  عند ١٨٠ حرفًا، و«انشر» لا يعمل بجملة فارغة أو جمهور «شركات محددة» بلا شركة.
 *  «أوقف» لمن يملك الإشراف وحده، وبسبب لا يُنفَّذ فارغًا. */

export function NoteForm({
  label,
  editing,
  initial,
  guides,
  clients,
  moderate,
  busy,
  onPublish,
  onSuspend,
  onCancel,
}: {
  label: string
  /** تعديل شرح قائم («احفظ»/«أوقف») أم شرح جديد («انشر») */
  editing: boolean
  initial: { body: string; guideId: string | null; audience: 'all' | 'listed'; companyIds: string[] }
  guides: { id: string; title: string }[]
  clients: { id: string; name: string }[]
  moderate: boolean
  busy: boolean
  onPublish: (input: HelpPublishInput) => void
  onSuspend: (reason: string) => void
  onCancel: () => void
}) {
  const [body, setBody] = useState(initial.body)
  const [guideId, setGuideId] = useState(initial.guideId)
  const [audience, setAudience] = useState(initial.audience)
  const [companyIds, setCompanyIds] = useState<string[]>(initial.companyIds)
  const [suspending, setSuspending] = useState(false)
  const [reason, setReason] = useState('')

  const counterOn = body.length >= 180
  const canPublish = body.trim() !== '' && (audience === 'all' || companyIds.length > 0)

  const toggleCompany = (id: string, on: boolean) =>
    setCompanyIds((ids) => (on ? [...new Set([...ids, id])] : ids.filter((c) => c !== id)))

  return (
    <div className="note-form">
      <div className="note-form-head">{t('ext.helpFormTitle', { label })}</div>

      <label className="note-label">
        <span>{t('ext.helpFormBodyLabel')}</span>
        <textarea
          value={body}
          rows={3}
          maxLength={200}
          onChange={(e) => setBody(e.target.value)}
          aria-label={t('ext.helpFormBodyLabel')}
        />
        {counterOn && <small className="note-count">{t('ext.helpFormCounter', { count: toArabicDigits(body.length) })}</small>}
      </label>

      {guides.length > 0 && (
        <label className="note-label">
          <span>{t('ext.helpFormLinkGuide')}</span>
          <select value={guideId ?? ''} onChange={(e) => setGuideId(e.target.value || null)} aria-label={t('ext.helpFormLinkGuide')}>
            <option value="">{t('ext.helpFormNoGuide')}</option>
            {guides.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
        </label>
      )}

      <fieldset className="note-audience">
        <legend>{t('ext.helpFormAudience')}</legend>
        <label>
          <input type="radio" name="help-audience" checked={audience === 'all'} onChange={() => setAudience('all')} />
          <span>{t('ext.helpFormAudienceAll')}</span>
        </label>
        <label>
          <input
            type="radio"
            name="help-audience"
            checked={audience === 'listed'}
            onChange={() => setAudience('listed')}
            aria-label={t('ext.helpFormAudienceListed')}
          />
          <span>{t('ext.helpFormAudienceListed')}</span>
        </label>
        {audience === 'listed' &&
          clients.map((c) => (
            <label key={c.id} className="note-client">
              <input
                type="checkbox"
                checked={companyIds.includes(c.id)}
                onChange={(e) => toggleCompany(c.id, e.target.checked)}
                aria-label={c.name}
              />
              <span>{c.name}</span>
            </label>
          ))}
      </fieldset>

      {suspending ? (
        <div className="note-form-row">
          <label className="note-label">
            <span>{t('ext.helpFormSuspendReason')}</span>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-label={t('ext.helpFormSuspendReason')}
            />
          </label>
          <div className="note-form-actions">
            <button type="button" className="danger" disabled={busy || reason.trim() === ''} onClick={() => onSuspend(reason.trim())}>
              {t('ext.helpFormSuspend')}
            </button>
            <button type="button" className="ghost" onClick={() => setSuspending(false)}>
              {t('ext.helpFormCancel')}
            </button>
          </div>
        </div>
      ) : (
        <div className="note-form-actions">
          <button type="button" disabled={busy || !canPublish} onClick={() => onPublish({ body: body.trim(), guideId, audience, companyIds })}>
            {editing ? t('ext.helpFormSave') : t('ext.helpFormPublish')}
          </button>
          {moderate && (
            <button type="button" className="danger" disabled={busy} onClick={() => setSuspending(true)}>
              {t('ext.helpFormSuspend')}
            </button>
          )}
          <button type="button" className="ghost" disabled={busy} onClick={onCancel}>
            {t('ext.helpFormCancel')}
          </button>
        </div>
      )}
    </div>
  )
}
