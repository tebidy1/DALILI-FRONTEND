import { useCallback } from 'react'
import type { AssignedItemDto } from '@dalili/shared'
import { client } from '../api'

/**
 * أفعال الإسناد المشتركة بين شاشة «أُسند إليّ» وشريط الرئيسية: الفتح يسجّل «فُتح»
 * ثم ينتقل للدليل، و«تمّ» يبدّل الإتمام متفائلًا ثم يعيد الجلب لتثبيت الحقيقة —
 * وشريط الرئيسية وحده يعيد جلب نظرة المساحة فيتحرّك شريطها الجانبي.
 */
export function useAssignmentActions(opts: {
  navigate: (to: string) => void
  setItems: React.Dispatch<React.SetStateAction<AssignedItemDto[] | null>>
  load: () => void
  reloadOverview?: () => void
}) {
  const { navigate, setItems, load, reloadOverview } = opts

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
        prev ? prev.map((it) => (it.assignmentId === assignmentId ? { ...it, doneAt: done ? new Date().toISOString() : null } : it)) : prev,
      )
      client
        .setAssignmentProgress(assignmentId, done)
        .then(() => {
          load()
          reloadOverview?.()
        })
        .catch(() => load())
    },
    [load, reloadOverview],
  )

  return { onOpen, onToggleDone }
}
