import { describe, expect, it } from 'vitest'
import type { StepDto } from '@dalili/shared'
import { moveLesson, patchLesson, removeLesson, lessonEnd } from './lesson-ops'

const base = { kind: 'navigate' as const, title: '', target: {}, sensitive: false, url: '', pageTitle: '', ts: 0 }
const lesson = (id: string, type: 'guide' | 'video' | 'page', extra = {}): StepDto => ({ ...base, id, block: 'lesson', lesson: { type, title: id, ...extra } })
const blk = (id: string): StepDto => ({ ...base, id, block: 'text' })
const ids = (s: StepDto[]) => s.map((x) => x.id)

const steps = [lesson('v', 'video', { video: { url: 'u' } }), lesson('p', 'page'), blk('t1'), blk('t2'), lesson('g', 'guide', { guideId: 'g1' })]

describe('lesson-ops', () => {
  it('moving a page lesson moves its blocks with it', () => {
    expect(ids(moveLesson(steps, 'p', -1))).toEqual(['p', 't1', 't2', 'v', 'g'])
    expect(ids(moveLesson(steps, 'p', 1))).toEqual(['v', 'g', 'p', 't1', 't2'])
    expect(ids(moveLesson(steps, 'v', -1))).toEqual(ids(steps))
  })
  it('removing a lesson removes its blocks', () => {
    expect(ids(removeLesson(steps, 'p'))).toEqual(['v', 'g'])
  })
  it('patchLesson changes only that lesson', () => {
    const out = patchLesson(steps, 'g', { title: 'الإجراء' })
    expect(out[4]!.lesson).toEqual({ type: 'guide', title: 'الإجراء', guideId: 'g1' })
    expect(out[0]).toBe(steps[0])
  })
  it('lessonEnd is the index after the last block of the lesson', () => {
    expect(lessonEnd(steps, 'p')).toBe(4)
    expect(lessonEnd(steps, 'g')).toBe(5)
  })
})
