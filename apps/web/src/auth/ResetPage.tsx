import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { client } from '../api'
import { t } from '../i18n'
import { Button } from '../ui/Button'

/** م١: كلمة مرور جديدة من رابط البريد — لمرة واحدة، ثم الدخول من جديد */
export function ResetPage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await client.resetPassword(token, password)
      navigate('/login', { replace: true })
    } catch (err) {
      setError((err as Error)?.message || t('common.unexpected'))
      setBusy(false)
    }
  }

  return (
    <div className="page-center">
      <form className="card form-stack invite-page" onSubmit={submit}>
        <h1 className="screen-title">{t('reset.title')}</h1>
        <label>
          {t('reset.newPassword')}
          <input type="password" dir="ltr" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && (
          <>
            <div className="err" role="alert">{error}</div>
            <Link to="/forgot">{t('reset.requestNew')}</Link>
          </>
        )}
        <Button type="submit" busy={busy}>{t('reset.submit')}</Button>
      </form>
    </div>
  )
}
