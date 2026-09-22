import type { AssignedItemDto } from '@dalili/shared'
import { siteLabel } from '@dalili/core'
import { t } from '../i18n'
import { arDigits, relativeTimeAr } from '../lib/format'
import { Button } from '../ui/Button'
import { IconCheck, IconInbox } from '../ui/icons'

/**
 * ASG: قائمة العناصر المُسنَدة إليّ — مكوّن عرض خالص (بلا جلب) تتشاركه شاشة
 * «أُسند إليّ» وقسم الرئيسية. لكل عنصر: العنوان (يفتح)، النوع والموقع، المُسنِد،
 * الملاحظة، سطر إفصاح صريح، وزر «تمّ» يبدّل الإتمام. حالة فارغة صريحة.
 */

export interface AssignedListProps {
  items: AssignedItemDto[]
  onOpen: (item: AssignedItemDto) => void
  onToggleDone: (assignmentId: string, done: boolean) => void
  /** عرض مضغوط لقسم الرئيسية (يخفي الإفصاح والملاحظة الطويلة) */
  compact?: boolean
}

export function AssignedList({ items, onOpen, onToggleDone, compact = false }: AssignedListProps) {
  if (items.length === 0) {
    return (
      <div className="assigned-empty">
        <IconInbox size={28} />
        <p>{t('assigned.empty')}</p>
      </div>
    )
  }
  return (
    <ul className="assigned-list">
      {items.map((it) => {
        const done = it.doneAt !== null
        const isNew = it.openedAt === null
        return (
          <li key={it.assignmentId} className={`assigned-card${done ? ' is-done' : ''}`}>
            <div className="assigned-main">
              <button type="button" className="assigned-title" title={it.title} onClick={() => onOpen(it)} dir="auto">
                {it.title}
              </button>
              <div className="assigned-meta">
                <span className="chip">{it.kind === 'booklet' ? t('assigned.kindBooklet') : t('assigned.kindGuide')}</span>
                {it.site && <span className="assigned-site" dir="auto">{siteLabel(it.site)}</span>}
                <span className="muted">{arDigits(it.stepCount)} {t('assigned.stepsLabel')}</span>
                {isNew && <span className="chip assigned-new">{t('assigned.newBadge')}</span>}
              </div>
              <div className="assigned-sub muted">
                <span dir="auto">{t('assigned.from')}: {it.assignerEmail}</span>
                <span>· {relativeTimeAr(it.createdAt)}</span>
              </div>
              {!compact && it.note && <p className="assigned-note" dir="auto">{it.note}</p>}
              {!compact && <p className="assigned-disclosure muted">{t('assigned.disclosure')}</p>}
            </div>
            <div className="assigned-actions">
              <Button size="sm" variant="ghost" onClick={() => onOpen(it)}>
                {t('assigned.open')}
              </Button>
              <Button size="sm" variant={done ? 'solid' : 'ghost'} onClick={() => onToggleDone(it.assignmentId, !done)}>
                {done ? (
                  <>
                    <IconCheck size={14} /> {t('assigned.doneState')}
                  </>
                ) : (
                  t('assigned.markDone')
                )}
              </Button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
