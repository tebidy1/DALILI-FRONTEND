import type { LessonStepDto, StepDto } from '@dalili/shared'

/**
 * د١ب: عمليات نقية على دروس الدورة — الدرس خطوة block='lesson' وكتل صفحته تليه حتى الدرس التالي،
 * فالنقل والحذف يحملان الدرس وكتله معاً.
 */

/** [بداية، نهاية) كل درس في steps */
function ranges(steps: StepDto[]): { id: string; start: number; end: number }[] {
  const out: { id: string; start: number; end: number }[] = []
  steps.forEach((s, i) => {
    if (s.block !== 'lesson') return
    const last = out.at(-1)
    if (last) last.end = i
    out.push({ id: s.id, start: i, end: steps.length })
  })
  return out
}

/** موضع الإدراج بعد آخر كتلة في الدرس */
export function lessonEnd(steps: StepDto[], lessonId: string): number {
  return ranges(steps).find((r) => r.id === lessonId)?.end ?? steps.length
}

export function moveLesson(steps: StepDto[], lessonId: string, dir: -1 | 1): StepDto[] {
  const rs = ranges(steps)
  const i = rs.findIndex((r) => r.id === lessonId)
  const j = i + dir
  if (i < 0 || j < 0 || j >= rs.length) return steps
  const chunks = rs.map((r) => steps.slice(r.start, r.end))
  ;[chunks[i], chunks[j]] = [chunks[j]!, chunks[i]!]
  return [...steps.slice(0, rs[0]!.start), ...chunks.flat()]
}

export function removeLesson(steps: StepDto[], lessonId: string): StepDto[] {
  const r = ranges(steps).find((x) => x.id === lessonId)
  return r ? [...steps.slice(0, r.start), ...steps.slice(r.end)] : steps
}

export function patchLesson(steps: StepDto[], lessonId: string, patch: Partial<LessonStepDto>): StepDto[] {
  return steps.map((s) => (s.id === lessonId && s.lesson ? { ...s, lesson: { ...s.lesson, ...patch } } : s))
}
