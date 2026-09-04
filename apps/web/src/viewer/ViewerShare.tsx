import { useState } from 'react'
import { whatsappUrl } from '@dalili/core'
import { canNativeShare, nativeShare } from '../lib/native-share'
import { Qr } from '../ui/Qr'
import { IconLink, IconWhatsapp, IconShare } from '../ui/icons'
import { t } from '../i18n'

/**
 * شريط مشاركة العارض العام — «سارة» تفتح الرابط من واتساب وتحتاج إعادة نشره بلا حساب.
 * الرابط هو صفحة المشاركة الحالية نفسها (`/s/:token`). مشاركة أصلية على الجوال،
 * وواتساب/نسخ/QR بديلًا على سطح المكتب.
 */
export function ViewerShare({ title }: { title: string }) {
  const [copied, setCopied] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const url = typeof location !== 'undefined' ? location.href : ''

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = url
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="viewer-share">
      {canNativeShare() && (
        <button
          className="btn ghost"
          onClick={() => void nativeShare({ title, text: title, url })}
        >
          <IconShare size={16} /> {t('editor.shareNative')}
        </button>
      )}
      <a className="btn ghost" href={whatsappUrl(title, url)} target="_blank" rel="noreferrer">
        <IconWhatsapp size={16} /> {t('editor.whatsapp')}
      </a>
      <button className="btn ghost" onClick={() => void copy()}>
        <IconLink size={16} /> {copied ? t('editor.copied') : t('editor.copyLink')}
      </button>
      <button className="btn ghost" onClick={() => setShowQr((v) => !v)} aria-expanded={showQr}>
        {t('editor.qr')}
      </button>
      {showQr && (
        <div className="qr-holder viewer-qr">
          <Qr text={url} ariaLabel={t('editor.qr')} />
        </div>
      )}
    </div>
  )
}
