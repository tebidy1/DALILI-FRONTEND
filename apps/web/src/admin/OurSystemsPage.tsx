import { useState } from 'react'
import type { CompanySystemDto } from '@dalili/shared'
import { client } from '../api'
import { t } from '../i18n'
import { arDigits } from '../lib/format'
import { Button } from '../ui/Button'
import { useConfirm } from '../components/ConfirmProvider'
import { useLoad } from '../console/useLoad'
import { LoadState } from '../console/LoadState'
import { SystemTile } from '../console/SystemTile'

/**
 * ج١ (الخطة §١٢.٢ و§٩.٣): لوحة الشركة → أنظمتنا، كقائمة الموصلات. أعلى الصفحة أنظمة الشركة
 * ولكل نظام شريك واحد يفعّله الاختيار فوراً، وتحتها أنظمة يمكن إضافتها. الموظف لا يختار شيئاً:
 * يجد أدلة الشريك في الإضافة حسب النظام المفتوح.
 */
export function OurSystemsPage() {
  const { data, setData, failed, reload } = useLoad((s) => client.companySystems(s), [])
  const replace = (next: CompanySystemDto) => setData((list) => (list ?? []).map((x) => (x.id === next.id ? next : x)))
  const list = data ?? []
  const added = list.filter((s) => s.added)
  const rest = list.filter((s) => !s.added)

  return (
    <section>
      <h2 className="console-h2">{t('admin.navSystems')}</h2>
      <p className="muted">{t('systems.companyIntro')}</p>
      <LoadState data={data} failed={failed} onRetry={reload} empty={t('systems.catalogEmpty')}>
        {() => (
          <>
            <section aria-labelledby="sys-ours" className="sys-section">
              <h3 id="sys-ours" className="console-h3">{t('systems.ours')}</h3>
              {added.length === 0 ? (
                <p className="muted">{t('systems.noneAdded')}</p>
              ) : (
                <div className="sys-stack">
                  {added.map((s) => <AddedSystem key={s.id} system={s} onChange={replace} />)}
                </div>
              )}
            </section>
            {rest.length > 0 && (
              <section aria-labelledby="sys-available" className="sys-section">
                <h3 id="sys-available" className="console-h3">{t('systems.available')}</h3>
                <div className="sys-grid">
                  {rest.map((s) => <AvailableSystem key={s.id} system={s} onChange={replace} />)}
                </div>
              </section>
            )}
          </>
        )}
      </LoadState>
    </section>
  )
}

/** فعل واحد بانشغال وخطأ ونتيجة تحلّ محل بطاقة النظام */
function useSystemAction(onChange: (s: CompanySystemDto) => void) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function run(fn: () => Promise<CompanySystemDto>): Promise<CompanySystemDto | undefined> {
    setBusy(true)
    setError('')
    try {
      const next = await fn()
      onChange(next)
      return next
    } catch (err) {
      setError((err as Error)?.message || t('common.unexpected'))
      return undefined
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run }
}

function SystemHead({ system: s }: { system: CompanySystemDto }) {
  return (
    <header className="sys-head">
      <SystemTile name={s.name} logoUrl={s.logoUrl} />
      <div className="sys-title">
        <h4 className="console-h3">{s.name}</h4>
        <small className="muted" dir="ltr">{s.domains.join('  ·  ')}</small>
      </div>
    </header>
  )
}

function AvailableSystem({ system: s, onChange }: { system: CompanySystemDto; onChange: (s: CompanySystemDto) => void }) {
  const { busy, error, run } = useSystemAction(onChange)
  return (
    <article className="card sys-card sys-card-small">
      <SystemHead system={s} />
      {error && <div className="err" role="alert">{error}</div>}
      <Button size="sm" busy={busy} onClick={() => run(() => client.companyAddSystem(s.id))}>{t('systems.add')}</Button>
    </article>
  )
}

function AddedSystem({ system: s, onChange }: { system: CompanySystemDto; onChange: (s: CompanySystemDto) => void }) {
  const confirm = useConfirm()
  const { busy, error, run } = useSystemAction(onChange)
  const [notice, setNotice] = useState('')
  const [domain, setDomain] = useState('')
  const groupId = `sys-provider-${s.id}`

  async function choose(partnerId: string | null) {
    setNotice('')
    const next = await run(() => client.companyChoosePartner(s.id, partnerId))
    if (!next) return
    const name = next.providers.find((p) => p.id === next.partnerId)?.name
    setNotice(name ? t('systems.chosen', { name }) : t('systems.unchosen'))
  }

  async function remove() {
    const ok = await confirm({ title: t('systems.removeTitle', { name: s.name }), body: t('systems.removeBody'), confirmLabel: t('systems.remove'), danger: true })
    if (ok) await run(() => client.companyRemoveSystem(s.id))
  }

  return (
    <article className="card sys-card">
      <SystemHead system={s} />

      <div className="sys-block">
        <span id={groupId} className="sys-label">{t('systems.provider')}</span>
        {s.providers.length === 0 ? (
          <p className="muted">{t('systems.noProvidersYet')}</p>
        ) : (
          <div role="radiogroup" aria-labelledby={groupId} className="sys-options">
            {[{ id: null, name: t('systems.noPartner'), officialGuides: -1, logoUrl: null }, ...s.providers].map((p) => (
              <label key={p.id ?? 'none'} className={`sys-option${s.partnerId === p.id ? ' sel' : ''}`}>
                <input type="radio" name={groupId} checked={s.partnerId === p.id} disabled={busy} onChange={() => choose(p.id)} />
                {p.id && <SystemTile name={p.name} logoUrl={p.logoUrl} size={28} />}
                <span className="sys-option-name"><bdi>{p.name}</bdi></span>
                {p.officialGuides >= 0 && <small className="muted">{t('systems.officialCount', { count: arDigits(p.officialGuides) })}</small>}
              </label>
            ))}
          </div>
        )}
        {notice && <div className="ok-note" role="status">{notice}</div>}
      </div>

      <div className="sys-block">
        <label className="sys-label" htmlFor={`sys-domain-${s.id}`}>{t('systems.ownDomains')}</label>
        <div className="sys-chips">
          {s.ownDomains.map((d) => (
            <span key={d} className="chip sys-provider" dir="ltr">
              {d}
              <button type="button" className="chip-x" aria-label={t('systems.removeDomain', { domain: d })} onClick={() => run(() => client.companyRemoveDomain(s.id, d))}>×</button>
            </span>
          ))}
        </div>
        <form
          className="row sys-inline"
          onSubmit={async (e) => {
            e.preventDefault()
            if (domain.trim() && (await run(() => client.companyAddDomain(s.id, domain.trim())))) setDomain('')
          }}
        >
          <input id={`sys-domain-${s.id}`} dir="ltr" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="erp.company.sa" />
          <Button size="sm" variant="ghost" type="submit" busy={busy} disabled={!domain.trim()}>{t('systems.addDomain')}</Button>
        </form>
        <small className="muted">{t('systems.ownDomainsHint')}</small>
      </div>

      {error && <div className="err" role="alert">{error}</div>}
      <div className="sys-foot">
        <Button size="sm" variant="ghost" onClick={remove}>{t('systems.remove')}</Button>
      </div>
    </article>
  )
}
