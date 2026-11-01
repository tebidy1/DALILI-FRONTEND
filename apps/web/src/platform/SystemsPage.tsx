import { useState } from 'react'
import type { PlatformAccountDto, PlatformSystemDto } from '@dalili/shared'
import { client } from '../api'
import { t } from '../i18n'
import { arDigits } from '../lib/format'
import { Button } from '../ui/Button'
import { useLoad } from '../console/useLoad'
import { LoadState } from '../console/LoadState'
import { SystemTile, splitDomains } from '../console/SystemTile'

/**
 * ج١ (الخطة §١٢.١): لوحة المنصة → الأنظمة. النظام يُعرَّف بنطاقاته (المعرّف الثابت)،
 * ونربط به الشركاء الذين يقدّمون أدلته. الأخطاء من الخادم كما هي (عربية برمزها).
 */
export function SystemsPage() {
  const systems = useLoad((s) => client.platformSystems(s), [])
  const partners = useLoad((s) => client.platformAccounts({ kind: 'partner', status: 'active' }, s), [])
  const replace = (next: PlatformSystemDto) => systems.setData((list) => (list ?? []).map((x) => (x.id === next.id ? next : x)))

  return (
    <section>
      <h2 className="console-h2">{t('platform.navSystems')}</h2>
      <p className="muted">{t('systems.platformIntro')}</p>
      <CreateSystem onCreated={systems.reload} />
      <LoadState data={systems.data} failed={systems.failed} onRetry={systems.reload} empty={t('systems.empty')}>
        {(list) => (
          <div className="sys-grid">
            {(list as PlatformSystemDto[]).map((s) => (
              <SystemCard key={s.id} system={s} partners={partners.data ?? []} onChange={replace} />
            ))}
          </div>
        )}
      </LoadState>
    </section>
  )
}

/** فعل واحد بحالة انشغال وخطأ — كل أزرار البطاقة تمر من هنا */
function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(true)
    setError('')
    try {
      return await fn()
    } catch (err) {
      setError((err as Error)?.message || t('common.unexpected'))
      return undefined
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run }
}

function CreateSystem({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('')
  const [domains, setDomains] = useState('')
  const { busy, error, run } = useAction()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const created = await run(() => client.platformCreateSystem({ name: name.trim(), domains: splitDomains(domains) }))
    if (!created) return
    setName('')
    setDomains('')
    onCreated()
  }

  return (
    <form className="card form-stack console-create" onSubmit={submit}>
      <div className="row">
        <label>
          {t('systems.name')}
          <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('systems.namePh')} />
        </label>
        <label>
          {t('systems.domains')}
          <input dir="ltr" required value={domains} onChange={(e) => setDomains(e.target.value)} placeholder="odoo.com, *.odoo.com" />
        </label>
      </div>
      <small className="muted">{t('systems.domainsHint')}</small>
      {error && <div className="err" role="alert">{error}</div>}
      <Button type="submit" busy={busy}>{t('systems.create')}</Button>
    </form>
  )
}

function SystemCard({ system: s, partners, onChange }: { system: PlatformSystemDto; partners: PlatformAccountDto[]; onChange: (s: PlatformSystemDto) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [pick, setPick] = useState('')
  const { busy, error, run } = useAction()
  const apply = async (fn: () => Promise<PlatformSystemDto>) => {
    const next = await run(fn)
    if (next) onChange(next)
    return next
  }
  const choosable = partners.filter((p) => !s.providers.some((x) => x.id === p.id))

  return (
    <article className="card sys-card">
      <header className="sys-head">
        <SystemTile name={s.name} logoUrl={s.logoUrl} />
        <div className="sys-title">
          <h3 className="console-h3">{s.name}</h3>
          <small className="muted">{t('systems.usedBy', { count: arDigits(s.companies) })}</small>
        </div>
        {/* ش١: شعار النظام — الخادم يرفض SVG وما فوق ٢٠٠ ك.ب برسالة ورمز */}
        <label className="ghost-file">
          {t('systems.uploadLogo')}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void apply(() => client.platformUploadSystemLogo(s.id, file))
            }}
          />
        </label>
        {s.hidden && <span className="chip">{t('systems.hidden')}</span>}
      </header>

      <div className="sys-row">
        <span className="sys-label">{t('systems.domains')}</span>
        {editing ? (
          <form
            className="row sys-inline"
            onSubmit={async (e) => {
              e.preventDefault()
              if (await apply(() => client.platformUpdateSystem(s.id, { domains: splitDomains(draft) }))) setEditing(false)
            }}
          >
            <input dir="ltr" aria-label={t('systems.domains')} value={draft} onChange={(e) => setDraft(e.target.value)} />
            <Button size="sm" type="submit" busy={busy}>{t('common.save')}</Button>
            <Button size="sm" variant="ghost" type="button" onClick={() => setEditing(false)}>{t('common.cancel')}</Button>
          </form>
        ) : (
          <div className="sys-chips">
            {s.domains.map((d) => <code key={d} className="chip" dir="ltr">{d}</code>)}
            <Button size="sm" variant="ghost" onClick={() => { setDraft(s.domains.join(', ')); setEditing(true) }}>{t('systems.editDomains')}</Button>
          </div>
        )}
      </div>

      <div className="sys-row">
        <span className="sys-label">{t('systems.providers')}</span>
        <div className="sys-chips">
          {s.providers.length === 0 && <span className="muted">{t('systems.noProviders')}</span>}
          {s.providers.map((p) => (
            <span key={p.id} className="chip sys-provider">
              <bdi>{p.name}</bdi>
              <button type="button" className="chip-x" aria-label={t('systems.removeProvider', { name: p.name })} onClick={() => apply(() => client.platformRemoveProvider(s.id, p.id))}>×</button>
            </span>
          ))}
        </div>
      </div>
      {choosable.length > 0 && (
        <div className="row sys-inline">
          <select aria-label={t('systems.addProvider')} value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">{t('systems.pickPartner')}</option>
            {choosable.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <Button size="sm" variant="ghost" disabled={!pick} busy={busy} onClick={async () => { if (await apply(() => client.platformAddProvider(s.id, pick))) setPick('') }}>
            {t('systems.add')}
          </Button>
        </div>
      )}

      {error && <div className="err" role="alert">{error}</div>}
      <div className="sys-foot">
        <Button size="sm" variant="ghost" onClick={() => apply(() => client.platformUpdateSystem(s.id, { hidden: !s.hidden }))}>
          {t(s.hidden ? 'systems.show' : 'systems.hide')}
        </Button>
      </div>
    </article>
  )
}
