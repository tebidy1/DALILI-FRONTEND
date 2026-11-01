import { useEffect, useState } from 'react'
import type { AssignmentBoardDto, AssignmentRecipientDto } from '@dalili/shared'
import { client } from '../api'
import { t } from '../i18n'
import { arDigits } from '../lib/format'
import { Skeleton } from '../ui/Skeleton'

/**
 * د١: ثلاث مجموعات بأسماء محايدة بالترتيب — بلا ألوان إنذار (وثيقة التجربة ٦.٢)
 */
const GROUPS: { key: 'done' | 'started' | 'new'; label: 'assignees.groupDone' | 'assignees.groupStarted' | 'assignees.groupNew'; pick: (r: AssignmentRecipientDto) => boolean }[] = [
  { key: 'done', label: 'assignees.groupDone', pick: (r) => r.doneAt !== null },
  { key: 'started', label: 'assignees.groupStarted', pick: (r) => r.doneAt === null && r.started },
  { key: 'new', label: 'assignees.groupNew', pick: (r) => r.doneAt === null && !r.started },
]

/**
 * ASG: لوحة المُسنِد «من أُسند إليهم» — أسماء المستهدَفين الحاليين ورأس بعدّاد «فُتح ٧ من ٢٠ · أتمّ ٤».
 * يُحلّ المستهدَفون حيًّا خادميًّا. د١: مقسومون إلى أكملوا وبدأوا ولم يبدأوا بعد.
 */
interface Props {
  guideId: string
  /** د١ب: الدورة تعدّ بالدروس */
  kind?: 'guide' | 'booklet' | 'course'
  onClose: () => void
}

export function AssigneesPanel({ guideId, kind, onClose }: Props) {
  const [board, setBoard] = useState<AssignmentBoardDto | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let alive = true
    client
      .guideAssignments(guideId)
      .then((b) => alive && setBoard(b))
      .catch(() => alive && setError(true))
    return () => {
      alive = false
    }
  }, [guideId])

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette assignees-panel" role="dialog" aria-modal="true" aria-label={t('assignees.title')} onClick={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <h2>{t('assignees.title')}</h2>
        </div>

        {error ? (
          <p className="assign-error" role="alert">{t('assignees.loadError')}</p>
        ) : board === null ? (
          <div className="assignees-loading">
            <Skeleton />
            <Skeleton />
          </div>
        ) : board.recipients.length === 0 ? (
          <p className="assignees-empty">{t('assignees.empty')}</p>
        ) : (
          <>
            <p className="assignees-header" role="status">
              {t('assignees.header', { opened: board.openedCount, total: board.recipientCount, done: board.doneCount })}
            </p>
            {GROUPS.map(({ key, label, pick }) => {
              const rows = board.recipients.filter(pick)
              if (rows.length === 0) return null
              return (
                <section key={key}>
                  <h3 className="assignees-group">
                    {t(label)} · {arDigits(rows.length)}
                  </h3>
                  <table className="assignees-table">
                    <thead>
                      <tr>
                        <th>{t('assignees.colMember')}</th>
                        <th>{t('assignees.colTeam')}</th>
                        <th aria-hidden="true" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.userId}>
                          <td dir="auto">{r.email}</td>
                          <td dir="auto">{r.teamName ?? '—'}</td>
                          <td className="muted">
                            {key === 'started' && r.itemsTotal > 1 ? t(kind === 'course' ? 'assignees.lessons' : 'assignees.items', { done: arDigits(r.itemsDone), total: arDigits(r.itemsTotal) }) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )
            })}
          </>
        )}

        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            {t('booklet.shareCheckCancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
