import { useEffect, useState } from 'react'
import type { AssignmentBoardDto } from '@dalili/shared'
import { client } from '../api'
import { t } from '../i18n'
import { Skeleton } from '../ui/Skeleton'

/**
 * ASG: لوحة المُسنِد «من أُسند إليهم» — أسماء المستهدَفين الحاليين وحالة كلٍّ
 * (فُتح/تمّ) ورأس بعدّاد «فُتح ٧ من ٢٠ · أتمّ ٤». يُحلّ المستهدَفون حيًّا خادميًّا.
 */
interface Props {
  guideId: string
  onClose: () => void
}

export function AssigneesPanel({ guideId, onClose }: Props) {
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
            <table className="assignees-table">
              <thead>
                <tr>
                  <th>{t('assignees.colMember')}</th>
                  <th>{t('assignees.colTeam')}</th>
                  <th aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                {board.recipients.map((r) => {
                  const state = r.doneAt ? 'done' : r.openedAt ? 'opened' : 'new'
                  const label = state === 'done' ? t('assignees.stateDone') : state === 'opened' ? t('assignees.stateOpened') : t('assignees.stateNew')
                  return (
                    <tr key={r.userId}>
                      <td dir="auto">{r.email}</td>
                      <td dir="auto">{r.teamName ?? '—'}</td>
                      <td>
                        <span className={`chip assignee-state ${state}`}>{label}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
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
