import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { InviteInfoDto, MeDto } from '@dalili/shared'
import { client } from '../api'
import { Button } from '../ui/Button'
import { t } from '../i18n'
import { roleLabelAr } from '../lib/format'
import { notifyAuthChanged } from '../lib/ext-bridge'

/**
 * ORG-00: صفحة الدعوة /invite/:token — بلا حارس دخول.
 * صاحب الحساب القائم يدخل بحسابه ثم «انضم بحسابي» (لا كلمة مرور جديدة، ولا 409).
 * البريد بلا حساب يضع كلمة مرور فيُنشأ ويدخل. النجاح يعيد تحميل التطبيق على المساحة الجديدة.
 */

type Load = { kind: 'loading' } | { kind: 'missing' } | { kind: 'ok'; info: InviteInfoDto; me: MeDto | null }

export function InvitePage({ onDone = () => window.location.assign('/') }: { onDone?: () => void }) {
  const { token = '' } = useParams()
  const [state, setState] = useState<Load>({ kind: 'loading' })
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    Promise.all([client.getInvite(token), client.me().catch(() => null)])
      .then(([info, me]) => live && setState({ kind: 'ok', info, me }))
      .catch(() => live && setState({ kind: 'missing' }))
    return () => {
      live = false
    }
  }, [token])

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    setError('')
    try {
      await fn()
      notifyAuthChanged()
      onDone()
    } catch (err) {
      setError((err as { message?: string })?.message ?? t('team.actionError'))
      setBusy(false)
    }
  }

  async function switchAccount() {
    await client.logout().catch(() => {})
    notifyAuthChanged()
    window.location.assign(`/login?next=${encodeURIComponent(`/invite/${token}`)}`)
  }

  let body: React.ReactNode
  if (state.kind === 'loading') body = <div role="status" className="muted">{t('invite.loading')}</div>
  else if (state.kind === 'missing') body = <p>{t('invite.notFound')}</p>
  else {
    const { info, me } = state
    const mine = me && me.email.toLowerCase() === info.email.toLowerCase()
    if (info.accepted) body = <p>{t('invite.accepted')}</p>
    else if (info.expired) body = <p>{t('invite.expired')}</p>
    else if (me && !mine)
      body = (
        <>
          <p>{t('invite.wrongAccount', { me: me.email, email: info.email })}</p>
          <Button onClick={() => void switchAccount()}>{t('invite.logoutSwitch')}</Button>
        </>
      )
    else if (info.hasAccount && mine) body = <Button busy={busy} onClick={() => void run(() => client.joinInvite(token))}>{t('invite.join')}</Button>
    else if (info.hasAccount)
      body = (
        <Link className="btn" to={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}>
          {t('invite.loginToJoin', { email: info.email })}
        </Link>
      )
    else
      body = (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault()
            void run(() => client.acceptInvite(token, { name: name.trim(), password }))
          }}
        >
          <label htmlFor="invite-name">{t('invite.yourName')}</label>
          <input id="invite-name" required maxLength={80} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          <label htmlFor="invite-pass">{t('invite.setPassword')}</label>
          <input id="invite-pass" type="password" minLength={8} required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <Button type="submit" busy={busy}>{t('invite.accept')}</Button>
        </form>
      )
  }

  return (
    <div className="page-center">
      <div className="card invite-page">
        <h1 className="screen-title">{t('invite.title')}</h1>
        {state.kind === 'ok' && <p>{t('invite.body', { ws: state.info.workspaceName, role: roleLabelAr(state.info.role) })}</p>}
        {body}
        {error && <div className="err" role="alert">{error}</div>}
      </div>
    </div>
  )
}
