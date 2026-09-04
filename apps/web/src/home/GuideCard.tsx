import { useState } from 'react'
import type { FolderDto, GuideSummaryDto } from '@dalili/shared'
import { webShareUrl } from '../api'
import { Button } from '../ui/Button'
import { IconShare } from '../ui/icons'
import { t } from '../i18n'
import { ownerNameFromEmail, arDigits, relativeTimeAr, dualDateAr } from '../lib/format'

/**
 * بطاقة مدمجة بطلب المالك 2026-09-03: بلا صورة، والعنوان سطر واحد يُكمله التحويم
 * (title)، والظاهر منها المشاركة والبوكمارك و«⋯» في الركن العلوي الأيسر مع عدد
 * الخطوات — وبقية المعلومات والإجراءات مرتّبة داخل قائمة «⋯». النجمة أُزيلت
 * (البوكمارك يكفي دلالة على الانضمام للمحفوظات).
 */

/** حرف النطاق في دائرة — بلا خدمات أيقونات خارجية (قرار التحليل ب11) */
function SiteBadge({ site }: { site: string }) {
  const letter = site.charAt(0).toUpperCase() || '?'
  return (
    <span className="site-badge" aria-hidden="true">
      {letter}
    </span>
  )
}

export interface GuideCardProps {
  g: GuideSummaryDto
  folders: FolderDto[]
  inTrash: boolean
  picked: boolean
  showPick: boolean
  confirming: boolean
  onPick: (shiftKey: boolean) => void
  onOpen: () => void
  onBookmark: () => void
  onDuplicate: () => void
  onPublish: () => void
  onShare: () => void
  onMove: (folderId: string | null) => void
  onRemove: () => void
  onRestore: () => void
  onSite: (site: string) => void
}

