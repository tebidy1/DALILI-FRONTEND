import { Link } from 'react-router-dom'
import type { LibraryHealthItemDto } from '@dalili/shared'
import { client } from '../api'
import { t } from '../i18n'
import { relativeTimeAr } from '../lib/format'
import { useLoad } from '../console/useLoad'
import { LoadState } from '../console/LoadState'

/** ب (§٦): «صحة المكتبة» في لوحة الشركة — أدلة سقط توثيقها بتحديث، وأدلة موقوفة بسببها */
export function LibraryHealthPage() {
  const { data, failed, reload } = useLoad((s) => client.getLibraryHealth(s), [])
  return (
    <section>
      <h2 className="console-h2">{t('admin.navHealth')}</h2>
      <p className="muted">{t('health.intro')}</p>
      <LoadState data={data} failed={failed} onRetry={reload}>
        {() =>
          data && (
            <>
              <HealthList
                title={t('health.reverify')}
                hint={t('health.reverifyHint')}
                empty={t('health.reverifyEmpty')}
                items={data.reverify}
                detail={(g) => t('health.byOwner', { name: g.ownerName })}
              />
              <HealthList
                title={t('health.suspended')}
                empty={t('health.suspendedEmpty')}
                items={data.suspended}
                detail={(g) => t('health.suspendedBy', { name: g.byName ?? '', reason: g.reason ?? '' })}
              />
            </>
          )
        }
      </LoadState>
    </section>
  )
}

function HealthList(p: { title: string; hint?: string; empty: string; items: LibraryHealthItemDto[]; detail: (g: LibraryHealthItemDto) => string }) {
  return (
    <div className="card form-stack">
      <h3>{p.title}</h3>
      {p.hint && <p className="muted">{p.hint}</p>}
      {p.items.length === 0 ? (
        <p className="muted">{p.empty}</p>
      ) : (
        <ul className="console-list">
          {p.items.map((g) => (
            <li key={g.id}>
              <Link to={`/g/${g.id}`}>
                <bdi>{g.title}</bdi>
              </Link>
              <span className="muted">
                {' — '}
                {p.detail(g)} · {relativeTimeAr(g.updatedAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
