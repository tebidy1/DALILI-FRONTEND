import { client } from '../api'
import { t } from '../i18n'
import { dualDateAr } from '../lib/format'
import { useLoad } from '../console/useLoad'
import { LoadState } from '../console/LoadState'
import { platformActionLabel } from './actions'

/** م٢: سجل أفعال إدارة المنصة — قراءة فقط، بلا حذف */
export function PlatformAudit() {
  const { data, failed, reload } = useLoad((s) => client.platformAudit(s), [])

  return (
    <section>
      <h2 className="console-h2">{t('platform.navAudit')}</h2>
      <LoadState data={data} failed={failed} onRetry={reload} empty={t('platform.historyEmpty')}>
        {() => (
          <table className="console-table">
            <thead>
              <tr>
                <th>{t('platform.colWhen')}</th>
                <th>{t('platform.colActor')}</th>
                <th>{t('platform.colAction')}</th>
                <th>{t('platform.colTarget')}</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((r) => (
                <tr key={r.id}>
                  <td>{dualDateAr(r.at)}</td>
                  <td><bdi>{r.actorEmail ?? ''}</bdi></td>
                  <td>{platformActionLabel(r.action)}{typeof r.meta?.reason === 'string' ? ` · ${r.meta.reason}` : ''}</td>
                  <td><bdi>{r.targetLabel ?? r.targetId}</bdi></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </LoadState>
    </section>
  )
}
