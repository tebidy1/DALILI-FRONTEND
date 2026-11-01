import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { lessonMinutes, lessonsOf, type Lesson } from '@dalili/core'
import type { GuideDetailsDto, GuideDto, StepDto } from '@dalili/shared'
import { client } from '../../api'
import { t } from '../../i18n'
import { arDigits } from '../../lib/format'
import { InsertStep, type InsertKind } from '../../components/InsertStep'
import { VideoBlock } from '../../components/VideoBlock'
import { BlockBody } from '../../editor/blocks/BookletBlock'
import { newBlockStep, type BlockInsertKind } from '../../editor/booklet-insert'
import { LESSON_GLYPH } from '../lesson-glyphs'
import { AddLesson } from './AddLesson'
import { lessonEnd, moveLesson, patchLesson, removeLesson } from './lesson-ops'

/** فوقها ملاحظة رمادية لطيفة — لا منع */
const LONG_LESSON_MINUTES = 7

/**
 * د١ب: قائمة دروس الدورة في المحرر. `EditorPage` يوجّه إليها كما يوجّه الكرّاسة إلى
 * `BookletBlockList` (قانون الحجم §5.7). كل تعديل يُرسل steps كاملة فيمرّ بمكدس التراجع نفسه.
 */
export function CourseLessonList({
  steps,
  editing,
  courseId,
  onChange,
  onAttachShot,
}: {
  steps: StepDto[]
  editing: boolean
  courseId: string
  onChange: (steps: StepDto[]) => void
  onAttachShot: (index: number, file: File) => void
}) {
  const lessons = useMemo(() => lessonsOf(steps), [steps])
  const { guides, drafts } = useLessonGuides(lessons)
  const indexOf = useMemo(() => new Map(steps.map((s, i) => [s.id, i])), [steps])

  if (!editing) {
    return (
      <div className="course-lessons">
        <ol className="lesson-list">
          {lessons.map((l) => (
            <li key={l.id} className="lesson-card">
              <LessonHead lesson={l} minutes={minutesOf(l, guides)} />
            </li>
          ))}
        </ol>
        <Link className="btn" to={`/c/${courseId}`}>
          {t('course.openAsTrainee')}
        </Link>
      </div>
    )
  }

  const insertIn = (lessonId: string) => (kind: InsertKind) => {
    const at = lessonEnd(steps, lessonId)
    onChange([...steps.slice(0, at), newBlockStep(kind as BlockInsertKind), ...steps.slice(at)])
  }

  return (
    <div className="course-lessons editing">
      {lessons.length === 0 && <p className="course-empty-hint">{t('course.emptyHint')}</p>}
      <ol className="lesson-list">
        {lessons.map((l) => (
          <li key={l.id} className={`lesson-card lesson-${l.type}`}>
            <LessonHead
              lesson={l}
              minutes={minutesOf(l, guides)}
              onTitle={(title) => onChange(patchLesson(steps, l.id, { title }))}
              onMove={(dir) => onChange(moveLesson(steps, l.id, dir))}
              onRemove={() => onChange(removeLesson(steps, l.id))}
            />
            {l.type === 'video' && l.videoUrl && <VideoBlock url={l.videoUrl} title={l.title} />}
            {l.type === 'guide' && <p className="lesson-guide-meta">{guides[l.guideId ?? '']?.title ?? ''}</p>}
            {l.type === 'guide' && drafts.has(l.guideId ?? '') && <p className="lesson-long">{t('course.lessonDraft')}</p>}
            {l.type === 'page' && (
              <div className="lesson-page">
                {l.blocks.map((b) => {
                  const i = indexOf.get(b.id) ?? -1
                  return (
                    <div key={b.id} className="booklet-block">
                      <button type="button" className="btn ghost lesson-block-remove no-print" aria-label={t('course.removeBlock')} onClick={() => onChange(steps.filter((_, k) => k !== i))}>
                        ✕
                      </button>
                      <BlockBody
                        step={b as StepDto}
                        editing
                        missing={false}
                        onPatch={(patch) => onChange(steps.map((s, k) => (k === i ? { ...s, ...patch } : s)))}
                        onAttachShot={(file) => onAttachShot(i, file)}
                      />
                    </div>
                  )
                })}
                <InsertStep label={t('editor.blockMenuOpen')} insertAt={lessonEnd(steps, l.id)} onInsert={insertIn(l.id)} docKind="page" />
              </div>
            )}
          </li>
        ))}
      </ol>
      <AddLesson onAdd={(lesson) => onChange([...steps, lesson])} />
    </div>
  )
}

