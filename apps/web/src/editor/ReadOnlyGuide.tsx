import { Fragment, useEffect, useState } from 'react'
import { DEFAULT_MARK_COLOR, embedIdsOf, stepNumbers } from '@dalili/core'
import type { GuideDto } from '@dalili/shared'
import { client } from '../api'
import { StepCard } from '../components/StepCard'
import { Skeleton } from '../ui/Skeleton'
import { ViewerBooklet } from '../viewer/ViewerBooklet'
import { courseItemHref } from '../course/CourseBar'
import { CourseTrack } from '../course/CourseTrack'
import type { ObserveEnd } from '../course/useReachedEnd'

const NOOP = () => {}

/**
 * جسم الدليل للقراءة فقط — العنوان والوصف والخطوات بلا أي أداة تحرير.
 * يستعمله عرض النسخة القديمة (VER-01) والقارئ الذي لا يملك التحرير (ب).
 * لا حالة قابلة للتعديل هنا، فلا حفظ ممكن أصلاً.
 *
 * د١: الكرّاسة تُقرأ بكتلها كما صمّمها معدّها. وحين يكون الدليل دورة مُسندة (أو عنصراً فيها
 * بـ`?course=`) يظهر شريط الدورة، والوصول إلى آخره يُنهي العنصر، والإكمال يحتفل بهدوء.
 */
export function ReadOnlyGuide(p: { guide: GuideDto; courseId?: string | null; observe?: ObserveEnd }) {
  const { guide } = p
  return (
    <CourseTrack guideId={guide.id} courseId={p.courseId ?? null} observe={p.observe}>
      {(course) => (
    <>
      <header className="guide-head">
        <div className="guide-head-read">
          <h1 className="guide-title-read" dir="rtl">
            <bdi>{guide.title}</bdi>
          </h1>
          {guide.description && (
            <p className="guide-desc-read" dir="auto">
              <bdi>{guide.description}</bdi>
            </p>
          )}
        </div>
      </header>
      {guide.kind === 'booklet' ? <ReaderBooklet guide={guide} courseId={course ? course.guideId : null} /> : <GuideSteps guide={guide} />}
    </>
      )}
    </CourseTrack>
  )
}

/**
 * الكرّاسة للقارئ — مضمّناتها تُجلب باسمها، وفي الدورة يفتح المضمّن داخلها. تُعرض بعد أن تستقر
 * كلها: «غير متاح» أثناء التحميل يخيف المتدرّب من شيء سيظهر بعد لحظة
 */
function ReaderBooklet({ guide, courseId }: { guide: GuideDto; courseId: string | null }) {
  const [embeds, setEmbeds] = useState<Record<string, GuideDto> | null>(null)
  useEffect(() => {
    const ac = new AbortController()
    const ids = embedIdsOf(guide.steps)
    void Promise.allSettled(ids.map((id) => client.getGuide(id, ac.signal))).then((res) => {
      if (ac.signal.aborted) return
      const found: Record<string, GuideDto> = {}
      res.forEach((r, i) => {
        if (r.status === 'fulfilled') found[ids[i]!] = r.value.guide
      })
      setEmbeds(found)
    })
    return () => ac.abort()
  }, [guide.steps])
  if (!embeds) return <Skeleton />
  return <ViewerBooklet guide={guide} embeds={embeds} embedHref={courseId ? (id) => courseItemHref({ guideId: courseId, kind: 'booklet' }, id) : (id) => `/g/${id}`} />
}

/** خطوات الدليل للقراءة — يستعملها القارئ ودرس الدليل في مشغّل الدورة (د١ب) */
export function GuideSteps({ guide }: { guide: GuideDto }) {
  const nums = stepNumbers(guide.steps)
  return (
    <>
      {guide.steps.map((s, i) => (
        <Fragment key={s.id}>
          <div id={`step-${s.id}`} className="step-block">
            <StepCard
              index={i}
              step={s}
              displayNo={nums[i] ?? null}
              canUp={false}
              canDown={false}
              editing={false}
              tool={'select'}
              markColor={DEFAULT_MARK_COLOR}
              onChange={NOOP}
              onMove={NOOP}
              onRemove={NOOP}
              onDuplicate={NOOP}
              onMoveMark={NOOP}
              onAttachShot={NOOP}
              picked={false}
              onPick={NOOP}
              dragging={false}
              onDragStart={NOOP}
              onDragOver={NOOP}
              onDrop={NOOP}
              onDragEnd={NOOP}
            />
          </div>
        </Fragment>
      ))}
    </>
  )
}
