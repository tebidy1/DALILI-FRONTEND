import { useState } from 'react'
import { Link } from 'react-router-dom'
import { client } from '../api'
import { t } from '../i18n'
import { Button } from '../ui/Button'

/** م١: «نسيت كلمة المرور» — الرد واحد لكل بريد، فلا تكشف الصفحة من له حساب */
export function ForgotPage() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await client.forgotPassword(email.trim())
      setSent(true)
    } catch (err) {
      setError((err as Error)?.message || t('common.unexpected'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-center">
      <div className="card form-stack invite-page">
        <h1 className="screen-title">{t('forgot.title')}</h1>
        {sent ? (
          <p role="status">{t('forgot.sent')}</p>
        ) : (
          <form className="form-stack" onSubmit={submit}>
            <p className="muted">{t('forgot.desc')}</p>
            <label>
              {t('login.email')}
              <input type="email" dir="ltr" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            {error && <div className="err" role="alert">{error}</div>}
            <Button type="submit" busy={busy}>{t('forgot.send')}</Button>
          </form>
        )}
        <Link to="/login">{t('forgot.backToLogin')}</Link>
      </div>
    </div>
  )
}
