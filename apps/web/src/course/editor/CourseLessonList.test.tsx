import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { GuideDetailsDto, StepDto } from '@dalili/shared'
import { client } from '../../api'
import { t } from '../../i18n'
import { CourseLessonList } from './CourseLessonList'

vi.mock('../../api', () => ({ client: { getGuide: vi.fn(), listGuides: vi.fn() } }))

const base = { kind: 'navigate' as const, title: '', target: {}, sensitive: false, url: '', pageTitle: '', ts: 0 }
const lesson = (id: string, type: 'guide' | 'video' | 'page', extra = {}): StepDto => ({ ...base, id, block: 'lesson', lesson: { type, title: `درس ${id}`, ...extra } })
const blk = (id: string, block: StepDto['block'] = 'text'): StepDto => ({ ...base, id, block, title: block === 'header' ? 'عنوان' : '' })

const guide = (id: string, title: string, n: number): GuideDetailsDto => ({
  guide: { id, schemaVersion: 2, title, locale: 'ar', dir: 'rtl', createdAt: 'x', updatedAt: 'x', steps: Array.from({ length: n }, (_, i) => ({ ...base, id: `s${i}`, kind: 'click' as const })) },
  share: null,
})

function renderList(steps: StepDto[], editing = true) {
  const onChange = vi.fn()
  render(
    <MemoryRouter>
      <CourseLessonList steps={steps} editing={editing} courseId="c1" onChange={onChange} onAttachShot={() => {}} />
    </MemoryRouter>,
  )
  return onChange
}

describe('CourseLessonList', () => {
  it('adds a guide lesson from the picker with the guide title', async () => {
    vi.mocked(client.listGuides).mockResolvedValue({
      items: [
        { id: 'g1', title: 'فاتورة مبدئية', kind: 'guide', stepCount: 3 },
        { id: 'b1', title: 'كرّاسة', kind: 'booklet', stepCount: 2 },
        { id: 'c9', title: 'دورة أخرى', kind: 'course', stepCount: 2 },
      ] as never,
      total: 3, page: 1, limit: 50,
    })
    const onChange = renderList([])
    fireEvent.click(screen.getByRole('button', { name: t('course.addLesson') }))
    fireEvent.click(screen.getByRole('button', { name: t('course.typeGuide') }))
    const pick = await screen.findByRole('dialog')
    expect(within(pick).queryByText('كرّاسة')).toBeNull()
    expect(within(pick).queryByText('دورة أخرى')).toBeNull()
    fireEvent.click(within(pick).getByText('فاتورة مبدئية'))
    const steps = onChange.mock.calls[0]![0] as StepDto[]
    expect(steps).toHaveLength(1)
    expect(steps[0]!.lesson).toEqual({ type: 'guide', title: 'فاتورة مبدئية', guideId: 'g1' })
  })

  it('adds a video lesson and previews it', () => {
    const onChange = renderList([])
    fireEvent.click(screen.getByRole('button', { name: t('course.addLesson') }))
    fireEvent.click(screen.getByRole('button', { name: t('course.typeVideo') }))
    fireEvent.change(screen.getByLabelText(t('block.videoUrl')), { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } })
    fireEvent.change(screen.getByLabelText(t('course.lessonTitle')), { target: { value: 'ترحيب' } })
    expect(document.querySelector('.video-card')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: t('course.addThis') }))
    expect((onChange.mock.calls[0]![0] as StepDto[])[0]!.lesson).toEqual({ type: 'video', title: 'ترحيب', video: { url: 'https://youtu.be/dQw4w9WgXcQ' } })
  })

  it('page lesson edits its blocks and the insert menu has no embed or capture', () => {
    const onChange = renderList([lesson('p', 'page'), blk('t1')])
    fireEvent.click(screen.getByRole('button', { name: t('editor.blockMenuOpen') }))
    expect(screen.queryByText(t('editor.addEmbed'))).toBeNull()
    expect(screen.queryByText(t('editor.addStepManual'))).toBeNull()
    fireEvent.click(screen.getByText(t('editor.addTip')))
    const steps = onChange.mock.calls[0]![0] as StepDto[]
    expect(steps.map((s) => s.block)).toEqual(['lesson', 'text', 'tip'])
  })

  it('moving a page lesson moves its blocks with it', () => {
    const onChange = renderList([lesson('v', 'video', { video: { url: 'u' } }), lesson('p', 'page'), blk('t1')])
    fireEvent.click(screen.getAllByRole('button', { name: t('course.moveUp') })[1]!)
    expect((onChange.mock.calls[0]![0] as StepDto[]).map((s) => s.id)).toEqual(['p', 't1', 'v'])
  })

  it('removing a lesson removes its blocks', () => {
    const onChange = renderList([lesson('p', 'page'), blk('t1'), lesson('v', 'video', { video: { url: 'u' } })])
    fireEvent.click(screen.getAllByRole('button', { name: t('course.removeLesson') })[0]!)
    expect((onChange.mock.calls[0]![0] as StepDto[]).map((s) => s.id)).toEqual(['v'])
  })

  it('empty course shows the suggested structure', () => {
    renderList([])
    expect(screen.getByText(t('course.emptyHint'))).toBeTruthy()
  })

  it('long lesson shows the soft hint', async () => {
    vi.mocked(client.getGuide).mockResolvedValue(guide('g1', 'طويل', 12))
    renderList([lesson('g', 'guide', { guideId: 'g1' })])
    expect(await screen.findByText(t('course.longLesson'))).toBeTruthy()
    expect(screen.getByText(t('course.minutes', { n: '٩' }))).toBeTruthy()
  })

  it('view mode lists lessons and opens the player', () => {
    renderList([lesson('p', 'page'), blk('t1')], false)
    expect(screen.queryByRole('button', { name: t('course.addLesson') })).toBeNull()
    expect(screen.getByRole('link', { name: t('course.openAsTrainee') }).getAttribute('href')).toBe('/c/c1')
  })

  it('warns the author when a lesson guide is not published', async () => {
    vi.mocked(client.getGuide).mockResolvedValue({ ...guide('g1', 'مسودة', 2), visibility: 'private', publishState: { published: false, hasUnpublishedChanges: false } })
    renderList([lesson('g', 'guide', { guideId: 'g1' })])
    expect(await screen.findByText(t('course.lessonDraft'))).toBeTruthy()
  })

  it('a page block can be removed', () => {
    const onChange = renderList([lesson('p', 'page'), blk('t1'), blk('t2')])
    fireEvent.click(screen.getAllByRole('button', { name: t('course.removeBlock') })[0]!)
    expect((onChange.mock.calls[0]![0] as StepDto[]).map((s) => s.id)).toEqual(['p', 't2'])
  })
})
