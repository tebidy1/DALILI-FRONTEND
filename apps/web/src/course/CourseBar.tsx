import { Link } from 'react-router-dom'
import type { CourseStateDto } from '@dalili/shared'
import { t } from '../i18n'
import { arDigits } from '../lib/format'
import { Button } from '../ui/Button'

/**
 * رابط عنصر في الدورة: الدورة بالدروس في مشغّلها (د١ب)، ومضمّن الكرّاسة يحمل الدورة معه،
 * والدليل المنفرد هو الدورة نفسها
 */
export function courseItemHref(course: Pick<CourseStateDto, 'guideId' | 'kind'>, itemId: string): string {
  if (course.kind === 'course') return `/c/${course.guideId}/${itemId}`
  return itemId === course.guideId ? `/g/${course.guideId}` : `/g/${itemId}?course=${course.guideId}`
}

/**
 * د١: شريط الدورة أعلى شاشة القارئ — أين أنا، وفعل واحد واضح. تقدّم بالكلمات لا بنسبة،
 * وبلا ألوان إنذار (وثيقة التجربة ٤.١–٤.٤)، وسطر الشفافية ثابت (٤.٦).
 */
export function CourseBar({ state, currentId, onFinish }: { state: CourseStateDto; currentId: string; onFinish: () => void }) {
  const current = state.items.find((i) => i.id === currentId)
  const next = state.items.find((i) => i.id === state.nextItemId)
  const total = state.items.length
  return (
    <section className="course-bar no-print" aria-label={state.title}>
      <div className="course-bar-row">
        <strong className="course-bar-title" dir="auto">{state.title}</strong>
        <span className="course-bar-progress">{t('course.progress', { done: arDigits(state.itemsDone), total: arDigits(total) })}</span>
        <div className="course-bar-action">
          {current && !current.done ? (
            <Button size="sm" variant="ghost" onClick={onFinish}>
              {t('course.markItemDone')}
            </Button>
          ) : next ? (
            <Link className="btn sm" to={courseItemHref(state, next.id)}>
              {t('course.continue', { title: next.title })}
            </Link>
          ) : currentId !== state.guideId ? (
            <Link className="btn ghost sm" to={`/g/${state.guideId}`}>
              {t('course.backToCourse')}
            </Link>
          ) : null}
        </div>
      </div>
      <p className="course-bar-note muted">{t('course.transparency')}</p>
    </section>
  )
}
