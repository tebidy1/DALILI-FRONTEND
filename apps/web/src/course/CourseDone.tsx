import { useEffect } from 'react'
import { t } from '../i18n'

/** مدة بطاقة الختام — هادئة لثانيتين ثم تختفي وحدها (وثيقة التجربة ٤.٥) */
export const COURSE_DONE_MS = 2000

/** د١: لحظة احتفال صغيرة عند إكمال الدورة — بلا صوت ولا نقاط ولا نافذة تقطع العمل */
export function CourseDone({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(onClose, COURSE_DONE_MS)
    return () => window.clearTimeout(id)
  }, [onClose])
  return (
    <div className="course-done no-print" role="status">
      {t('course.doneTitle')}
    </div>
  )
}
