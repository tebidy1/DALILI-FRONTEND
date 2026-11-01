import { useEffect, useState } from 'react'
import type { LessonDto } from '@dalili/shared'
import { client } from '../../api'

/** د١ب: الدرس الواحد للمشغّل — يبدأ من جديد عند كل درس، فلا يظهر درس سابق تحت عنوان لاحق */
export function useLesson(courseId: string, lessonId: string): { lesson: LessonDto | null; failed: boolean } {
  const [got, setGot] = useState<{ key: string; lesson: LessonDto | null; failed: boolean } | null>(null)
  const key = `${courseId}/${lessonId}`
  useEffect(() => {
    const ac = new AbortController()
    client
      .courseLesson(courseId, lessonId, ac.signal)
      .then((lesson) => setGot({ key, lesson, failed: false }))
      .catch(() => {
        if (!ac.signal.aborted) setGot({ key, lesson: null, failed: true })
      })
    return () => ac.abort()
  }, [courseId, lessonId, key])
  return got?.key === key ? { lesson: got.lesson, failed: got.failed } : { lesson: null, failed: false }
}
