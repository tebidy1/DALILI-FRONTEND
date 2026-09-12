import { useState } from 'react'
import type { FolderDto, GuideSummaryDto } from '@dalili/shared'
import { t } from '../i18n'
import { arDigits, relativeTimeAr } from '../lib/format'
import { Button } from '../ui/Button'
import { isPicked, type Selection } from '../lib/selection'
import { GuideMenuActions } from './GuideMenuActions'

/**
 * عرض «قائمة» على نمط المرجع: جدول حقيقي بأعمدة (العنوان · المجلد · الموقع ·
 * أُنشئ · عُدِّل · مشاهدات)، ورؤوس الترتيب قابلة للنقر (سهم على العمود النشط).
 * التحديد الجماعي من عمود ✓ (أدلتي فقط)، والسلة تحمل إجراءاتها في عمود أخير.
 */

export interface GuideTableProps {
  list: GuideSummaryDto[]
  folders: FolderDto[]
  trash: boolean
  sort: string
  sel: Selection
  onSort: (col: 'title' | 'created' | 'updated', dir: 'asc' | 'desc') => void
  onPick: (id: string, shiftKey: boolean) => void
  onOpen: (g: GuideSummaryDto) => void
  onRestore: (g: GuideSummaryDto) => void
  onRemove: (g: GuideSummaryDto) => void
  /** المرحلة ٣: تكافؤ الإجراءات — القائمة تحصل على ما تحصل عليه البطاقة */
  onShare: (g: GuideSummaryDto) => void
  onBookmark: (g: GuideSummaryDto) => void
  onPublish: (g: GuideSummaryDto) => void
  onDuplicate: (g: GuideSummaryDto) => void
  onMove: (g: GuideSummaryDto, folderId: string | null) => void
}

function SortHead({ label, col, sort, onSort }: { label: string; col: 'title' | 'created' | 'updated'; sort: string; onSort: GuideTableProps['onSort'] }) {
  const [field, dir] = sort.split('-')
  const active = field === col
  const nextDir = active && dir === 'desc' ? 'asc' : 'desc'
  return (
    <button className={`th-sort${active ? ' on' : ''}`} onClick={() => onSort(col, nextDir)} aria-label={`${label} — ${t('library.sort')}`}>
      {label}
      {active && <span aria-hidden="true">{dir === 'asc' ? '▲' : '▼'}</span>}
    </button>
  )
}

export function GuideTable(p: GuideTableProps) {
  // المرحلة ٣: قائمة «⋯» لكل صف — نفس إجراءات بطاقة الشبكة لا نسخة ناقصة
  const [menuFor, setMenuFor] = useState<string | null>(null)
  // كل اختيار من القائمة يُغلقها أولًا ثم ينفّذ فعله — مصدر واحد لسلوك الإغلاق
  const act = (run: () => void) => {
    setMenuFor(null)
    run()
  }
  return (
    <div className="table-wrap">
      <table className="guide-table">
        <thead>
          <tr>
            <th className="col-pick" aria-label={t('library.bulkBar')} />
            <th>
              <SortHead label={t('home.colTitle')} col="title" sort={p.sort} onSort={p.onSort} />
            </th>
            <th>{t('home.colFolder')}</th>
            <th>{t('home.colSite')}</th>
            <th>
              <SortHead label={t('home.colCreated')} col="created" sort={p.sort} onSort={p.onSort} />
            </th>
            <th>
              <SortHead label={t('home.colEdited')} col="updated" sort={p.sort} onSort={p.onSort} />
            </th>
            <th className="col-views">{t('home.colViews')}</th>
            {/* عمود إجراءات واحد يتبدّل محتواه: «⋯» خارج السلة، واستعادة/حذف داخلها —
                فلا يختلّ عدد الأعمدة بين الرأس والصفوف */}
            <th className="col-actions" aria-label={p.trash ? t('common.delete') : t('library.moreActions')} />
          </tr>
        </thead>
        <tbody>
          {p.list.map((g) => {
            const folderName = p.folders.find((f) => f.id === g.folderId)?.name ?? ''
            return (
              <tr key={g.id} className={isPicked(p.sel, g.id) ? 'picked' : undefined}>
                <td className="col-pick">
                  {g.mine && (
                    <button
                      className={`pick${isPicked(p.sel, g.id) ? ' on' : ''}`}
                      aria-pressed={isPicked(p.sel, g.id)}
                      aria-label={t('library.selectGuide', { title: g.title })}
                      title={t('library.selectGuide', { title: g.title })}
                      onClick={(e) => p.onPick(g.id, e.shiftKey)}
                    >
                      ✓
                    </button>
                  )}
                </td>
                <td className="col-title">
                  <button className="row-title" onClick={() => p.onOpen(g)}>
                    <bdi>{g.title}</bdi>
                  </button>
                </td>
                <td className="muted">{folderName || '—'}</td>
                <td>{g.site ? <span className="chip site-chip static">{g.site}</span> : <span className="muted">—</span>}</td>
                <td className="muted" title={g.createdAt}>{relativeTimeAr(g.createdAt)}</td>
                <td className="muted" title={p.trash && g.deletedAt ? g.deletedAt : g.updatedAt}>
                  {relativeTimeAr(p.trash && g.deletedAt ? g.deletedAt : g.updatedAt)}
                </td>
                <td className="col-views muted">{g.views > 0 ? arDigits(g.views) : '—'}</td>
                {/* عمود إجراءات واحد دائمًا (يقابل رأسه الوحيد) — محتواه بحسب الشاشة */}
                <td className="col-actions">
                  {p.trash ? (
                    <>
                      <Button size="sm" onClick={() => p.onRestore(g)}>
                        {t('library.restore')}
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => p.onRemove(g)}>
                        {t('library.deleteForever')}
                      </Button>
                    </>
                  ) : (
                    g.mine && (
                      <span className="table-menu-wrap">
                        <button
                          className={`more-btn${menuFor === g.id ? ' on' : ''}`}
                          aria-label={t('library.moreActions')}
                          title={t('library.moreActions')}
                          aria-expanded={menuFor === g.id}
                          onClick={() => setMenuFor((v) => (v === g.id ? null : g.id))}
                        >
                          ⋯
                        </button>
                        {menuFor === g.id && (
                          <>
                            <div className="guide-menu-backdrop" onClick={() => setMenuFor(null)} />
                            <div className="guide-menu table-pop" role="group" aria-label={t('library.cardMenuA11y')}>
                              {/* كل فعل يُغلق القائمة أولًا ثم ينفّذ — سلوك قوائم موحّد لا مفاجآت */}
                              <GuideMenuActions
                                g={g}
                                folders={p.folders}
                                inTrash={false}
                                onOpen={() => act(() => p.onOpen(g))}
                                onBookmark={() => act(() => p.onBookmark(g))}
                                onPublish={() => act(() => p.onPublish(g))}
                                onDuplicate={() => act(() => p.onDuplicate(g))}
                                onShare={() => act(() => p.onShare(g))}
                                onMove={(fid) => act(() => p.onMove(g, fid))}
                                onRemove={() => act(() => p.onRemove(g))}
                                onRestore={() => act(() => p.onRestore(g))}
                              />
                            </div>
                          </>
                        )}
                      </span>
                    )
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
