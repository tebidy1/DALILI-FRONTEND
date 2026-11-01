import { useEffect, useRef, type ReactNode } from 'react'
import type { CourseStateDto } from '@dalili/shared'
import { CourseBar } from './CourseBar'
import { CourseDone } from './CourseDone'
import { useCourse } from './useCourse'
import { useReachedEnd, type ObserveEnd } from './useReachedEnd'

/**
 * د١: الدليل داخل دورة — شريطها فوقه، والوصول إلى آخره يُنهي العنصر، والإكمال يحتفل بهدوء.
 * يلفّ أي عرض للدليل: شاشة القارئ، وشاشة من يملك التحرير في وضع العرض (المدير ومدير القسم
 * والمحرر يُسند إليهم أيضاً). courseId=null = لا دورة، فلا طلب ولا شريط.
 */
export function CourseTrack(p: {
  guideId: string
  courseId: string | null
  observe?: ObserveEnd
  children: (course: CourseStateDto | null) => ReactNode
}) {
  const { guideId } = p
  const course = useCourse(p.courseId)
  const endRef = useRef<HTMLDivElement>(null)
  const reached = useReachedEnd(endRef, guideId, p.observe)
  const item = course.state?.items.find((i) => i.id === guideId)
  const { finish } = course

  useEffect(() => {
    if (reached && item && !item.done) void finish(guideId)
  }, [reached, item, finish, guideId])

  return (
    <>
      {course.state && <CourseBar state={course.state} currentId={guideId} onFinish={() => void finish(guideId)} />}
      {p.children(course.state)}
      <div ref={endRef} className="course-end" aria-hidden="true" />
      {course.justCompleted && <CourseDone onClose={course.dismiss} />}
    </>
  )
}
