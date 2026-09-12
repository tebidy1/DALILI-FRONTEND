import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { AssignedItemDto } from '@dalili/shared'
import { client } from '../api'
import { t } from '../i18n'
import { Skeleton } from '../ui/Skeleton'
import { StateView } from '../ui/StateView'
import { IconInbox, IconRetry } from '../ui/icons'
import { AssignedList } from './AssignedList'

/**
 * ASG: شاشة «أُسند إليّ» — كل ما أُسند إليّ (أنا/فريقي/المساحة) بحالاته. فتح العنصر
 * يسجّل «فُتح» تلقائيًا ثم ينتقل للدليل؛ «تمّ» يبدّل الإتمام ويعيد الجلب. حالات UX الأربع.
 */
export function AssignedPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<AssignedItemDto[] | null>(null)
  const [error, setError] = useState(false)

  const load = useCallback(() => {
    setError(false)
    client
      .listAssigned()
      .then(setItems)
      .catch(() => setError(true))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const onOpen = useCallback(
    (it: AssignedItemDto) => {
      client.setAssignmentProgress(it.assignmentId).catch(() => {})
      navigate(`/g/${it.guideId}`)
    },
    [navigate],
  )

  const onToggleDone = useCallback(
    (assignmentId: string, done: boolean) => {
      // تحديث متفائل ثم إعادة جلب لتثبيت الحقيقة
      setItems((prev) =>
        prev
          ? prev.map((it) => (it.assignmentId === assignmentId ? { ...it, doneAt: done ? new Date().toISOString() : null } : it))
          : prev,
      )
      client
        .setAssignmentProgress(assignmentId, done)
        .then(() => load())
        .catch(() => load())
    },
    [load],
  )

  return (
    <div className="page assigned-page">
      <header className="page-head">
        <h1>{t('assigned.title')}</h1>
      </header>
      {error ? (
        <StateView
          kind="error"
          icon={<IconRetry size={28} />}
          title={t('assigned.loadError')}
          action={{ label: t('common.retry'), onAction: load }}
        />
      ) : items === null ? (
        <div className="assigned-loading">
          <Skeleton />
          <Skeleton />
          <Skeleton />
        </div>
      ) : items.length === 0 ? (
        <StateView kind="empty" icon={<IconInbox size={28} />} title={t('assigned.empty')} />
      ) : (
        <AssignedList items={items} onOpen={onOpen} onToggleDone={onToggleDone} />
      )}
    </div>
  )
}
