import { useState } from 'react'
import type { PlatformUserDto } from '@dalili/shared'
import { client } from '../api'
import { t } from '../i18n'
import { roleLabelAr } from '../lib/format'
import { Button } from '../ui/Button'
import { useConfirm } from '../components/ConfirmProvider'
import { StatusChip } from './StatusChip'

/** م٢: الدعم بالبيانات الوصفية — من المستخدم، وأين عضويته، وإرسال رابط استعادة، وإنهاء جلساته */
export function UserLookup() {
  const confirm = useConfirm()
  const [email, setEmail] = useState('')
  const [user, setUser] = useState<PlatformUserDto | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function find(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setNotice('')
    setUser(null)
    try {
      setUser(await client.platformUser(email.trim()))
    } catch (err) {
      setError((err as Error)?.message || t('common.unexpected'))
    }
  }

  async function act(call: () => Promise<unknown>, ok: string) {
    setError('')
    try {
      await call()
      setNotice(ok)
    } catch (err) {
      setError((err as Error)?.message || t('common.unexpected'))
    }
  }

  async function endSessions(u: PlatformUserDto) {
    if (!(await confirm({ title: t('platform.endSessions'), body: t('platform.endSessionsConfirm', { email: u.email }), danger: true }))) return
    await act(() => client.platformEndSessions(u.id), t('platform.sessionsEnded'))
  }

  return (
    <section>
      <h2 className="console-h2">{t('platform.navUsers')}</h2>
      <form className="row console-filters" onSubmit={find}>
        <input type="email" dir="ltr" required aria-label={t('platform.userEmail')} placeholder={t('platform.userEmail')} value={email} onChange={(e) => setEmail(e.target.value)} />
        <Button size="sm" type="submit">{t('platform.userFind')}</Button>
      </form>
      {error && <div className="err" role="alert">{error}</div>}
      {notice && <div className="ok-note" role="status">{notice}</div>}
      {user && (
        <div className="card form-stack">
          <h3 className="console-h3"><bdi>{user.name || user.email}</bdi></h3>
          <p className="muted" dir="ltr">{user.email}</p>
          <table className="console-table">
            <thead>
              <tr>
                <th>{t('platform.colName')}</th>
                <th>{t('platform.colRole')}</th>
                <th>{t('platform.colMembership')}</th>
                <th>{t('platform.colStatus')}</th>
              </tr>
            </thead>
            <tbody>
              {user.memberships.map((m) => (
                <tr key={m.accountId}>
                  <td><bdi>{m.accountName}</bdi></td>
                  <td>{roleLabelAr(m.role)}</td>
                  <td>{t(m.status === 'active' ? 'platform.memberActive' : 'platform.memberDeactivated')}</td>
                  <td><StatusChip status={m.accountStatus} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row">
            <Button size="sm" variant="ghost" onClick={() => void act(() => client.platformResetLink(user.id), t('platform.resetSent', { email: user.email }))}>{t('platform.sendReset')}</Button>
            <Button size="sm" variant="ghost" onClick={() => void endSessions(user)}>{t('platform.endSessions')}</Button>
          </div>
        </div>
      )}
    </section>
  )
}
