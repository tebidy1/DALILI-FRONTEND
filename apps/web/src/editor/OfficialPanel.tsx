import { useState } from 'react'
import type { OfficialDto } from '@dalili/shared'
import { startsAtRecord } from '@dalili/core'
import { client } from '../api'
import { t } from '../i18n'

/**
 * ش١ (الخطة §٩.٢ و§٢٦): لوحة «الدليل الرسمي» في محرر دليل الشريك — مفتاح «رسمي للعملاء» (الافتراض داخلي
 * لفريقه كدليل أي شركة)، ثم النظام من أنظمته، والجمهور «كل الشركات المفعّلة» أو «شركات محددة» من عملائه لهذا النظام. الحفظ فوري.
 */
/** ث٣ (§٥.٧): firstUrl = رابط أول خطوة — إن بدأ من سجل محدد يُنبَّه الشريك دون منع النشر */
export function OfficialPanel({ guideId, official, onChange, firstUrl }: { guideId: string; official: OfficialDto; onChange: (o: OfficialDto) => void; firstUrl?: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save(patch: Parameters<typeof client.updateOfficial>[1]) {
    setBusy(true)
    setError('')
    try {
      onChange((await client.updateOfficial(guideId, patch)).official)
    } catch (err) {
      setError((err as Error)?.message || t('common.unexpected'))
    } finally {
      setBusy(false)
    }
  }

  // «شركات محددة» يكشف الخانات فقط، والحفظ عند اختيار أول شركة — وإفراغها يعيد «الكل»
  const [wantListed, setWantListed] = useState(false)
  const listed = official.audience === 'listed' || wantListed
  const toggleCompany = (id: string) => {
    const next = official.companyIds.includes(id) ? official.companyIds.filter((c) => c !== id) : [...official.companyIds, id]
    if (next.length) return void save({ audience: 'listed', companyIds: next })
    setWantListed(false)
    void save({ audience: 'all' })
  }

  return (
    <section className="official-panel no-print" aria-labelledby="official-title">
      <h2 id="official-title" className="official-title">
        {t('official.title')}
      </h2>
      <button type="button" role="switch" aria-checked={official.official} className="official-switch" disabled={busy} onClick={() => void save({ official: !official.official })}>
        <span className="official-switch-track" aria-hidden="true" />
        {t('official.toggle')}
      </button>
      {!official.official ? (
        <p className="muted official-hint">{t('official.internalHint')}</p>
      ) : (
        <>
          {!official.systemId && <p className="official-warn">{t('official.needSystem')}</p>}
          {firstUrl && startsAtRecord(firstUrl) && <p className="official-warn">{t('official.recordWarn')}</p>}
          <div className="official-row">
            <label>
              <span>{t('official.system')}</span>
              <select value={official.systemId ?? ''} disabled={busy} onChange={(e) => e.target.value && void save({ systemId: e.target.value })}>
                <option value="" disabled>
                  {t('official.pickSystem')}
                </option>
                {official.systems.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            {official.systemId && (
              <fieldset className="official-audience" disabled={busy}>
                <legend>{t('official.audience')}</legend>
                <label>
                  <input
                    type="radio"
                    name="official-audience"
                    checked={!listed}
                    onChange={() => {
                      setWantListed(false)
                      if (official.audience !== 'all') void save({ audience: 'all' })
                    }}
                  />
                  {t('official.all')}
                </label>
                <label>
                  <input type="radio" name="official-audience" checked={listed} disabled={official.clients.length === 0} onChange={() => setWantListed(true)} />
                  {t('official.listed')}
                </label>
              </fieldset>
            )}
          </div>
          {official.systemId && official.clients.length === 0 && <small className="muted">{t('official.noClients')}</small>}
          {listed && (
            <div className="official-companies">
              {official.clients.map((c) => (
                <label key={c.id}>
                  <input type="checkbox" checked={official.companyIds.includes(c.id)} disabled={busy} onChange={() => toggleCompany(c.id)} />
                  <bdi>{c.name}</bdi>
                </label>
              ))}
            </div>
          )}
        </>
      )}
      {error && (
        <div className="err" role="alert">
          {error}
        </div>
      )}
    </section>
  )
}
