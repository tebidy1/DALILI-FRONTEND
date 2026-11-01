import { useCallback } from 'react'
import type { AssignedItemDto } from '@dalili/shared'
import { client } from '../api'
import { courseItemHref } from '../course/CourseBar'

/** د١: بدأ المتدرّب = فتح الدورة أو أنهى منها عنصراً */
export function courseStarted(it: AssignedItemDto): boolean {
  return it.openedAt !== null || it.course.itemsDone > 0
}

/**
 * أفعال الإسناد المشتركة بين شاشة «أُسند إليّ» وشريط الرئيسية. الفتح يسجّل «فُتح» ثم ينتقل.
 * د١: «ابدأ» يفتح الدورة نفسها (الكرّاسة بمقدّمتها)، و«تابع» يفتح العنصر التالي داخل الدورة.
 * الإكمال يُحسب في الخادم من العناصر المنتهية — لا زر «تمّ» يدوي.
 */
export function useAssignmentActions(opts: { navigate: (to: string) => void }) {
  const { navigate } = opts

  const open = useCallback(
    (it: AssignedItemDto, to: string) => {
      client.setAssignmentProgress(it.assignmentId).catch(() => {})
      navigate(to)
    },
    [navigate],
  )

  // د١ب: الدورة بالدروس صفحتها /c — وغيرها القارئ
  const home = (it: AssignedItemDto) => (it.kind === 'course' ? `/c/${it.guideId}` : `/g/${it.guideId}`)

  const onOpen = useCallback((it: AssignedItemDto) => open(it, home(it)), [open])

  const onContinue = useCallback(
    (it: AssignedItemDto) => {
      const next = it.course.nextItemId
      // الدورة بالدروس: «ابدأ» نفسه يأخذ إلى أول درس — لا صفحة وسيطة
      const direct = it.kind === 'course' || courseStarted(it)
      open(it, direct && next ? courseItemHref(it.course, next) : home(it))
    },
    [open],
  )

  return { onOpen, onContinue }
}
