import { useEffect, useState } from 'react'
import { client } from '../api'
import { t } from '../i18n'
import { arDigits, formatBytes } from '../lib/format'
import { Button } from '../ui/Button'
import { useLoad } from '../console/useLoad'
import { LoadState } from '../console/LoadState'
import { StatusChip } from '../platform/StatusChip'

/** م٢: «الحساب» في لوحة الشركة — الاسم، والخطة (مجانية الآن)، والاستعمال، والحالة */
export function AccountPage() {
  const { data, setData, failed, reload } = useLoad((s) => client.getCompanyAccount(s), [])
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => setName(data?.name ?? ''), [data?.name])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      setData(await client.renameCompanyAccount(name.trim()))
      setNotice(t('account.nameSaved'))
    } catch (err) {
      setError((err as Error)?.message || t('common.unexpected'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h2 className="console-h2">{t('admin.navAccount')}</h2>
      <LoadState data={data} failed={failed} onRetry={reload}>
        {() =>
          data && (
            <>
              <div className="console-stats">
                <div className="console-stat"><span className="muted">{t('platform.plan')}</span><strong>{t('account.planFree')}</strong></div>
                <div className="console-stat"><span className="muted">{t('platform.colMembers')}</span><strong>{arDigits(data.members)}</strong></div>
                <div className="console-stat"><span className="muted">{t('platform.colGuides')}</span><strong>{arDigits(data.guides)}</strong></div>
                <div className="console-stat"><span className="muted">{t('platform.colStorage')}</span><strong>{formatBytes(data.storageBytes)}</strong></div>
                <div className="console-stat"><span className="muted">{t('platform.colStatus')}</span><StatusChip status={data.status} /></div>
              </div>
              <form className="card form-stack" onSubmit={save}>
                <label>
                  {t('account.name')}
                  <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
                </label>
                {error && <div className="err" role="alert">{error}</div>}
                {notice && <div className="ok-note" role="status">{notice}</div>}
                <Button size="sm" type="submit" busy={busy}>{t('account.saveName')}</Button>
              </form>
            </>
          )
        }
      </LoadState>
    </section>
  )
}
