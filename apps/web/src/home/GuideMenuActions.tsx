import { useState } from 'react'
import type { FolderDto, GuideSummaryDto } from '@dalili/shared'
import { Button } from '../ui/Button'
import { t } from '../i18n'
import { AssignDialog } from '../assigned/AssignDialog'
import { AssigneesPanel } from '../assigned/AssigneesPanel'
import { SuspendDialog } from './SuspendDialog'
import type { ModerateFn } from './moderation'

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
  /** ب: إشراف المدير ومدير القسم — يظهر حين access.moderate */
  onModerate: ModerateFn
  /** أقسام المساحة للمدير وحده (تغيير القسم المالك) — null لغيره */
  teams: { id: string; name: string }[] | null
}) {
  const g = p.g
  const [showAssign, setShowAssign] = useState(false)
  const [showAssignees, setShowAssignees] = useState(false)
  const [showSuspend, setShowSuspend] = useState(false)
  const moderate = !p.inTrash && !!g.access?.moderate
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
      {/* ب (§٦، §٧، PUB-03): إشراف على المنشور — التثبيت والتوثيق والإيقاف، والقسم للمدير */}
      {moderate && (
        <>
          <Button size="sm" variant="ghost" onClick={() => void p.onModerate({ kind: g.pinned ? 'unpin' : 'pin' })}>
            {g.pinned ? t('home.unpin') : t('home.pin')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void p.onModerate({ kind: g.verified ? 'unverify' : 'verify' })}>
            {g.verified ? t('home.unverify') : t('home.verify')}
          </Button>
          {g.suspended ? (
            <Button size="sm" variant="ghost" onClick={() => void p.onModerate({ kind: 'resume' })}>
              {t('home.resume')}
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setShowSuspend(true)}>
              {t('home.suspend')}
            </Button>
          )}
        </>
      )}
      {!p.inTrash && p.teams && g.source !== 'official' && (
        <select
          className="lib-move"
          aria-label={t('home.moveTeam')}
          value={g.ownerTeamId ?? ''}
          onChange={(e) => void p.onModerate({ kind: 'team', teamId: e.target.value || null })}
        >
          <option value="">{t('home.noTeam')}</option>
          {p.teams.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      )}
      {showSuspend && <SuspendDialog title={g.title} onModerate={p.onModerate} onClose={() => setShowSuspend(false)} />}
      {showAssign && (
        <AssignDialog guideId={g.id} isPrivate={g.visibility === 'private'} onClose={() => setShowAssign(false)} />
      )}
      {showAssignees && <AssigneesPanel guideId={g.id} kind={g.kind} onClose={() => setShowAssignees(false)} />}
    </div>
  )
}
