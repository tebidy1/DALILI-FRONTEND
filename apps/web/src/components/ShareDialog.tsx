import { useEffect, useRef, useState, type ReactNode } from 'react'
import { whatsappUrl } from '@dalili/core'
import type { ShareInfoDto } from '@dalili/shared'
import { webShareUrl } from '../api'
import { canNativeShare, nativeShare } from '../lib/native-share'
import { copyWithFallback } from '../lib/format'
import { Button } from '../ui/Button'
import { Qr } from '../ui/Qr'
import { IconLink, IconCode, IconDownload, IconEye, IconWhatsapp, IconShare } from '../ui/icons'
import { t } from '../i18n'

type Tab = 'link' | 'embed' | 'export'

interface Props {
  title: string
  share: ShareInfoDto | null
  onClose: () => void
  /** ينشئ الرابط عند ضغط الزر الصريح فقط (قرار المالك 2026-09-10: لا توليد بفتح النافذة) */
  onEnsureShare: () => Promise<void>
  onToggleShare: () => void | Promise<void>
  /**
   * النشر للمساحة (قرار المالك 2026-09-11): خيار الدليل الخاص الثاني بجانب الرابط
   * السري — يعيد false عند الفشل كي لا يُولَّد رابط على وعد فاشل.
   */
  onPublish: () => Promise<boolean>
  /** حالة النشر من بيانات الدليل — غيابها (خادم قديم) يعني بلا بوابة */
  published: boolean
  onExportMarkdown: () => void
  onCopyRich: () => void
  copiedHtml: boolean
  onPrint: () => void
  /**
   * BKL-01: عناوين الأدلة المضمّنة في الكرّاسة. وجودها يوقف توليد الرابط
   * تلقائيًا ويعرض قائمة فحص أولًا — لا تسريب صامت ولا حجب مفاجئ.
   */
  embedTitles?: string[]
}

/** كود التضمين من رمز المشاركة — مسار /embed/s/:token القائم */
function embedCode(shareUrl: string, title: string): string {
  const token = shareUrl.split('/s/')[1] ?? ''
  const src = `${window.location.origin}/embed/s/${token}`
  return `<iframe src="${src}" title="${title}" width="100%" height="640" style="border:1px solid #e3ddd2;border-radius:12px" loading="lazy"></iframe>`
}

/**
 * نافذة المشاركة الموحّدة — بدل الأزرار المبعثرة في الترويسة.
 * ثلاثة تبويبات: رابط · تضمين · تصدير. تُغلق بـEsc أو بالنقر خارجها.
 */
