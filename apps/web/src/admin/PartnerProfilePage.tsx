import { useState } from 'react'
import type { PartnerProfileDto } from '@dalili/shared'
import { client } from '../api'
import { t } from '../i18n'
import { Button } from '../ui/Button'
import { useLoad } from '../console/useLoad'
import { LoadState } from '../console/LoadState'
import { SystemTile } from '../console/SystemTile'

/**
 * ش١ (الخطة §٣.٣ و§٢٦): الملف العام للشريك — الشعار والوصف والموقع، ومعاينة «هكذا تراك الشركات»
 * كما تظهر بطاقته في «أنظمتنا». الأخطاء من الخادم بنصها ورمزها.
 */
export function PartnerProfilePage() {
  const { data, setData, failed, reload } = useLoad((s) => client.partnerProfile(s), [])
  return (
    <section>
      <h2 className="console-h2">{t('admin.navProfile')}</h2>
      <p className="muted">{t('partner.profileIntro')}</p>
      <LoadState data={data} failed={failed} onRetry={reload}>
        {() => <ProfileForm profile={data!} onChange={setData} />}
      </LoadState>
    </section>
  )
}

/** النموذج يُركَّب بعد وصول الملف فيبدأ بقيمه — لا مؤثّر يملؤه لاحقاً فيمحو ما كُتب قبله */
function ProfileForm({ profile: data, onChange }: { profile: PartnerProfileDto; onChange: (p: PartnerProfileDto) => void }) {
  const [description, setDescription] = useState(data.description)
  const [website, setWebsite] = useState(data.website)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  async function act(fn: () => Promise<PartnerProfileDto>, okNote: boolean) {
    setBusy(true)
    setError('')
    setSaved(false)
    try {
      onChange(await fn())
      setSaved(okNote)
    } catch (err) {
      setError((err as Error)?.message || t('common.unexpected'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="partner-profile">
      <form
        className="card form-stack"
        onSubmit={(e) => {
          e.preventDefault()
          void act(
            () =>
              client.updatePartnerProfile({
                description: description.trim(),
                website: website.trim(),
              }),
            true,
          )
        }}
      >
        <div className="partner-logo-row">
          <SystemTile name={data.name} logoUrl={data.logoUrl} size={64} />
          <label className="ghost-file">
            {t('partner.uploadLogo')}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) void act(() => client.uploadPartnerLogo(file), false)
              }}
            />
          </label>
          <small className="muted">{t('partner.logoHint')}</small>
        </div>
        <label>
          {t('partner.description')}
          <textarea rows={3} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('partner.descriptionPh')} />
        </label>
        <label>
          {t('partner.website')}
          <input dir="ltr" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="nuzum.sa" />
        </label>
        {error && (
          <div className="err" role="alert">
            {error}
          </div>
        )}
        {saved && (
          <div className="ok-note" role="status">
            {t('partner.saved')}
          </div>
        )}
        <Button type="submit" busy={busy}>
          {t('partner.save')}
        </Button>
      </form>

      <section className="card partner-preview" aria-labelledby="partner-preview-title">
        <h3 id="partner-preview-title" className="console-h3">
          {t('partner.previewTitle')}
        </h3>
        <div className="sys-option sel">
          <SystemTile name={data.name} logoUrl={data.logoUrl} size={28} />
          <span className="sys-option-name">
            <bdi>{data.name}</bdi>
          </span>
        </div>
        {data.description && <p>{data.description}</p>}
        {data.website && (
          <a href={data.website} target="_blank" rel="noreferrer" dir="ltr">
            {data.website}
          </a>
        )}
      </section>
    </div>
  )
}
