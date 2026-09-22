import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DaliliApiError, type DevicePendingDto } from '@dalili/shared'
import { client } from '../api'
import { Button } from '../ui/Button'
import { t } from '../i18n'

type Phase = 'enter' | 'loading' | 'confirm' | 'approved' | 'denied'

/** DTOP-03: الموافقة على ربط تطبيق الديسكتوب — اسم الجهاز والرمز قبل القرار، والقرار صريح بزرّين */
export function DevicePage() {
  const [params] = useSearchParams()
  const initial = params.get('code') ?? ''
  const [code, setCode] = useState(initial)
  const [pending, setPending] = useState<DevicePendingDto | null>(null)
  const [phase, setPhase] = useState<Phase>(initial ? 'loading' : 'enter')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function lookup(c: string) {
    setError('')
    setPhase('loading')
    try {
      setPending(await client.devicePending(c))
      setPhase('confirm')
    } catch (err) {
      setError(err instanceof DaliliApiError ? err.message : t('common.unexpected'))
      setPhase('enter')
    }
  }

  useEffect(() => {
    if (initial) void lookup(initial)
    // مرّة عند التركيب — الرمز القادم من التطبيق
  }, [initial])

  async function decide(approve: boolean) {
    if (!pending) return
    setBusy(true)
    setError('')
    try {
      await client.deviceApprove(pending.userCode, approve)
      setPhase(approve ? 'approved' : 'denied')
    } catch (err) {
      setError(err instanceof DaliliApiError ? err.message : t('common.unexpected'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page page-narrow">
      <h1 className="page-title">{t('device.title')}</h1>
      {error && <div className="err" role="alert">{error}</div>}

      {phase === 'enter' && (
        <form
          className="card form-stack"
          onSubmit={(e) => {
            e.preventDefault()
            if (code.trim()) void lookup(code.trim())
          }}
        >
          <p className="muted">{t('device.enterCode')}</p>
          <label>
            {t('device.codeLabel')}
            <input dir="ltr" value={code} onChange={(e) => setCode(e.target.value)} placeholder="BCDF-GHJK" autoComplete="off" />
          </label>
          <Button type="submit">{t('device.lookup')}</Button>
        </form>
      )}

      {phase === 'loading' && <div className="muted">…</div>}

      {phase === 'confirm' && pending && (
        <div className="card form-stack">
          <p>{t('device.confirm', { name: pending.deviceName })}</p>
          <p className="muted">{t('device.codeShown', { code: pending.userCode })}</p>
          <div className="row">
            <Button busy={busy} onClick={() => void decide(true)}>
              {t('device.approve')}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => void decide(false)}>
              {t('device.deny')}
            </Button>
          </div>
        </div>
      )}

      {phase === 'approved' && <div className="ok-note">{t('device.approved')}</div>}
      {phase === 'denied' && <div className="muted">{t('device.denied')}</div>}
    </div>
  )
}
