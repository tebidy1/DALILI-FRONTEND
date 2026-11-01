import { t } from '@/lib/i18n'
import { useHelp, type HelpApi } from './useHelp'
import { NoteForm } from './NoteForm'
import { HelpRequests } from './HelpRequests'

/** هـ ج١ (HLP) شريط «ما هذا؟» أسفل اللوحة — زر الموظف «؟ ما هذا» لكل من دخل،
 *  وزر الشريك «اشرح زراً» لمحرّر شريك وحده، وفي الوضع: التلميح والخروج والنموذج والطلبات. */

export function HelpBar({
  api,
  partnerEditor,
  accountKey,
  onOpenGuide,
}: {
  api: HelpApi
  /** محرّر حساب شريك فقط — ws.kind === 'partner' && role !== 'viewer' */
  partnerEditor: boolean
  /** الحساب النشط — تبديله يطفئ الوضع */
  accountKey: string | undefined
  onOpenGuide: (id: string) => void
}) {
  const h = useHelp(api, accountKey, onOpenGuide)
  if (h.mode === 'off') {
    return (
      <div className="help-bar">
        {h.msg && <p className="help-msg">{h.msg}</p>}
        <div className="help-bar-row">
          <button type="button" className="ghost" disabled={h.busy} onClick={() => void h.ask()}>
            {t('ext.helpAskBtn')}
          </button>
          {partnerEditor && (
            <button type="button" className="ghost" disabled={h.busy} onClick={() => void h.author()}>
              {t('ext.helpAuthorBtn')}
            </button>
          )}
        </div>
      </div>
    )
  }
  return (
    <div className="help-bar on">
      <div className="help-bar-hint">
        <span>{h.mode === 'ask' ? t('ext.helpAskHint') : t('ext.helpAuthorHint')}</span>
        <button type="button" className="ghost sm" onClick={h.exit}>
          {h.mode === 'ask' ? t('ext.helpExitBtn') : t('ext.helpDoneBtn')}
        </button>
      </div>
      {h.msg && <p className="help-msg">{h.msg}</p>}
      {h.mode === 'author' && h.form && h.my && (
        <NoteForm
          label={h.form.pick.label}
          editing={!!h.form.note}
          initial={
            h.form.note
              ? {
                  body: h.form.note.body,
                  guideId: h.form.note.guide?.id ?? null,
                  audience: h.form.note.audience,
                  companyIds: h.form.note.companyIds,
                }
              : { body: '', guideId: null, audience: 'all', companyIds: [] }
          }
          guides={h.my.guides}
          clients={h.my.clients}
          moderate={!!h.form.note?.access.moderate && !h.form.note.suspended}
          busy={h.busy}
          onPublish={(input) => void h.publish(h.form!.pick, h.form!.note, input)}
          onSuspend={(reason) => h.form?.note && void h.suspend(h.form.note, reason)}
          onCancel={() => h.exit()}
        />
      )}
      {h.mode === 'author' && <HelpRequests requests={h.requests} />}
    </div>
  )
}
