import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { DaliliApiError } from '@dalili/shared'
import { client } from '../api'
import { notifyAuthChanged } from '../lib/ext-bridge'
import { Button } from '../ui/Button'
import { t } from '../i18n'
import { getLocale, setLocale } from '../lib/locale'

export function LoginPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const fromExtension = params.get('return') === 'extension'
  // DTOP-03: العودة إلى الصفحة المطلوبة (مثل /device?code=…) — مسار داخلي فقط
  const next = params.get('next')
  // ✎ تصحيح المراجعة: '/\evil.com' تقرؤه المتصفّحات '//evil.com' — أيّ شرطة عكسية ترفض
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : '/'
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
      // AUTH-LIVE: جاءنا من الإضافة؟ أعلنها فورًا لتستيقظ لوحتها بلا إغلاق وإعادة فتح
      if (fromExtension) notifyAuthChanged()
      navigate(safeNext)
    } catch (err) {
      setError(err instanceof DaliliApiError ? err.message : t('common.unexpected'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page page-narrow">
      {/* I18N-01: مفتاح اللغة المصغّر — أول نقطة تماس لمستخدم لا يقرأ العربية */}
      <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
        <button
          type="button"
          aria-pressed={getLocale() === 'ar'}
          onClick={() => setLocale('ar')}
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: getLocale() === 'ar' ? 700 : 400 }}
        >
          ع
        </button>
        <span aria-hidden="true">·</span>
        <button
          type="button"
          aria-pressed={getLocale() === 'en'}
          onClick={() => setLocale('en')}
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: getLocale() === 'en' ? 700 : 400 }}
        >
          EN
        </button>
      </div>
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