export function GuideCard(p: GuideCardProps) {
  const { g } = p
  const [menuOpen, setMenuOpen] = useState(false)
  const dateIso = p.inTrash && g.deletedAt ? g.deletedAt : g.updatedAt
  const folderName = p.folders.find((f) => f.id === g.folderId)?.name
  const author = ownerNameFromEmail(g.ownerEmail)
  return (
    <div className={`card guide-card${p.picked ? ' picked' : ''}`}>
      <div className="row guide-card-head">
        {p.showPick && (
          /* LIB-05: تحديد البطاقة — نقر عادي يبدّل، Shift+Click يمدد المدى */
          <button
            className={`pick${p.picked ? ' on' : ''}`}
            aria-pressed={p.picked}
            aria-label={t('library.selectGuide', { title: g.title })}
            title={t('library.selectGuide', { title: g.title })}
            onClick={(e) => p.onPick(e.shiftKey)}
          >
            ✓
          </button>
        )}
        {/* سطر عنوان واحد — البقية تظهر بتحويم المؤشر فوقه */}
        <div className="title" title={g.title}>
          <bdi>{g.title}</bdi>
        </div>
        {!p.inTrash && g.mine && (
          <button
            className="btn ghost icon-btn"
            aria-label={t('home.share')}
            title={t('home.share')}
            onClick={p.onShare}
          >
            <IconShare size={15} />
          </button>
        )}
        {!p.inTrash && (
          <button
            className={`bm-btn${g.bookmarked ? ' on' : ''}`}
            aria-pressed={g.bookmarked}
            aria-label={g.bookmarked ? t('home.unbookmark') : t('home.bookmark')}
            title={g.bookmarked ? t('home.unbookmark') : t('home.bookmark')}
            onClick={p.onBookmark}
          >
            {g.bookmarked ? '🔖' : '⚐'}
          </button>
        )}
        <button
          className={`more-btn${menuOpen ? ' on' : ''}`}
          aria-label={t('library.moreActions')}
          aria-expanded={menuOpen}
          title={t('library.moreActions')}
          onClick={() => setMenuOpen((v) => !v)}
        >
          ⋯
        </button>
      </div>

      <div className="row card-meta">
        <span className="chip">{t('common.steps', { count: g.stepCount })}</span>
      </div>

      {menuOpen && (
        <>
          <div className="guide-menu-backdrop" onClick={() => setMenuOpen(false)} />
          <div className="guide-menu" role="group" aria-label={t('library.cardMenuA11y')}>
            {/* — المعلومات مرتّبة — */}
            <div className="guide-menu-info">
              <div className="row">
                {g.site ? (
                  <button
                    className="site-who"
                    aria-label={t('home.siteChipA11y', { site: g.site })}
                    title={t('home.filterSite')}
                    onClick={() => p.onSite(g.site)}
                  >
                    <SiteBadge site={g.site} />
                    <span className="site-name">{g.site}</span>
                  </button>
                ) : (
                  <span className="site-who muted">
                    <SiteBadge site="?" />
                    <span className="site-name">{t('home.noSite')}</span>
                  </span>
                )}
                <span className={`chip status-chip${g.visibility === 'private' ? ' priv' : ''}`}>
                  {g.visibility === 'private' ? t('home.badgePrivate') : t('home.badgePublished')}
                </span>
                {folderName && (
                  <span className="chip">
                    <bdi>{folderName}</bdi>
                  </span>
                )}
              </div>
              <div className="row">
                {g.commentCount > 0 && (
                  <span
                    className={`chip comment-chip${g.openCommentCount > 0 ? ' has-open' : ''}`}
                    title={
                      g.openCommentCount > 0
                        ? t('library.commentOpenHint', { count: g.openCommentCount })
                        : t('library.commentCountA11y', { count: g.commentCount })
                    }
                  >
                    {t('library.commentCount', { count: g.commentCount })}
                  </span>
                )}
                {/* المرحلة ج: مشاهدات المشاركة داخل القائمة */}
                {g.views > 0 && (
                  <span className="chip views-chip" title={t('home.colViews')}>
                    {`👁 ${arDigits(g.views)}`}
                  </span>
                )}
                {g.tags.map((tag) => (
                  <span className="chip tag-chip" key={tag}>
                    #{tag}
                  </span>
                ))}
              </div>
              {/* «قبل ٣ أيام · الكاتب»، والتاريخ الكامل في التلميح */}
              <div className="muted card-byline" title={dualDateAr(dateIso)}>
                {relativeTimeAr(dateIso)}
                {author && (
                  <>
                    <span aria-hidden="true"> · </span>
                    <span>{author}</span>
                  </>
                )}
              </div>
              {g.shared && g.shareUrl && (
                <a className="chip shared" href={webShareUrl(g.shareUrl)} target="_blank" rel="noreferrer">
                  {t('common.sharedOpen')}
                </a>
              )}
            </div>
            {/* — الإجراءات — */}
            <div className="guide-menu-actions">
              {p.inTrash ? (
                <>
                  <Button size="sm" onClick={p.onRestore}>
                    {t('library.restore')}
                  </Button>
                  <Button size="sm" variant={p.confirming ? 'danger' : 'ghost'} onClick={p.onRemove}>
                    {t('library.deleteForever')}
                  </Button>
                </>
              ) : g.mine ? (
                <>
                  <Button size="sm" onClick={p.onOpen}>
                    {t('common.openEditor')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={p.onPublish}>
                    {g.visibility === 'private' ? t('home.publish') : t('home.unpublish')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={p.onDuplicate}>
                    {t('library.duplicate')}
                  </Button>
                  <select
                    className="lib-move"
                    aria-label={`${t('library.moveToFolder')} — ${g.title}`}
                    value={g.folderId ?? ''}
                    onChange={(e) => p.onMove(e.target.value || null)}
                  >
                    <option value="">{t('library.rootFolder')}</option>
                    {p.folders.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                  <Button size="sm" variant={p.confirming ? 'danger' : 'ghost'} onClick={p.onRemove}>
                    {p.confirming ? t('common.confirmDelete') : t('common.delete')}
                  </Button>
                </>
              ) : (
                <Button size="sm" onClick={p.onOpen}>
                  {t('common.openEditor')}
                </Button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
