import { useEffect, useState } from 'react'
import type { DeviceDto } from '@dalili/shared'
import { client } from '../api'
import { t } from '../i18n'
import { useConfirm } from '../components/ConfirmProvider'

/** DTOP-03: الأجهزة المرتبطة — القائمة وإلغاء الربط الفوري */
export function DevicesCard() {
  const confirm = useConfirm()
  const [devices, setDevices] = useState<DeviceDto[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const ac = new AbortController()
    client
      .listDevices(ac.signal)
      .then(setDevices)
      .catch(() => setDevices([]))
    return () => ac.abort()
  }, [])

  async function revoke(d: DeviceDto) {
    if (!(await confirm({ title: t('settings.deviceRevoke'), body: t('settings.deviceRevokeConfirm', { name: d.deviceName }), danger: true }))) return
    try {
      await client.revokeDevice(d.id)
      setDevices((list) => (list ?? []).filter((x) => x.id !== d.id))
    } catch {
      setError(t('common.unexpected'))
    }
  }

  return (
    <section className="settings-card" aria-label={t('settings.devices')}>
      <h2>{t('settings.devices')}</h2>
      <p className="muted card-desc">{t('settings.devicesDesc')}</p>
      {error && <div className="err" role="alert">{error}</div>}
      {devices === null ? (
        <div className="muted">…</div>
      ) : (
        <ul className="settings-folders">
          {devices.map((d) => (
            <li key={d.id}>
              <span>
                <bdi>{d.deviceName}</bdi>
                <small className="muted">
                  {' · '}
                  <span>
                    {d.lastUsedAt ? t('settings.deviceLastUsed', { date: new Date(d.lastUsedAt).toLocaleDateString('ar') }) : t('settings.deviceNeverUsed')}
                  </span>
                </small>
              </span>
              <button className="af-x" aria-label={`${t('settings.deviceRevoke')} — ${d.deviceName}`} onClick={() => void revoke(d)}>
                ✕
              </button>
            </li>
          ))}
          {devices.length === 0 && <li className="muted">{t('settings.noDevices')}</li>}
        </ul>
      )}
    </section>
  )
}
