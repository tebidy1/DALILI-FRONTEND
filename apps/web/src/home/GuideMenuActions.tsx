import { useState } from 'react'
import type { FolderDto, GuideSummaryDto } from '@dalili/shared'
import { Button } from '../ui/Button'
import { t } from '../i18n'
import { AssignDialog } from '../assigned/AssignDialog'
import { AssigneesPanel } from '../assigned/AssigneesPanel'

/**
 * المرحلة ٣ (قرار المالك): إجراءات الدليل مصدر واحد لسطحَي العرض — بطاقة الشبكة
 * وقائمة الجدول تحملان القائمة نفسها، فلا عرض أعمى عن إجراءات العرض الآخر.
 * القاعدة الموحدة للمرحلة ١ مطبقة: النقل الناعم للسلة نقرة واحدة، والنهائي نافذة.
 */
export function GuideMenuActions(p: {
  g: GuideSummaryDto
  folders: FolderDto[]
  inTrash: boolean
  onOpen: () => void
  onBookmark: () => void
  onDuplicate: () => void
  onPublish: () => void
  onShare: () => void
  onMove: (folderId: string | null) => void
  onRemove: () => void
  onRestore: () => void
}) {
  const g = p.g
  const [showAssign, setShowAssign] = useState(false)
  const [showAssignees, setShowAssignees] = useState(false)
  return (
    <div className="guide-menu-actions">
      {p.inTrash ? (
        <>
          <Button size="sm" onClick={p.onRestore}>
            {t('library.restore')}
          </Button>
          <Button size="sm" variant="danger" onClick={p.onRemove}>
            {t('library.deleteForever')}
          </Button>
        </>
      ) : g.mine ? (
        <>
          <Button size="sm" onClick={p.onOpen}>
            {t('common.openEditor')}
          </Button>
          <Button size="sm" variant="ghost" onClick={p.onShare}>
            {t('home.share')}
          </Button>
          <Button size="sm" variant="ghost" onClick={p.onBookmark}>
            {g.bookmarked ? t('home.unbookmark') : t('home.bookmark')}
          </Button>
          <Button size="sm" variant="ghost" onClick={p.onPublish}>
            {g.visibility === 'private' ? t('home.publish') : t('home.unpublish')}
          </Button>
          <Button size="sm" variant="ghost" onClick={p.onDuplicate}>
            {t('library.duplicate')}
          </Button>
          {/* ASG: إسناد الدليل ومتابعة من أُسند إليهم — لمالك الدليل */}
          <Button size="sm" variant="ghost" onClick={() => setShowAssign(true)}>
            {t('assign.button')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowAssignees(true)}>
            {t('assignees.title')}
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
          <Button size="sm" variant="ghost" onClick={p.onRemove}>
            {t('library.moveToTrash')}
          </Button>
        </>
      ) : (
        <Button size="sm" onClick={p.onOpen}>
          {t('common.openEditor')}
        </Button>
      )}
      {showAssign && (
        <AssignDialog guideId={g.id} isPrivate={g.visibility === 'private'} onClose={() => setShowAssign(false)} />
      )}
      {showAssignees && <AssigneesPanel guideId={g.id} onClose={() => setShowAssignees(false)} />}
    </div>
  )
}
