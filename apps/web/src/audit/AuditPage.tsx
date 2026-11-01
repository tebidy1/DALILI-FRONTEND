import { useCallback, useEffect, useState } from 'react'
import type { AuditEntryDto } from '@dalili/shared'
import { client } from '../api'
import { StateView } from '../ui/StateView'
import { Button } from '../ui/Button'
import { IconCloudOff, IconInbox } from '../ui/icons'
import { t, type TKey } from '../i18n'
import { fmtDateTime, hijriDateAr } from '../lib/format'

/**
 * ORG-08: سجل التدقيق لمدير المساحة — من، ومتى، وماذا، وعلى من. لا حذف من هنا عمداً.
 * أربع حالات: تحميل، وفارغ، وخطأ بإعادة، ونتائج. «أقدم» يجلب الصفحة التالية بـbefore.
 */

const ACTIONS = [
  'invite.create', 'invite.accept', 'member.add', 'member.role', 'member.remove',
  'member.deactivate', 'member.reactivate', 'member.can_publish', 'member.team', 'guide.publish', 'guide.unpublish',
  'guide.team', 'team.create', 'team.rename', 'team.parent', 'team.archive', 'team.unarchive', 'team.delete', 'team.managers',
  'system.add', 'system.remove', 'system.partner', 'system.domain_add', 'system.domain_remove', 'profile.update', 'profile.logo', 'guide.official', 'partner.stop_service',
] as const

function actionLabel(a: string): string {
  return (ACTIONS as readonly string[]).includes(a) ? t(`audit.a.${a}` as TKey) : a
}

type Load = { kind: 'loading' } | { kind: 'error' } | { kind: 'forbidden' } | { kind: 'ok'; items: AuditEntryDto[]; more: boolean }

const PAGE = 50

export function AuditPage() {
  const [action, setAction] = useState('')
  const [state, setState] = useState<Load>({ kind: 'loading' })
  const [seq, setSeq] = useState(0)
  const reload = useCallback(() => setSeq((s) => s + 1), [])

  useEffect(() => {
    const ac = new AbortController()
    setState({ kind: 'loading' })
    client
      .listAudit({ action: action || undefined, before: undefined }, ac.signal)
      .then((r) => setState({ kind: 'ok', items: r.items, more: r.items.length === PAGE }))
      .catch((err: { status?: number; name?: string }) => {
        if (err?.name === 'AbortError') return
        setState(err?.status === 403 ? { kind: 'forbidden' } : { kind: 'error' })
      })
    return () => ac.abort()
  }, [action, seq])

  async function older() {
    if (state.kind !== 'ok') return
    const last = state.items[state.items.length - 1]
    try {
      const r = await client.listAudit({ action: action || undefined, before: last?.at })
      setState({ kind: 'ok', items: [...state.items, ...r.items], more: r.items.length === PAGE })
    } catch {
      setState({ kind: 'error' })
    }
  }

  return (
    <div className="page audit">
      <div className="toolbar">
        <h1 className="row screen-title">{t('audit.title')}</h1>
        <div className="row">
          <select aria-label={t('audit.filterA11y')} value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">{t('audit.filterAll')}</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {actionLabel(a)}
              </option>
            ))}
          </select>
          <a className="btn ghost sm" href={client.auditCsvUrl(action || undefined)}>
            {t('audit.export')}
          </a>
        </div>
      </div>
      <p className="muted">{t('audit.desc')}</p>

      {state.kind === 'loading' && <div role="status" aria-live="polite" className="muted">{t('library.loadingA11y')}</div>}
      {state.kind === 'forbidden' && <div className="muted team-note">{t('audit.forbidden')}</div>}
      {state.kind === 'error' && (
        <StateView kind="error" icon={<IconCloudOff size={30} />} title={t('audit.loadError')} desc={t('library.loadErrorDesc')} action={{ label: t('common.retry'), onAction: reload }} />
      )}
      {state.kind === 'ok' && state.items.length === 0 && (
        <StateView kind="empty" icon={<IconInbox size={30} />} title={t('audit.empty')} desc={t('audit.emptyDesc')} />
      )}
      {state.kind === 'ok' && state.items.length > 0 && (
        <>
          <div className="table-wrap">
            <table className="team-table">
              <thead>
                <tr>
                  <th>{t('audit.colAt')}</th>
                  <th>{t('audit.colActor')}</th>
                  <th>{t('audit.colAction')}</th>
                  <th>{t('audit.colTarget')}</th>
                </tr>
              </thead>
              <tbody>
                {state.items.map((r) => (
                  <tr key={r.id}>
                    <td className="muted" title={hijriDateAr(r.at)}>{fmtDateTime(r.at)}</td>
                    <td><bdi>{r.actorEmail ?? r.actorId}</bdi></td>
                    <td>{actionLabel(r.action)}</td>
                    <td><bdi>{r.targetLabel ?? r.targetId}</bdi></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {state.more && (
            <Button size="sm" variant="ghost" onClick={() => void older()}>
              {t('audit.more')}
            </Button>
          )}
        </>
      )}
    </div>
  )
}
