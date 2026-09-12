import type { FolderDto } from '@dalili/shared'
import { Button } from '../ui/Button'
import { t } from '../i18n'

/**
 * LIB-05: شريط العمليات الجماعية — يظهر فوق الشبكة عند تحديد بطاقة فأكثر.
 * في السلة تختصر على الحذف النهائي وإلغاء التحديد (لا نقل ولا مشاركة لمحذوف).
 */
export function BulkBar({ count, folders, trash, busy, onMove, onDelete, onShare, onClear }: {
  count: number
  folders: FolderDto[]
  trash: boolean
  busy: boolean
  onMove: (folderId: string | null) => void
  onDelete: () => void
  onShare: () => void
  onClear: () => void
}) {
  return (
    <div className="bulk-bar" role="toolbar" aria-label={t('library.bulkBar')}>
      <span className="bulk-count">{t('library.selectedCount', { count })}</span>
      {!trash && (
        <select
          className="lib-move"
          aria-label={t('library.bulkMove')}
          value=""
          disabled={busy}
          onChange={(e) => {
            const v = e.target.value
            if (v) onMove(v === 'root' ? null : v)
          }}
        >
          <option value="">{t('library.bulkMove')}</option>
          <option value="root">{t('library.rootFolder')}</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      )}
      {!trash && (
        <Button size="sm" variant="ghost" onClick={onShare} busy={busy}>
          {t('library.bulkShare')}
        </Button>
      )}
      {/* القاعدة الموحدة: خارج السلة النقل ناعم بلمسة، وفي السلة الحذف نهائي */}
      <Button
        size="sm"
        variant="danger"
        onClick={onDelete}
        busy={busy}
        aria-label={trash ? t('library.deleteForever') : t('library.bulkDelete')}
      >
        {trash ? t('library.deleteForever') : t('library.bulkDelete')}
      </Button>
      <Button size="sm" variant="ghost" onClick={onClear}>
        {t('library.clearSelection')}
      </Button>
    </div>
  )
}
