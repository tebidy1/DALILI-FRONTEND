import { useState } from 'react'
import { Link } from 'react-router-dom'
import { client } from '../api'
import { t } from '../i18n'
import { arDigits, formatBytes, relativeTimeAr } from '../lib/format'
import { Button } from '../ui/Button'
import { useLoad } from '../console/useLoad'
import { LoadState } from '../console/LoadState'
import { StatusChip } from './StatusChip'
import { InviteLinkBox } from './InviteLinkBox'

type Kind = 'company' | 'partner'

/** م٢: الشركات أو الشركاء — بحث وفلتر حالة، وإنشاء حساب يرسل دعوة لمديره */
export function AccountsPage({ kind }: { kind: Kind }) {
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const { data, failed, reload } = useLoad((s) => client.platformAccounts({ kind, status, q }, s), [kind, status, q])
  const isPartner = kind === 'partner'

  return (
    <section>
      <h2 className="console-h2">{t(isPartner ? 'platform.navPartners' : 'platform.navCompanies')}</h2>
      <CreateAccount kind={kind} onCreated={reload} />
      <div className="row console-filters">
        <input type="search" aria-label={t('platform.search')} placeholder={t('platform.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label={t('platform.statusFilter')} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t('platform.statusAll')}</option>
          <option value="active">{t('platform.statusActive')}</option>
          <option value="suspended">{t('platform.statusSuspended')}</option>
          <option value="ended">{t('platform.statusEnded')}</option>
        </select>
      </div>
      <LoadState data={data} failed={failed} onRetry={reload} empty={t('platform.accountsEmpty')}>
        {() => (
          <table className="console-table">
            <thead>
              <tr>
                <th>{t('platform.colName')}</th>
                <th>{t('platform.colStatus')}</th>
                <th>{t('platform.colAdmin')}</th>
                <th>{t('platform.colMembers')}</th>
                <th>{t('platform.colGuides')}</th>
                <th>{t('platform.colStorage')}</th>
                <th>{t('platform.colActivity')}</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((a) => (
                <tr key={a.id}>
                  <td><Link to={`/platform/accounts/${a.id}`}><bdi>{a.name}</bdi></Link></td>
                  <td><StatusChip status={a.status} /></td>
                  <td><bdi>{a.adminEmails[0] ?? t('platform.noAdminYet')}</bdi></td>
                  <td>{arDigits(a.members)}</td>
                  <td>{arDigits(a.guides)}</td>
                  <td>{formatBytes(a.storageBytes)}</td>
                  <td>{a.lastActivityAt ? relativeTimeAr(a.lastActivityAt) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </LoadState>
    </section>
  )
}

function CreateAccount({ kind, onCreated }: { kind: Kind; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ email: string; emailed: boolean; url: string } | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const res = await client.platformCreateAccount({ kind, name: name.trim(), adminEmail: adminEmail.trim(), note: note.trim() })
      setResult({ email: adminEmail.trim(), emailed: res.invite.emailed, url: res.invite.inviteUrl })
      setName('')
      setAdminEmail('')
      setNote('')
      onCreated()
    } catch (err) {
      setError((err as Error)?.message || t('common.unexpected'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card form-stack console-create" onSubmit={submit}>
      <div className="row">
        <label>
          {t('platform.accountName')}
          <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          {t('platform.adminEmail')}
          <input type="email" dir="ltr" required value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />
        </label>
      </div>
      <label>
        {t('platform.note')}
        <input value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {error && <div className="err" role="alert">{error}</div>}
      {result && <InviteLinkBox email={result.email} url={result.url} emailed={result.emailed} />}
      <Button type="submit" busy={busy}>{t(kind === 'partner' ? 'platform.createPartner' : 'platform.createCompany')}</Button>
    </form>
  )
}
