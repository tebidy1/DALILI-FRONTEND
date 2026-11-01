import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { youtubeId } from '@dalili/core'
import type { GuideDto, LessonDto } from '@dalili/shared'
import { t } from '../../i18n'
import { arDigits } from '../../lib/format'
import { requestTrainStartGuide } from '../../lib/ext-bridge'
import { IconTarget } from '../../ui/icons'
import { Skeleton } from '../../ui/Skeleton'
import { Button } from '../../ui/Button'
import { VideoBlock } from '../../components/VideoBlock'
import { GuideSteps } from '../../editor/ReadOnlyGuide'
import { ViewerBooklet } from '../../viewer/ViewerBooklet'
import { useCourse } from '../useCourse'
import { useReachedEnd, type ObserveEnd } from '../useReachedEnd'
import { useLesson } from './useLesson'

/**
 * د١ب: مشغّل الدرس — درس واحد في الشاشة، و«الدرس ٢ من ٥»، و«التالي ←».
 * الدليل والصفحة يُنهيان بالوصول إلى آخرهما أو بـ«التالي»، والفيديو بـ«التالي» وحده (لا نقيس المشاهدة).
 */
export function LessonPlayer({ observe }: { observe?: ObserveEnd }) {
  const { id = '', lessonId = '' } = useParams()
  const navigate = useNavigate()
  const course = useCourse(id)
  const { lesson, failed } = useLesson(id, lessonId)
  const endRef = useRef<HTMLDivElement>(null)
  // المفتاح يتغيّر حين يصل الدرس، فيُراقَب آخره بعد أن يُرسم لا قبله — صفحة فارغة أثناء التحميل لا تُنهي شيئاً
  const reached = useReachedEnd(endRef, lesson ? lessonId : `${lessonId}:loading`, observe)
  const items = course.state?.items ?? []
  const index = items.findIndex((i) => i.id === lessonId)
  const item = index >= 0 ? items[index] : undefined
  const next = index >= 0 ? items[index + 1] : items.find((i) => !i.done)
  const { finish } = course

  useEffect(() => {
    if (reached && lesson?.type !== 'video' && item && !item.done) void finish(lessonId)
  }, [reached, lesson, item, finish, lessonId])

  async function goNext() {
    if (item) await finish(lessonId)
    if (next) navigate(`/c/${id}/${next.id}`)
  }

  async function finishCourse() {
    const just = item ? await finish(lessonId) : false
    // درس أخير قصير يُنهى بمجرد ظهوره فتكتمل الدورة قبل الضغط — الاحتفال لما اكتمل في هذه الجلسة أيضاً
    navigate(`/c/${id}`, { state: { celebrate: just || course.justCompleted } })
  }

  return (
    <div className="page lesson-player">
      <header className="lesson-player-head no-print">
        <strong dir="auto">{course.state?.title ?? ''}</strong>
        {item && <span className="muted">{t('course.lessonOf', { n: arDigits(index + 1), total: arDigits(items.length) })}</span>}
        <Link className="btn ghost sm" to={`/c/${id}`}>
          {t('course.allLessons')}
        </Link>
      </header>

      <main className="lesson-player-body">
        {!lesson && !failed && <Skeleton />}
        {failed && <p className="muted">{t('course.lessonGone')}</p>}
        {lesson && (
          <>
            <h1 className="lesson-player-title" dir="auto">{lesson.title}</h1>
            <LessonBody lesson={lesson} />
            <div ref={endRef} className="course-end" aria-hidden="true" />
          </>
        )}
      </main>

      <footer className="lesson-player-foot no-print">
        {index === items.length - 1 && item ? (
          <Button onClick={() => void finishCourse()}>{t('course.finishCourse')}</Button>
        ) : next ? (
          <Button onClick={() => void goNext()}>{t('course.nextLesson', { title: next.title })}</Button>
        ) : null}
      </footer>
    </div>
  )
}

function LessonBody({ lesson }: { lesson: LessonDto }) {
  if (lesson.unavailable) return <p className="muted">{t('course.lessonGone')}</p>
  if (lesson.type === 'video') {
    const url = lesson.videoUrl ?? ''
    return (
      <>
        {youtubeId(url) ? (
          <VideoBlock url={url} title={lesson.title} />
        ) : (
          <a className="btn ghost" href={url} target="_blank" rel="noopener noreferrer">
            {t('course.videoFailed')}
          </a>
        )}
        {lesson.note && <p dir="auto">{lesson.note}</p>}
      </>
    )
  }
  if (lesson.type === 'page') return <ViewerBooklet guide={pageAsGuide(lesson)} embeds={{}} outline={false} />
  if (!lesson.guide) return <p className="muted">{t('course.lessonGone')}</p>
  return (
    <>
      <TrainMe guide={lesson.guide} hosts={lesson.trainHosts} />
      <GuideSteps guide={lesson.guide} />
    </>
  )
}

/** «دربني على النظام» — المسار نفسه الذي يستعمله المحرر للأعضاء، والإضافة الغائبة رسالتها المعروفة */
function TrainMe({ guide, hosts }: { guide: GuideDto; hosts: LessonDto['trainHosts'] }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function start() {
    setBusy(true)
    setError('')
    const res = await requestTrainStartGuide(guide, { trial: false, hosts })
    setBusy(false)
    if (!res.ok) setError(res.errorAr || t('viewer.trainNoExt'))
  }
  return (
    <div className="lesson-train no-print">
      <Button variant="ghost" icon={<IconTarget size={16} />} onClick={() => void start()} busy={busy}>
        {t('viewer.train')}
      </Button>
      {error && <p className="muted">{error}</p>}
    </div>
  )
}

/** كتل درس الصفحة تُعرض بعارض الكرّاسة نفسه */
function pageAsGuide(lesson: LessonDto): GuideDto {
  return { id: lesson.id, schemaVersion: 2, kind: 'booklet', title: lesson.title, locale: 'ar', dir: 'rtl', createdAt: '', updatedAt: '', steps: lesson.blocks ?? [] }
}
