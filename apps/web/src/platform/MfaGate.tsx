import { useEffect, useState } from 'react'
import type { PlatformMfaDto } from '@dalili/shared'
import { client } from '../api'
import { t } from '../i18n'
import { Button } from '../ui/Button'

/**
 * م٢ المهمة ٢٦: رمز التحقق بخطوتين لكل جلسة إدارة منصة. أول مرة يُعرض السر ورابط otpauth
 * لإضافته في تطبيق المصادقة — ولا يُعرض بعد التسجيل أبداً.
 */
export function MfaGate({ onVerified }: { onVerified: () => void }) {
  const [setup, setSetup] = useState<PlatformMfaDto | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const ac = new AbortController()
    client.platformMfa(ac.signal).then(setSetup).catch(() => setSetup({ enrolled: true }))
    return () => ac.abort()
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await client.platformVerifyMfa(code.trim())
      onVerified()
    } catch (err) {
      setError((err as Error)?.message || t('common.unexpected'))
      setBusy(false)
    }
  }

  return (
    <div className="page-center">
      <form className="card form-stack invite-page" onSubmit={submit}>
        <h1 className="screen-title">{t('platform.mfaTitle')}</h1>
        {setup && !setup.enrolled && setup.secret && (
          <div className="stack">
            <p>{t('platform.mfaSetup')}</p>
            <code className="invite-url" dir="ltr">{setup.secret}</code>
            {setup.otpauthUri && <a href={setup.otpauthUri}>{t('platform.mfaOpenApp')}</a>}
          </div>
        )}
        <label>
          {t('platform.mfaCode')}
          <input dir="ltr" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value)} />
        </label>
        {error && <div className="err" role="alert">{error}</div>}
        <Button type="submit" busy={busy}>{t('platform.mfaVerify')}</Button>
      </form>
    </div>
  )
}
