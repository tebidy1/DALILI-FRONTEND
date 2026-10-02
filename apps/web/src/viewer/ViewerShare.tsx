import { useCallback, useRef, useState } from 'react'
import { whatsappUrl } from '@dalili/core'
import { canNativeShare, nativeShare } from '../lib/native-share'
import { copyWithFallback } from '../lib/format'
import { useDismissOnOutside } from '../lib/dismiss'
import { Qr } from '../ui/Qr'
import { IconLink, IconPrinter, IconQr, IconShare, IconWhatsapp } from '../ui/icons'
import { t } from '../i18n'

type CopyState = 'idle' | 'ok' | 'fail'

/**
 * مشاركة العارض العام — «سارة» تفتح الرابط من واتساب وتحتاج إعادة نشره بلا حساب.
 * الرابط هو صفحة المشاركة الحالية نفسها (`/s/:token`).
 *
 * طلب المالك 2026-10-02: الخيارات كانت أزرارًا منفردة في الشريط فتلتفّ على الجوال
 * أربعة أسطر وتشوّش على القراءة — صارت زرًّا واحدًا يفتح قائمة: مشاركة الجهاز (حين
 * يدعمها المتصفح)، واتساب، نسخ الرابط، رمز QR (ينفتح داخل القائمة فلا يفيض عن
 * الشاشة)، ثم الطباعة.
 */
export function ViewerShare({ title }: { title: string }) {
  const [open, setOpen] = useState(false)
  const [copy, setCopy] = useState<CopyState>('idle')
  const [showQr, setShowQr] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const url = typeof location !== 'undefined' ? location.href : ''

  const close = useCallback(() => {
    setOpen(false)
    setShowQr(false)
    setCopy('idle')
  }, [])
  useDismissOnOutside(open, rootRef, close)

  async function copyLink() {
    setCopy((await copyWithFallback(url)) ? 'ok' : 'fail')
  }

  function print() {
    close()
    // بعد إغلاق القائمة — الطباعة تحجب الصفحة حتى يُغلق حوارها
    setTimeout(() => window.print(), 0)
  }

  return (
    <div className="viewer-share" ref={rootRef}>
      <button
        type="button"
        className="btn ghost viewer-share-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <IconShare size={16} />
        <span>{t('editor.shareOpen')}</span>
      </button>
      {open && (
        <div className="viewer-share-menu" role="menu" aria-label={t('editor.shareOpen')}>
          {canNativeShare() && (
            <button
              type="button"
              role="menuitem"
              className="viewer-share-item"
              onClick={() => {
                close()
                void nativeShare({ title, text: title, url })
              }}
            >
              <IconShare size={18} />
              <span>{t('viewer.shareNative')}</span>
            </button>
          )}
          <a
            role="menuitem"
            className="viewer-share-item"
            href={whatsappUrl(title, url)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={close}
          >
            <IconWhatsapp size={18} />
            <span>{t('editor.whatsapp')}</span>
          </a>
          <button
            type="button"
            role="menuitem"
            className={`viewer-share-item${copy === 'ok' ? ' is-done' : ''}${copy === 'fail' ? ' is-failed' : ''}`}
            onClick={() => void copyLink()}
          >
            <IconLink size={18} />
            <span aria-live="polite">
              {copy === 'ok' ? t('editor.copied') : copy === 'fail' ? t('viewer.copyFailed') : t('editor.copyLink')}
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="viewer-share-item"
            aria-expanded={showQr}
            onClick={() => setShowQr((v) => !v)}
          >
            <IconQr size={18} />
            <span>{t('editor.qr')}</span>
          </button>
          {showQr && (
            <div className="viewer-share-qr">
              <Qr text={url} size={168} ariaLabel={t('editor.qr')} />
              <p>{t('viewer.qrHint')}</p>
            </div>
          )}
          <div className="viewer-share-sep" role="separator" />
          <button type="button" role="menuitem" className="viewer-share-item" onClick={print}>
            <IconPrinter size={18} />
            <span>{t('common.print')}</span>
          </button>
        </div>
      )}
    </div>
  )
}
