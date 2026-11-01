/** د١ب: قرارات الدورة النقية — تجميع الدروس، وحراسة الشكل، والوقت، وتحويل الكرّاسة. بلا DOM ولا I/O. */
import { cryptoId } from './assemble'
import type { BlockKind, Step, StepLesson } from './guide'

/** درس مجمّع: خطوة الدرس ومعها كتل الصفحة التي تليها */
export interface Lesson {
  id: string
  type: StepLesson['type']
  title: string
  guideId?: string
  videoUrl?: string
  note?: string
  blocks: Step[]
}

/** ما يُقبل داخل درس الصفحة — لا تضمين (الأدلة دروس مستقلة) ولا التقاط */
export const PAGE_BLOCKS: readonly BlockKind[] = ['text', 'header', 'tip', 'alert', 'image', 'link', 'video', 'divider']

/** رمز الخطأ المشترك مع الخادم (CourseShape::error) */
export type CourseShapeCode = 'E-CRS-03'

const STEP_SECONDS = 45
const VIDEO_SECONDS = 120
const PAGE_BLOCK_SECONDS = 20

/** كل خطوة lesson تبدأ درساً، وما يليها حتى الدرس التالي كتله */
export function lessonsOf(steps: Step[]): Lesson[] {
  const out: Lesson[] = []
  for (const s of steps) {
    if (s.block === 'lesson' && s.lesson) {
      const l = s.lesson
      out.push({ id: s.id, type: l.type, title: l.title, guideId: l.guideId, videoUrl: l.video?.url, note: l.note, blocks: [] })
    } else {
      out.at(-1)?.blocks.push(s)
    }
  }
  return out
}

/** شكل الدورة: أول خطوة درس، والكتل لا تأتي إلا بعد درس صفحة ومن كتل الصفحة وحدها */
export function courseShapeError(steps: Step[]): CourseShapeCode | null {
  let current: StepLesson['type'] | null = null
  for (const s of steps) {
    if (s.block === 'lesson') {
      if (!s.lesson) return 'E-CRS-03'
      current = s.lesson.type
      continue
    }
    if (current !== 'page' || !s.block || !PAGE_BLOCKS.includes(s.block)) return 'E-CRS-03'
  }
  return null
}

/** «نحو N دقيقة» للدرس — الدليل من خطواته، والفيديو دقيقتان، والصفحة من كتلها */
export function lessonMinutes(lesson: Lesson, guideSteps: Pick<Step, 'block'>[] = []): number {
  let seconds = 0
  if (lesson.type === 'video') seconds = VIDEO_SECONDS
  else if (lesson.type === 'page') seconds = lesson.blocks.length * PAGE_BLOCK_SECONDS
  else for (const s of guideSteps) seconds += s.block === 'video' ? VIDEO_SECONDS : s.block ? 0 : STEP_SECONDS
  return Math.max(1, Math.ceil(seconds / 60))
}

/** خطوة درس جديدة صالحة للعقد */
export function newLessonStep(lesson: StepLesson): Step {
  return { id: cryptoId(), kind: 'navigate', title: '', target: {}, sensitive: false, url: '', pageTitle: '', ts: Date.now(), block: 'lesson', lesson }
}

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩'
const ar = (n: number) => String(n).replace(/\d/g, (d) => AR_DIGITS[Number(d)]!)

/**
 * «حوّل إلى دورة»: كل دليل مضمّن درس دليل، وكل مجموعة كتل متتالية درس صفحة عنوانه أول عنوان فيها.
 * الخطوات الملتقطة لا تُقبل في الصفحة فتسقط — الكرّاسة الأصلية تبقى كما هي.
 */
export function bookletToCourseSteps(steps: Step[], titles: Record<string, string>): Step[] {
  const out: Step[] = []
  let run: Step[] = []
  let pages = 0
  const flush = () => {
    if (!run.length) return
    pages++
    const head = run.find((s) => s.block === 'header' && s.title.trim())
    out.push(newLessonStep({ type: 'page', title: head ? head.title.trim() : `صفحة ${ar(pages)}` }), ...run)
    run = []
  }
  for (const s of steps) {
    if (s.block === 'embed' && s.embed) {
      flush()
      out.push(newLessonStep({ type: 'guide', title: titles[s.embed.guideId] ?? s.title, guideId: s.embed.guideId }))
    } else if (s.block && PAGE_BLOCKS.includes(s.block)) {
      run.push(s)
    }
  }
  flush()
  return out
}
