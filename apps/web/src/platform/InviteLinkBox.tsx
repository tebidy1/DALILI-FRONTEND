import { useState } from 'react'
import { t, type TKey } from '../i18n'
import { copyToClipboard } from '../lib/format'
import { Button } from '../ui/Button'

/** صندوق رابط الدعوة — يعرض الرابط دائماً مع زرّي النسخ وواتساب سواء أُرسل البريد أم لا (حادثة 2026-11-01: البريد الحقيقي غير مضبوط) */
export function InviteLinkBox({ email, url, emailed, sentKey = 'platform.inviteEmailed', copyKey = 'platform.inviteCopy' }: {
  email: string
  url: string
  emailed: boolean
  sentKey?: TKey
  copyKey?: TKey
}) {
  const [notice, setNotice] = useState('')

  async function copy() {
    if (await copyToClipboard(url)) setNotice(t('team.linkCopied'))
    else setNotice(t('home.shareManual', { url }))
  }

  const waHref = `https://wa.me/?text=${encodeURIComponent(t('team.waText', { url }))}`

  return (
    <div className="invite-box">
      <div className="muted" role="status">{emailed ? t(sentKey, { email }) : t(copyKey)}</div>
      <div className="row invite-link-row">
        <code className="invite-url" dir="ltr">{url}</code>
        <Button size="sm" onClick={() => void copy()}>{t('team.copyLink')}</Button>
        <a className="btn ghost sm" href={waHref} target="_blank" rel="noreferrer">{t('team.waSend')}</a>
      </div>
      {notice && <div className="muted" role="status">{notice}</div>}
    </div>
  )
}
