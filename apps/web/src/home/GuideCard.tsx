import { useState } from 'react'
import type { FolderDto, GuideSummaryDto } from '@dalili/shared'
import { siteLabel } from '@dalili/core'
import { webShareUrl } from '../api'
import { IconShare } from '../ui/icons'
import { t } from '../i18n'
import { ownerNameFromEmail, arDigits, relativeTimeAr, dualDateAr } from '../lib/format'
import { GuideMenuActions } from './GuideMenuActions'

/**
 * LIB-05: الشريط الجانبي لبطاقة الدليل — مربّع التحديد خارج البطاقة، محاذٍ لرأسها.
 * يعكس StepRail في المحرر لضمان تجربة موحدة. أول عنصر في الصف = يمين RTL.
 */
function GuideRail({
  picked,
  onPick,
  title,
}: {
  picked: boolean
  onPick: (shiftKey: boolean) => void
  title: string
}) {
  return (
    <div className="guide-rail no-print">
      <button
        className={`pick${picked ? ' on' : ''}`}
        aria-pressed={picked}
        aria-label={t('library.selectGuide', { title })}
        title={t('library.selectGuide', { title })}
        onClick={(e) => onPick(e.shiftKey)}
      >
        ✓
      </button>
    </div>
  )
}

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
    <div className="guide-card-row">
      {/* LIB-05: مربّع التحديد خارج البطاقة على اليمين (أول عنصر في RTL) — مثل StepRail */}
      {p.showPick && (
        <GuideRail
          picked={p.picked}
          onPick={(shift) => p.onPick(shift)}
          title={g.title}
        />
      )}
      <div className={`card guide-card${p.picked ? ' picked' : ''}`}>
      <div className="row guide-card-head">
        {/* المرحلة ٣: العنوان يفتح الدليل بنقرة واحدة — لا «⋯» ثم «فتح المحرر» */}
        <button type="button" className="title" title={g.title} onClick={p.onOpen}>
          <bdi>{g.title}</bdi>
        </button>
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
        {/* الكرّاسة كتلٌ لا خطوات، وأرقامها هندية شرقية كبقية الواجهة */}
        <span className="chip">
          {t(g.kind === 'booklet' ? 'common.blocks' : 'common.steps', { count: arDigits(g.stepCount) })}
        </span>
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
                    <span className="site-name">{siteLabel(g.site)}</span>
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
                {/* BKL-01: الكرّاسة تعيش مع الأدلة في نفس القوائم — الشارة وحدها تميّزها */}
                {g.kind === 'booklet' && <span className="chip kind-chip">{t('library.kindBooklet')}</span>}
                {folderName && (
                  <span className="chip">
                    <bdi>{folderName}</bdi>
                  </span>
                )}
              </div>
              <div className="row">
                {g.commentCount > 0 && (
                  <span
                    className={`chip comment-chip${g.openCommentCount > 0 ? ' has-open' : ''}${g.openIssueCount > 0 ? ' has-issues' : ''}`}
                    title={
                      g.openIssueCount > 0
                        ? t('library.issueOpenHint', { count: g.openIssueCount })
                        : g.openCommentCount > 0
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
            {/* — الإجراءات: مصدر واحد مشترك مع قائمة الجدول (المرحلة ٣) — */}
            <GuideMenuActions
              g={g}
              folders={p.folders}
              inTrash={p.inTrash}
              onOpen={p.onOpen}
              onBookmark={p.onBookmark}
              onDuplicate={p.onDuplicate}
              onPublish={p.onPublish}
              onShare={p.onShare}
              onMove={p.onMove}
              onRemove={p.onRemove}
              onRestore={p.onRestore}
            />
          </div>
        </>
      )}
      </div>
    </div>
  )
}
