import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { DaliliApiError } from '@dalili/shared'
import { client } from '../api'
import { Button } from '../ui/Button'
import { t } from '../i18n'

export function LoginPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const fromExtension = params.get('return') === 'extension'
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (mode === 'login') await client.login(email, password)
      else await client.register(email, password)
      navigate('/')
    } catch (err) {
      setError(err instanceof DaliliApiError ? err.message : t('common.unexpected'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page page-narrow">
      <h1 className="page-title">{t('app.name')}</h1>
      <p className="muted page-sub">{t('app.tagline')}</p>

      {fromExtension && <div className="ok-note">{t('login.extensionNote')}</div>}

      <div className="tabs">
        <Button variant={mode === 'login' ? 'solid' : 'ghost'} onClick={() => setMode('login')}>
          {t('login.tabLogin')}
        </Button>
        <Button variant={mode === 'register' ? 'solid' : 'ghost'} onClick={() => setMode('register')}>
          {t('login.tabRegister')}
        </Button>
      </div>

      <form className="card form-stack" onSubmit={submit}>
        <label>
          {t('login.email')}
          <input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="name@company.sa" />
        </label>
        <label>
          {t('login.password')}
          <input type="password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        </label>
        {error && <div className="err" role="alert">{error}</div>}
        <Button type="submit" busy={busy}>
          {mode === 'login' ? t('login.submitLogin') : t('login.submitRegister')}
        </Button>
      </form>
    </div>
  )
}
