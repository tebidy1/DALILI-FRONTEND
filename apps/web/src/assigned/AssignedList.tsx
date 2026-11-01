import type { AssignedItemDto } from '@dalili/shared'
import { siteLabel } from '@dalili/core'
import { t } from '../i18n'
import { arDigits, relativeTimeAr } from '../lib/format'
import { Button } from '../ui/Button'
import { IconCheck, IconInbox } from '../ui/icons'
import { courseStarted } from './useAssignmentActions'

/**
 * ASG + د١: قائمة العناصر المُسنَدة إليّ — مكوّن عرض خالص (بلا جلب) تتشاركه شاشة «أُسند إليّ»
 * وقسم الرئيسية. كل عنصر دورة: كم تأخذ، وأين وصلت، وفعل واحد واضح (وثيقة التجربة ٤.١–٤.٣).
 * الإكمال يحسبه الخادم من العناصر المنتهية، فلا زر «تمّ» يدوي.
 */

export interface AssignedListProps {
  items: AssignedItemDto[]
  /** العنوان يفتح الدورة نفسها */
  onOpen: (item: AssignedItemDto) => void
  /** الزر الواحد: «ابدأ» أو «تابع: <التالي>» */
  onContinue: (item: AssignedItemDto) => void
  /** عرض مضغوط لقسم الرئيسية (يخفي سطر الشفافية والملاحظة) */
  compact?: boolean
}

export function AssignedList({ items, onOpen, onContinue, compact = false }: AssignedListProps) {
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
        const c = it.course
        const done = it.doneAt !== null
        const started = courseStarted(it)
        const next = c.items.find((i) => i.id === c.nextItemId)
        const size = c.kind === 'course' ? `${t('course.lessons', { n: arDigits(c.items.length) })} · ` : c.items.length > 1 ? `${t('course.guides', { n: arDigits(c.items.length) })} · ` : ''
        return (
          <li key={it.assignmentId} className={`assigned-card${done ? ' is-done' : ''}`}>
            <div className="assigned-main">
              <button type="button" className="assigned-title" title={it.title} onClick={() => onOpen(it)} dir="auto">
                {it.title}
              </button>
              <div className="assigned-meta">
                <span className="chip">{t(it.kind === 'booklet' ? 'assigned.kindBooklet' : it.kind === 'course' ? 'assigned.kindCourse' : 'assigned.kindGuide')}</span>
                {it.site && <span className="assigned-site" dir="auto">{siteLabel(it.site)}</span>}
                <span className="muted">
                  {size}
                  {t('course.minutes', { n: arDigits(c.minutes) })}
                </span>
                {it.openedAt === null && <span className="chip assigned-new">{t('assigned.newBadge')}</span>}
              </div>
              {started && !done && c.items.length > 1 && (
                <p className="assigned-progress">{t('course.progress', { done: arDigits(c.itemsDone), total: arDigits(c.items.length) })}</p>
              )}
              <div className="assigned-sub muted">
                <span dir="auto">{t('assigned.from')}: {it.assignerEmail}</span>
                <span>· {relativeTimeAr(it.createdAt)}</span>
              </div>
              {!compact && it.note && <p className="assigned-note" dir="auto">{it.note}</p>}
              {!compact && <p className="assigned-disclosure muted">{t('course.transparency')}</p>}
            </div>
            <div className="assigned-actions">
              {done ? (
                <span className="assigned-complete">
                  <IconCheck size={14} /> {t('course.completed')}
                </span>
              ) : (
                <Button size="sm" onClick={() => onContinue(it)}>
                  {started && next ? t('course.continue', { title: next.title }) : t('course.start')}
                </Button>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
