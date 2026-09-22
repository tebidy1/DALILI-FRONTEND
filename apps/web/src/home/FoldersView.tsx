import type { FolderDto } from '@dalili/shared'
import { StateView } from '../ui/StateView'
import { IconFolder } from '../ui/icons'
import { t } from '../i18n'
import { arDigits } from '../lib/format'

/**
 * عرض «حسب المجلدات» في الرئيسية (طلب المالك 2026-09-03): بطاقات اسم المجلد
 * وعدد أدلته بأيقونة ويندوز المعروفة — والنقر يفتح أدلة المجلد ويعيد عرض الأدلة.
 */
export function FoldersView({ folders, onOpen }: { folders: FolderDto[]; onOpen: (folderId: string) => void }) {
  if (folders.length === 0) {
    return <StateView kind="empty" icon={<IconFolder size={30} />} title={t('home.foldersEmpty')} desc={t('home.foldersEmptyHint')} />
  }
  return (
    <div className="folder-cards">
      {folders.map((f) => (
        <button
          key={f.id}
          className="folder-card"
          aria-label={`${t('home.folderOpenA11y')}: ${f.name}`}
          onClick={() => onOpen(f.id)}
        >
          {/* شكل المجلد المعروف (طلب المالك 2026-09-03): أيقونة ويندوز واضحة لا شارة حرف */}
          <span className="folder-ic" aria-hidden="true">
            <IconFolder size={30} />
          </span>
          <span className="folder-card-name">{f.name}</span>
          <span className="folder-card-count">{t('library.guidesCount', { count: arDigits(f.count) })}</span>
        </button>
      ))}
    </div>
  )
}
