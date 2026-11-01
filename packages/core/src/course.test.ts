import { describe, expect, it } from 'vitest'
import { bookletToCourseSteps, courseShapeError, lessonMinutes, lessonsOf } from './course'
import type { Step, StepLesson } from './guide'

const step = (over: Partial<Step>): Step => ({
  id: 's1', kind: 'navigate', title: '', target: {}, sensitive: false, url: '', pageTitle: '', ts: 0, ...over,
})
const lesson = (id: string, l: StepLesson): Step => step({ id, block: 'lesson', lesson: l })

describe('lessonsOf', () => {
  it('lessonsOf groups page blocks after their lesson', () => {
    const steps = [
      lesson('v', { type: 'video', title: 'ترحيب', video: { url: 'https://youtu.be/x' } }),
      lesson('p', { type: 'page', title: 'مرجع' }),
      step({ id: 't', block: 'text' }),
      step({ id: 'i', block: 'image' }),
      lesson('g', { type: 'guide', title: 'فاتورة', guideId: 'g1' }),
    ]
    const ls = lessonsOf(steps)
    expect(ls.map((l) => [l.id, l.type])).toEqual([['v', 'video'], ['p', 'page'], ['g', 'guide']])
    expect(ls[0]!.videoUrl).toBe('https://youtu.be/x')
    expect(ls[1]!.blocks.map((b) => b.id)).toEqual(['t', 'i'])
    expect(ls[2]!.guideId).toBe('g1')
  })
})

describe('courseShapeError', () => {
  it('courseShapeError rejects content before the first lesson', () => {
    expect(courseShapeError([step({ block: 'text' }), lesson('p', { type: 'page', title: 'x' })])).toBe('E-CRS-03')
  })
  it('courseShapeError rejects a block after a guide lesson', () => {
    expect(courseShapeError([lesson('g', { type: 'guide', title: 'x', guideId: 'g1' }), step({ block: 'text' })])).toBe('E-CRS-03')
  })
  it('courseShapeError rejects embed', () => {
    expect(courseShapeError([lesson('p', { type: 'page', title: 'x' }), step({ block: 'embed', embed: { guideId: 'g', expanded: true } })])).toBe('E-CRS-03')
  })
  it('courseShapeError rejects a captured step', () => {
    expect(courseShapeError([lesson('p', { type: 'page', title: 'x' }), step({ kind: 'click' })])).toBe('E-CRS-03')
  })
  it('courseShapeError accepts empty course and a valid one', () => {
    expect(courseShapeError([])).toBeNull()
    expect(courseShapeError([lesson('p', { type: 'page', title: 'x' }), step({ block: 'text' }), lesson('g', { type: 'guide', title: 'y', guideId: 'g1' })])).toBeNull()
  })
})

describe('bookletToCourseSteps', () => {
  it('bookletToCourseSteps turns embeds into guide lessons and runs into pages', () => {
    const out = bookletToCourseSteps(
      [
        step({ id: 'a', block: 'text' }),
        step({ id: 'b', block: 'embed', embed: { guideId: 'gA', expanded: false } }),
        step({ id: 'c', block: 'header', title: 'مرجع' }),
        step({ id: 'd', block: 'text' }),
      ],
      { gA: 'فاتورة' },
    )
    const ls = lessonsOf(out)
    expect(ls.map((l) => [l.type, l.title])).toEqual([['page', 'صفحة ١'], ['guide', 'فاتورة'], ['page', 'مرجع']])
    expect(ls[1]!.guideId).toBe('gA')
    expect(ls[2]!.blocks.map((b) => b.id)).toEqual(['c', 'd'])
    expect(courseShapeError(out)).toBeNull()
    expect(new Set(out.map((s) => s.id)).size).toBe(out.length)
  })
})

describe('lessonMinutes', () => {
  it('lessonMinutes follows the course time rules', () => {
    const [page] = lessonsOf([lesson('p', { type: 'page', title: 'x' }), step({ block: 'text' }), step({ block: 'text' })])
    expect(lessonMinutes(page!)).toBe(1)
    const [video] = lessonsOf([lesson('v', { type: 'video', title: 'x', video: { url: 'u' } })])
    expect(lessonMinutes(video!)).toBe(2)
    const [guide] = lessonsOf([lesson('g', { type: 'guide', title: 'x', guideId: 'g1' })])
    expect(lessonMinutes(guide!, [step({ kind: 'click' }), step({ kind: 'click' }), step({ kind: 'click' }), step({ kind: 'click' })])).toBe(3)
  })
})
