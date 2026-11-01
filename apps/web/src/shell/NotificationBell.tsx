import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { NotificationDto, NotificationsDto } from '@dalili/shared'
import { client } from '../api'
import { t } from '../i18n'
import { arDigits, relativeTimeAr } from '../lib/format'

/**
 * ش٢ (الخطة §٣.٦ و§٢٧): الجرس في رأس الشريط الجانبي — إشعارات المساحة النشطة.
 * يُجلب عند التحميل وعند الفتح، وفشل الجلب يخفي العدد ولا يكسر شيئاً.
 */
export function NotificationBell() {
  const [bell, setBell] = useState<NotificationsDto | null>(null)
  const [open, setOpen] = useState(false)

  // شريط بلا خادم يعرف الجرس (اختبارات الشريط القديمة) يبقى بلا جرس صامتاً
  const load = () => (typeof client.notifications === 'function' ? client.notifications().then(setBell, () => {}) : Promise.resolve())
  useEffect(() => {
    void load()
  }, [])

  async function markAll() {
    await client.markNotificationsRead().catch(() => {})
    setBell((b) => b && { unread: 0, items: b.items.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) })
  }

  const unread = bell?.unread ?? 0
  return (
    <div className="bell-wrap">
      <button
        type="button"
        className="bell-btn"
        aria-expanded={open}
        aria-label={unread ? t('bell.labelUnread', { count: arDigits(unread) }) : t('bell.label')}
        onClick={() => {
          if (!open) void load()
          setOpen((v) => !v)
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && <span className="bell-count">{arDigits(unread)}</span>}
      </button>
      {open && (
        <>
          <div className="bell-backdrop" onClick={() => setOpen(false)} />
          <div className="bell-pop" role="dialog" aria-label={t('bell.label')}>
            <div className="bell-head">
              <strong>{t('bell.label')}</strong>
              {unread > 0 && (
                <button type="button" className="btn ghost sm" onClick={() => void markAll()}>
                  {t('bell.markAll')}
                </button>
              )}
            </div>
            {bell && bell.items.length === 0 ? (
              <p className="muted bell-empty">{t('bell.empty')}</p>
            ) : (
              <ul className="bell-list" aria-label={t('bell.label')}>
                {(bell?.items ?? []).map((n) => (
                  <li key={n.id} className={n.readAt ? '' : 'unread'}>
                    {n.kind === 'note.answered' ? (
                      // هـ ج١: إشعار الشرح بلا وجهة — يُقرأ هنا وحسب
                      <div>
                        <span>{messageOf(n)}</span>
                        <small className="muted">{relativeTimeAr(n.createdAt)}</small>
                      </div>
                    ) : (
                      <Link to={targetOf(n)} onClick={() => setOpen(false)}>
                        <span>{messageOf(n)}</span>
                        <small className="muted">{relativeTimeAr(n.createdAt)}</small>
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/** جملة الإشعار من نوعه وأسمائه */
function messageOf(n: NotificationDto): string {
  const d = { company: n.data.companyName ?? '', partner: n.data.partnerName ?? '', system: n.data.systemName ?? '' }
  if (n.kind === 'partner.chosen') return t('bell.chosen', d)
  if (n.kind === 'partner.stopped') return t('bell.stopped', d)
  if (n.kind === 'note.answered') return t('bell.noteAnswered', { label: n.data.label ?? '', system: d.system })
  return t('bell.removed', d)
}

/** الشريك يذهب إلى عملائه، والشركة إلى «أنظمتنا» لتختار مقدّماً آخر */
function targetOf(n: NotificationDto): string {
  return n.kind === 'partner.chosen' ? '/admin/clients' : '/admin/systems'
}
