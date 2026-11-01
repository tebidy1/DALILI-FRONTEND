import { useCallback, useEffect, useRef, useState } from 'react'
import type { CourseStateDto } from '@dalili/shared'
import { client } from '../api'

/**
 * د١: حالة الدورة للقارئ. 404 = ليست مُسندة إليه، فلا شريط ولا خطأ ظاهر (ليس كل قارئ متدرّباً).
 * justCompleted يصير true حين تكتمل الدورة داخل هذه الجلسة فقط — دورة مكتملة أصلاً لا تحتفل مرة ثانية.
 */
export function useCourse(courseId: string | null) {
  const [state, setState] = useState<CourseStateDto | null>(null)
  const [justCompleted, setJustCompleted] = useState(false)
  /** د١ب: تعذّر جلب الدورة (غير مُسندة ولا مرئية، أو محذوفة) — صفحة الدورة تقولها بدل هيكل لا ينتهي */
  const [failed, setFailed] = useState(false)
  const latest = useRef<CourseStateDto | null>(null)

  useEffect(() => {
    setState(null)
    setFailed(false)
    latest.current = null
    // حارس دفاعي كـAssignedBand: شاشات اختبار كثيرة تحاكي client جزئياً بلا courseState
    const load = client.courseState?.bind(client)
    if (!courseId || !load) return
    const ac = new AbortController()
    load(courseId, ac.signal)
      .then((s) => {
        latest.current = s
        setState(s)
      })
      .catch(() => {
        if (!ac.signal.aborted) setFailed(true)
      })
    return () => ac.abort()
  }, [courseId])

  /** يعيد true إن اكتملت الدورة بهذا العنصر الآن — فينقل المشغّل الاحتفال إلى صفحة الدورة */
  const finish = useCallback(
    async (itemId: string): Promise<boolean> => {
      if (!courseId) return false
      const wasDone = latest.current?.completedAt != null
      const s = await client.markCourseItem(courseId, itemId).catch(() => null)
      if (!s) return false
      latest.current = s
      setState(s)
      const just = !wasDone && !!s.completedAt
      if (just) setJustCompleted(true)
      return just
    },
    [courseId],
  )

  return { state, failed, finish, justCompleted, dismiss: () => setJustCompleted(false) }
}
