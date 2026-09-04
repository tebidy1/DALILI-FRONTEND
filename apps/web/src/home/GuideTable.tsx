import type { FolderDto, GuideSummaryDto } from '@dalili/shared'
import { t } from '../i18n'
import { relativeTimeAr } from '../lib/format'
import { Button } from '../ui/Button'
import { IconTrash } from '../ui/icons'
import { isPicked, type Selection } from '../lib/selection'

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
  confirming: string | null
  onSort: (col: 'title' | 'created' | 'updated', dir: 'asc' | 'desc') => void
  onPick: (id: string, shiftKey: boolean) => void
  onOpen: (g: GuideSummaryDto) => void
  onRestore: (g: GuideSummaryDto) => void
  onRemove: (g: GuideSummaryDto) => void
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
            {p.trash && <th className="col-actions" aria-label={t('common.delete')} />}
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
                <td className="col-views muted">{g.views}</td>
                {p.trash && (
                  <td className="col-actions">
                    <Button size="sm" onClick={() => p.onRestore(g)}>
                      {t('library.restore')}
                    </Button>
                    <Button size="sm" variant={p.confirming === g.id ? 'danger' : 'ghost'} onClick={() => p.onRemove(g)}>
                      {p.confirming === g.id ? t('common.confirmDelete') : <IconTrash size={14} />}
                    </Button>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
