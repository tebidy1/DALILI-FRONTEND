import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { t } from '../../i18n'
import { arDigits } from '../../lib/format'
import { IconCheck } from '../../ui/icons'
import { Skeleton } from '../../ui/Skeleton'
import { CourseDone } from '../CourseDone'
import { useCourse } from '../useCourse'
import { LESSON_GLYPH } from '../lesson-glyphs'

/**
 * د١ب: صفحة الدورة — الدروس بعلاماتها، وفعل واحد واضح «ابدأ» أو «تابع». تحتفل هنا بهدوء حين
 * يصلها المتدرّب من آخر درس أكمل به الدورة (المشغّل يمرّر ذلك في حالة التنقّل).
 */
export function CourseHome() {
  const { id = '' } = useParams()
  const location = useLocation()
  const { state, failed } = useCourse(id)
  const [celebrate, setCelebrate] = useState(() => (location.state as { celebrate?: boolean } | null)?.celebrate === true)

  if (failed) return <div className="page course-home"><p className="muted">{t('course.unavailable')}</p></div>
  if (!state) return <div className="page course-home"><Skeleton /></div>
  const next = state.items.find((i) => i.id === state.nextItemId)
  return (
    <div className="page course-home">
      <header className="course-home-head">
        <h1 dir="auto">{state.title}</h1>
        <p className="course-home-meta muted">
          <span>{t('course.lessons', { n: arDigits(state.items.length) })}</span>
          <span>{t('course.minutes', { n: arDigits(state.minutes) })}</span>
          <span>{t('course.progress', { done: arDigits(state.itemsDone), total: arDigits(state.items.length) })}</span>
        </p>
        {state.completedAt ? (
          <p className="course-home-complete">
            <IconCheck size={16} /> {t('course.completed')}
          </p>
        ) : next ? (
          <Link className="btn" to={`/c/${id}/${next.id}`}>
            {state.itemsDone > 0 ? t('course.continue', { title: next.title }) : t('course.start')}
          </Link>
        ) : null}
      </header>
      {state.items.length === 0 && <p className="muted">{t('course.noLessons')}</p>}
      <ol className="course-lesson-list">
        {state.items.map((it) => (
          <li key={it.id}>
            <Link className={`course-lesson-row${it.done ? ' done' : ''}`} to={`/c/${id}/${it.id}`}>
              <span className="lesson-glyph" aria-hidden>{LESSON_GLYPH[it.type]}</span>
              <span className="course-lesson-title" dir="auto">{it.title}</span>
              <span className="lesson-minutes">{t('course.minutes', { n: arDigits(it.minutes) })}</span>
              {it.done && <IconCheck size={16} aria-label={t('course.completed')} />}
            </Link>
          </li>
        ))}
      </ol>
      <p className="course-bar-note muted">{t('course.transparency')}</p>
      {celebrate && <CourseDone onClose={() => setCelebrate(false)} />}
    </div>
  )
}