export function ShareDialog({
  title,
  share,
  onClose,
  onEnsureShare,
  onToggleShare,
  onPublish,
  published,
  onExportMarkdown,
  onCopyRich,
  copiedHtml,
  onPrint,
  embedTitles,
}: Props) {
  const [tab, setTab] = useState<Tab>('link')
  const [copied, setCopied] = useState(false)
  const [copiedEmbed, setCopiedEmbed] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const [creating, setCreating] = useState(false)
  const [publishing, setPublishing] = useState(false)
  // القائمة تظهر مرة واحدة قبل أول توليد؛ الموافقة ترفعها للأبد في هذه الجلسة
  const [checkPassed, setCheckPassed] = useState(false)
  const needsCheck = !!embedTitles?.length && !share && !checkPassed
  const closeRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  // قرار المالك 2026-09-10: بلا توليد تلقائي عند الفتح — الرابط ضغطة صريحة.
  /** نشر ثم توليد — الزر الواحد للدليل الخاص: قرار واعٍ واحد بدل خطتين متفرقتين */
  async function publishAndCreate() {
    setPublishing(true)
    try {
      if (await onPublish()) {
        setCreating(true)
        await onEnsureShare()
        setCreating(false)
      }
    } finally {
      setPublishing(false)
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  /** نسخ نصّي مع بديل صامت للمتصفحات بلا clipboard API */
  async function copy(text: string, mark: (v: boolean) => void) {
    await copyWithFallback(text)
    mark(true)
    setTimeout(() => mark(false), 2000)
  }

  const url = share ? webShareUrl(share.shareUrl) : ''

  // BKL-01: قائمة الفحص تسبق كل شيء — لا رابط يُولَّد قبل قرار واعٍ من المؤلف
  if (needsCheck) {
    return (
      <div className="palette-backdrop" onClick={onClose}>
        <div
          className="palette share-dialog"
          role="dialog"
          aria-modal="true"
          aria-label={t('booklet.shareCheckTitle')}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="dialog-head">
            <h2>{t('booklet.shareCheckTitle')}</h2>
          </div>
          <p className="share-check-body">{t('booklet.shareCheckBody')}</p>
          <ul className="share-check-list">
            {embedTitles?.map((titleText, i) => (
              <li key={`${titleText}-${i}`} dir="rtl">
                <bdi>{titleText}</bdi>
              </li>
            ))}
          </ul>
          <div className="dialog-actions">
            <button type="button" className="btn primary" onClick={() => setCheckPassed(true)}>
              {t('booklet.shareCheckGo')}
            </button>
            <button type="button" className="btn" ref={closeRef} onClick={onClose}>
              {t('booklet.shareCheckCancel')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div
        className="palette share-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t('editor.shareDialogTitle')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-head">
          <h2>{t('editor.shareDialogTitle')}</h2>
          <div className="seg" role="tablist" aria-label={t('editor.shareDialogTitle')}>
            {(
              [
                ['link', t('editor.shareTabLink'), <IconLink size={15} key="l" />],
                ['embed', t('editor.shareTabEmbed'), <IconCode size={15} key="e" />],
                ['export', t('editor.shareTabExport'), <IconDownload size={15} key="x" />],
              ] as Array<[Tab, string, ReactNode]>
            ).map(([id, label, icon]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                className={`seg-btn${tab === id ? ' on' : ''}`}
                onClick={() => setTab(id)}
              >
                {icon} {label}
              </button>
            ))}
          </div>
        </div>

        <div className="dialog-body">
          {tab === 'link' && (
            <>
              {share ? (
                <>
                  <p className="muted dialog-hint">{t('editor.shareLinkHint')}</p>
                  <div className="link-row">
                    <input type="text" dir="ltr" readOnly value={url} aria-label={t('editor.copyLink')} />
                    <Button variant="solid" icon={<IconLink size={16} />} onClick={() => void copy(url, setCopied)}>
                      {copied ? t('editor.copied') : t('editor.copyLink')}
                    </Button>
                  </div>
                  <div className="row dialog-actions">
                    <span className="chip views-chip">
                      <IconEye size={14} /> {t('editor.views', { count: share.views })}
                    </span>
                    {canNativeShare() && (
                      <Button
                        variant="ghost"
                        icon={<IconShare size={16} />}
                        onClick={() => void nativeShare({ title, text: title, url })}
                      >
                        {t('editor.shareNative')}
                      </Button>
                    )}
                    <a className="btn ghost" href={whatsappUrl(title, url)} target="_blank" rel="noreferrer">
                      <IconWhatsapp size={16} /> {t('editor.whatsapp')}
                    </a>
                    <Button variant="ghost" onClick={() => setShowQr((v) => !v)} aria-expanded={showQr}>
                      {t('editor.qr')}
                    </Button>
                    <Button variant="danger" onClick={() => void onToggleShare()}>
                      {t('editor.revokeShare')}
                    </Button>
                  </div>
                  {showQr && (
                    <div className="qr-holder">
                      <Qr text={url} ariaLabel={t('editor.qr')} />
                    </div>
                  )}
                </>
              ) : creating || publishing ? (
                <p className="muted dialog-hint" role="status">
                  {publishing ? t('editor.publishingShare') : t('editor.shareCreating')}
                </p>
              ) : !published ? (
                <>
                  {/* قرار المالك 2026-09-11: الدليل الخاص له بابان — رابط سري دون نشر، أو نشر كامل */}
                  <div className="share-option">
                    <p className="muted dialog-hint">{t('editor.shareSecretHint')}</p>
                    <Button variant="solid" onClick={() => void onEnsureShare()}>
                      {t('editor.shareSecretCreate')}
                    </Button>
                  </div>
                  <div className="share-or" aria-hidden="true">
                    {t('editor.shareOptionsOr')}
                  </div>
                  <div className="share-option">
                    <p className="muted dialog-hint">{t('editor.shareNeedsPublish')}</p>
                    <Button variant="ghost" onClick={() => void publishAndCreate()}>
                      {t('editor.publishAndShare')}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="muted dialog-hint">{t('editor.shareLinkHint')}</p>
                  <Button variant="solid" onClick={() => void onToggleShare()}>
                    {t('editor.shareEnable')}
                  </Button>
                </>
              )}
            </>
          )}

          {tab === 'embed' && (
            <>
              {share ? (
                <>
                  <p className="muted dialog-hint">{t('editor.embedHint')}</p>
                  <textarea className="embed-code" dir="ltr" readOnly rows={4} value={embedCode(share.shareUrl, title)} />
                  <Button variant="solid" onClick={() => void copy(embedCode(share.shareUrl, title), setCopiedEmbed)}>
                    {copiedEmbed ? t('editor.embedCopied') : t('editor.embedCopy')}
                  </Button>
                </>
              ) : (
                <p className="muted dialog-hint">{t('editor.embedNeedsShare')}</p>
              )}
            </>
          )}

          {tab === 'export' && (
            <>
              <p className="muted dialog-hint">{t('editor.exportHint')}</p>
              <div className="export-grid">
                <Button variant="ghost" onClick={onExportMarkdown}>
                  {t('common.exportMarkdown')}
                </Button>
                <Button variant="ghost" onClick={onCopyRich}>
                  {copiedHtml ? t('editor.copiedHtml') : t('editor.copyHtml')}
                </Button>
                <Button variant="ghost" onClick={onPrint}>
                  {t('common.print')}
                </Button>
              </div>
            </>
          )}
        </div>

        <div className="palette-foot">
          <button ref={closeRef} className="btn sm ghost" onClick={onClose}>
            {t('editor.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