function LessonHead({
  lesson,
  minutes,
  onTitle,
  onMove,
  onRemove,
}: {
  lesson: Lesson
  minutes: number | null
  onTitle?: (title: string) => void
  onMove?: (dir: -1 | 1) => void
  onRemove?: () => void
}) {
  return (
    <div className="lesson-head">
      <span className="lesson-glyph" aria-hidden>
        {LESSON_GLYPH[lesson.type]}
      </span>
      {onTitle ? (
        <input className="lesson-title-input" aria-label={t('course.lessonTitle')} value={lesson.title} maxLength={120} onChange={(e) => onTitle(e.target.value)} />
      ) : (
        <span className="lesson-title">{lesson.title}</span>
      )}
      {minutes !== null && <span className="lesson-minutes">{t('course.minutes', { n: arDigits(minutes) })}</span>}
      {minutes !== null && minutes > LONG_LESSON_MINUTES && <span className="lesson-long">{t('course.longLesson')}</span>}
      {onMove && (
        <span className="lesson-actions no-print">
          <button type="button" className="btn ghost" aria-label={t('course.moveUp')} onClick={() => onMove(-1)}>↑</button>
          <button type="button" className="btn ghost" aria-label={t('course.moveDown')} onClick={() => onMove(1)}>↓</button>
          <button type="button" className="btn ghost" aria-label={t('course.removeLesson')} onClick={onRemove}>✕</button>
        </span>
      )}
    </div>
  )
}

/** مدة الدرس — درس الدليل ينتظر دليله، فلا رقم كاذب قبل وصوله */
function minutesOf(l: Lesson, guides: Record<string, GuideDto | null>): number | null {
  if (l.type !== 'guide') return lessonMinutes(l)
  const g = guides[l.guideId ?? '']
  return g ? lessonMinutes(l, g.steps) : null
}

/**
 * أدلة الدروس — تُجلب مرة لكل معرّف، والفشل يبقيها بلا مدة. `drafts`: ما لا يراه المتدرّب
 * (غير منشور أو موقوف) — المعدّ يُنبَّه في المحرر، والخادم يُسقطه من الدورة
 */
function useLessonGuides(lessons: Lesson[]): { guides: Record<string, GuideDto | null>; drafts: Set<string> } {
  const [docs, setDocs] = useState<Record<string, GuideDetailsDto | null>>({})
  const ids = lessons.flatMap((l) => (l.type === 'guide' && l.guideId ? [l.guideId] : []))
  const key = [...new Set(ids)].join(',')
  useEffect(() => {
    const ac = new AbortController()
    for (const id of key ? key.split(',') : []) {
      if (id in docs) continue
      client
        .getGuide(id, ac.signal)
        .then((d) => setDocs((g) => ({ ...g, [id]: d })))
        .catch(() => setDocs((g) => ({ ...g, [id]: null })))
    }
    return () => ac.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- يُجلب الجديد فقط
  }, [key])
  return useMemo(() => {
    const guides: Record<string, GuideDto | null> = {}
    const drafts = new Set<string>()
    for (const [id, d] of Object.entries(docs)) {
      guides[id] = d?.guide ?? null
      if (d && d.source !== 'official' && (d.suspension || (d.publishState ? !d.publishState.published : d.visibility === 'private'))) drafts.add(id)
    }
    return { guides, drafts }
  }, [docs])
}
