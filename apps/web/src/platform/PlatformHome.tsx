import { Link } from 'react-router-dom'
import { client } from '../api'
import { t } from '../i18n'
import { arDigits, formatBytes } from '../lib/format'
import { useLoad } from '../console/useLoad'
import { LoadState } from '../console/LoadState'
import { StatusChip } from './StatusChip'

/** م٢: رئيسية إدارة المنصة — الأعداد حسب الحالة، وآخر الحسابات المنشأة */
export function PlatformHome() {
  const { data, failed, reload } = useLoad((s) => client.platformSummary(s), [])

  return (
    <section>
      <h2 className="console-h2">{t('platform.homeTitle')}</h2>
      <LoadState data={data} failed={failed} onRetry={reload}>
        {() =>
          data && (
            <>
              <div className="console-stats">
                <Stat label={t('platform.statCompanies')} value={arDigits(data.companies.active)} sub={t('platform.statSuspended', { count: arDigits(data.companies.suspended) })} />
                <Stat label={t('platform.statPartners')} value={arDigits(data.partners.active)} sub={t('platform.statSuspended', { count: arDigits(data.partners.suspended) })} />
                <Stat label={t('platform.statActiveUsers')} value={arDigits(data.activeUsers30d)} />
                <Stat label={t('platform.statGuides')} value={arDigits(data.guides)} sub={formatBytes(data.storageBytes)} />
              </div>
              <h3 className="console-h3">{t('platform.recent')}</h3>
              <ul className="console-list">
                {data.recent.map((a) => (
                  <li key={a.id}>
                    <Link to={`/platform/accounts/${a.id}`}><bdi>{a.name}</bdi></Link>
                    <StatusChip status={a.status} />
                    <span className="muted">{t(a.kind === 'partner' ? 'platform.kindPartner' : 'platform.kindCompany')}</span>
                  </li>
                ))}
              </ul>
            </>
          )
        }
      </LoadState>
    </section>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="console-stat">
      <span className="muted">{label}</span>
      <strong>{value}</strong>
      {sub && <small className="muted">{sub}</small>}
    </div>
  )
}
