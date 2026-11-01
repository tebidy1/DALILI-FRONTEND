import { useState } from 'react'
import type { PartnerConsoleDto } from '@dalili/shared'
import { client } from '../api'
import { t } from '../i18n'
import { arDigits, hijriDateAr } from '../lib/format'
import { useLoad } from '../console/useLoad'
import { LoadState } from '../console/LoadState'
import { SystemTile } from '../console/SystemTile'
import { useConfirm } from '../components/ConfirmProvider'

/**
 * ش١ (الخطة §٣.٣): لوحة الشريك — «العملاء» (الشركات التي اختارته لنظام) و«الأنظمة» التي
 * حددتها له إدارة المنصة. ش٢: «أوقف الخدمة» لشركة بتأكيد، و«التقارير».
 */
function usePartnerConsole() {
  return useLoad((s) => client.partnerConsole(s), [])
}

export function PartnerClientsPage() {
  const { data, setData, failed, reload } = usePartnerConsole()
  const confirm = useConfirm()
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  async function stop(c: PartnerConsoleDto['clients'][number]) {
    const ok = await confirm({ title: t('partner.stopTitle', { company: c.companyName, system: c.systemName }), body: t('partner.stopBody'), confirmLabel: t('partner.stop'), danger: true })
    if (!ok) return
    setBusy(`${c.companyId}:${c.systemId}`)
    setError('')
    try {
      setData(await client.stopPartnerService(c.companyId, c.systemId))
    } catch (err) {
      setError((err as Error)?.message || t('common.unexpected'))
    } finally {
      setBusy('')
    }
  }

  return (
    <section>
      <h2 className="console-h2">{t('admin.navClients')}</h2>
      {error && <div className="err" role="alert">{error}</div>}
      <LoadState data={data} failed={failed} onRetry={reload}>
        {() =>
          data!.clients.length === 0 ? (
            <p className="muted">{t('partner.noClients')}</p>
          ) : (
            <table className="console-table">
              <thead>
                <tr>
                  <th>{t('partner.colCompany')}</th>
                  <th>{t('partner.colSystem')}</th>
                  <th>{t('partner.colSince')}</th>
                  <th><span className="sr-only">{t('partner.stop')}</span></th>
                </tr>
              </thead>
              <tbody>
                {data!.clients.map((c) => (
                  <tr key={`${c.companyId}:${c.systemId}`}>
                    <td><bdi>{c.companyName}</bdi></td>
                    <td><bdi>{c.systemName}</bdi></td>
                    <td>{hijriDateAr(c.since)}</td>
                    <td>
                      <button type="button" className="btn ghost sm danger-text" disabled={busy === `${c.companyId}:${c.systemId}`}
                        aria-label={t('partner.stopA11y', { company: c.companyName })} onClick={() => void stop(c)}>
                        {t('partner.stop')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </LoadState>
    </section>
  )
}

export function PartnerSystemsPage() {
  const { data, failed, reload } = usePartnerConsole()
  return (
    <section>
      <h2 className="console-h2">{t('admin.navPartnerSystems')}</h2>
      <p className="muted">{t('partner.systemsIntro')}</p>
      <LoadState data={data} failed={failed} onRetry={reload}>
        {() =>
          data!.systems.length === 0 ? (
            <p className="muted">{t('partner.noSystems')}</p>
          ) : (
            <div className="sys-grid">
              {data!.systems.map((s) => (
                <article key={s.id} className="card sys-card">
                  <header className="sys-head">
                    <SystemTile name={s.name} logoUrl={s.logoUrl} />
                    <div className="sys-title">
                      <h3 className="console-h3">{s.name}</h3>
                      <small className="muted">
                        <span>{t('systems.officialCount', { count: arDigits(s.officialGuides) })}</span> · <span>{t('partner.clientsCount', { count: arDigits(s.clients) })}</span>
                      </small>
                    </div>
                  </header>
                  <div className="sys-chips">
                    {s.domains.map((d) => <code key={d} className="chip" dir="ltr">{d}</code>)}
                  </div>
                </article>
              ))}
            </div>
          )
        }
      </LoadState>
    </section>
  )
}

/** ش٢ (§٩.٤): قرّاء كل دليل رسمي من كل الشركات، وعدد الشركات التي قرأته — أعداد بلا أسماء */
export function PartnerReportsPage() {
  const { data, failed, reload } = useLoad((s) => client.partnerReports(s), [])
  return (
    <section>
      <h2 className="console-h2">{t('admin.navReports')}</h2>
      <LoadState data={data} failed={failed} onRetry={reload}>
        {() => (
          <>
            <p className="muted">{t('partner.reportsIntro', { companies: companiesAr(data!.activeCompanies) })}</p>
            {data!.guides.length === 0 ? (
              <p className="muted">{t('partner.noReports')}</p>
            ) : (
              <table className="console-table">
                <thead>
                  <tr>
                    <th>{t('partner.colGuide')}</th>
                    <th>{t('partner.colSystem')}</th>
                    <th>{t('partner.colReaders')}</th>
                    <th>{t('partner.colCompanies')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.guides.map((g) => (
                    <tr key={g.id}>
                      <td><bdi>{g.title}</bdi></td>
                      <td><bdi>{g.systemName}</bdi></td>
                      <td>{arDigits(g.readers)}</td>
                      <td>{arDigits(g.companies)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </LoadState>
    </section>
  )
}

/** «شركة واحدة» و«شركتان» و«٥ شركات» و«١٢ شركة» — العدد العربي مع المعدود */
function companiesAr(n: number): string {
  if (n === 1) return t('partner.companiesOne')
  if (n === 2) return t('partner.companiesTwo')
  return t(n >= 3 && n <= 10 ? 'partner.companiesFew' : 'partner.companiesMany', { count: arDigits(n) })
}
