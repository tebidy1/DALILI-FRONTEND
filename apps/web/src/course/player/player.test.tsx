import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { CourseItemDto, CourseStateDto, LessonDto, StepDto } from '@dalili/shared'
import { client } from '../../api'
import { t } from '../../i18n'
import { requestTrainStartGuide } from '../../lib/ext-bridge'
import { CourseHome } from './CourseHome'
import { LessonPlayer } from './LessonPlayer'

vi.mock('../../api', () => ({
  client: { courseState: vi.fn(), markCourseItem: vi.fn(), courseLesson: vi.fn() },
  WEB_SHARE_BASE: '/s/',
  webShareUrl: (u: string) => u,
}))
vi.mock('../../lib/ext-bridge', () => ({ requestTrainStartGuide: vi.fn().mockResolvedValue({ ok: true }) }))

const item = (id: string, type: CourseItemDto['type'], done = false): CourseItemDto => ({ id, title: `درس ${id}`, done, type, minutes: 2 })
const state = (items: CourseItemDto[], over: Partial<CourseStateDto> = {}): CourseStateDto => {
  const pending = items.filter((i) => !i.done)
  return {
    guideId: 'c1', title: 'دورة المبيعات', kind: 'course', items, itemsDone: items.length - pending.length, minutes: 6,
    nextItemId: pending[0]?.id ?? null, completedAt: pending.length ? null : '2026-10-31T10:00:00Z', ...over,
  }
}
const step = (over: Partial<StepDto>): StepDto => ({ id: 's1', kind: 'click', title: 'اضغط حفظ', target: {}, sensitive: false, url: '', pageTitle: '', ts: 1, ...over })
const guideLesson = (id: string): LessonDto => ({
  id,
  type: 'guide',
  title: `درس ${id}`,
  guide: { id: 'g1', schemaVersion: 2, title: 'فاتورة مبدئية', locale: 'ar', dir: 'rtl', createdAt: 'x', updatedAt: 'x', steps: [step({ title: 'افتح المبيعات' })] },
  trainHosts: { hosts: ['erp.test'], patterns: [] },
})

function fakeObserver() {
  const seen: Array<() => void> = []
  return { observe: (_el: Element, cb: () => void) => (seen.push(cb), () => {}), reach: () => act(() => seen.forEach((cb) => cb())) }
}

function mount(path: string, observe?: (el: Element, cb: () => void) => () => void) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/c/:id" element={<CourseHome />} />
        <Route path="/c/:id/:lessonId" element={<LessonPlayer observe={observe} />} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('CourseHome', () => {
  it('CourseHome shows lessons with ticks and one continue button', async () => {
    vi.mocked(client.courseState).mockResolvedValue(state([item('l1', 'video', true), item('l2', 'guide'), item('l3', 'page')]))
    mount('/c/c1')
    expect(await screen.findByRole('heading', { name: 'دورة المبيعات' })).toBeTruthy()
    expect(screen.getByText('أنهيتَ ١ من ٣')).toBeTruthy()
    expect(document.querySelectorAll('.course-lesson-row.done')).toHaveLength(1)
    const links = screen.getAllByRole('link', { name: t('course.continue', { title: 'درس l2' }) })
    expect(links).toHaveLength(1)
    expect(links[0]!.getAttribute('href')).toBe('/c/c1/l2')
    expect(screen.getByText(t('course.transparency'))).toBeTruthy()
  })
})

describe('CourseHome — حالات هادئة', () => {
  it('a course with no available lessons says so calmly', async () => {
    vi.mocked(client.courseState).mockResolvedValue(state([], { completedAt: null }))
    mount('/c/c1')
    expect(await screen.findByText(t('course.noLessons'))).toBeTruthy()
    expect(screen.queryByText(t('course.completed'))).toBeNull()
  })

  it('an unavailable course shows the access message, not an endless skeleton', async () => {
    vi.mocked(client.courseState).mockRejectedValue(new Error('404'))
    mount('/c/c1')
    expect(await screen.findByText(t('course.unavailable'))).toBeTruthy()
  })
})

describe('LessonPlayer', () => {
  it('next finishes the lesson then opens the next one', async () => {
    vi.mocked(client.courseState).mockResolvedValue(state([item('l1', 'video'), item('l2', 'guide')]))
    vi.mocked(client.markCourseItem).mockResolvedValue(state([item('l1', 'video', true), item('l2', 'guide')]))
    vi.mocked(client.courseLesson).mockImplementation(async (_c, l) =>
      l === 'l1' ? { id: 'l1', type: 'video', title: 'درس l1', videoUrl: 'https://youtu.be/dQw4w9WgXcQ' } : guideLesson('l2'),
    )
    mount('/c/c1/l1')
    expect(await screen.findByText(t('course.lessonOf', { n: '١', total: '٢' }))).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: t('course.nextLesson', { title: 'درس l2' }) }))
    await waitFor(() => expect(client.markCourseItem).toHaveBeenCalledWith('c1', 'l1'))
    expect(await screen.findByText('افتح المبيعات')).toBeTruthy()
    expect(screen.getByText(t('course.lessonOf', { n: '٢', total: '٢' }))).toBeTruthy()
  })

  it('last lesson shows finish course and the done card', async () => {
    vi.mocked(client.courseState).mockResolvedValue(state([item('l1', 'video', true), item('l2', 'page')]))
    vi.mocked(client.markCourseItem).mockResolvedValue(state([item('l1', 'video', true), item('l2', 'page', true)]))
    vi.mocked(client.courseLesson).mockResolvedValue({ id: 'l2', type: 'page', title: 'درس l2', blocks: [] })
    mount('/c/c1/l2')
    fireEvent.click(await screen.findByRole('button', { name: t('course.finishCourse') }))
    expect(await screen.findByText(t('course.doneTitle'))).toBeTruthy()
    expect(await screen.findByRole('heading', { name: 'دورة المبيعات' })).toBeTruthy()
  })

  it('a short last lesson that finishes on sight still celebrates on «finish course»', async () => {
    const done = state([item('l1', 'video', true), item('l2', 'page', true)])
    vi.mocked(client.courseState).mockResolvedValue(state([item('l1', 'video', true), item('l2', 'page')]))
    vi.mocked(client.markCourseItem).mockResolvedValue(done)
    vi.mocked(client.courseLesson).mockResolvedValue({ id: 'l2', type: 'page', title: 'درس l2', blocks: [] })
    const obs = fakeObserver()
    mount('/c/c1/l2', obs.observe)
    await screen.findByText(t('course.lessonOf', { n: '٢', total: '٢' }))
    obs.reach()
    await waitFor(() => expect(client.markCourseItem).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: t('course.finishCourse') }))
    expect(await screen.findByText(t('course.doneTitle'))).toBeTruthy()
  })

  it('next lesson is not finished by the previous lesson reaching its end', async () => {
    vi.mocked(client.courseState).mockResolvedValue(state([item('l1', 'page'), item('l2', 'guide')]))
    vi.mocked(client.markCourseItem).mockResolvedValue(state([item('l1', 'page', true), item('l2', 'guide')]))
    vi.mocked(client.courseLesson).mockImplementation(async (_c, l) => (l === 'l1' ? { id: 'l1', type: 'page', title: 'درس l1', blocks: [] } : guideLesson('l2')))
    const obs = fakeObserver()
    mount('/c/c1/l1', obs.observe)
    await screen.findByText(t('course.lessonOf', { n: '١', total: '٢' }))
    obs.reach()
    await waitFor(() => expect(client.markCourseItem).toHaveBeenCalledWith('c1', 'l1'))
    fireEvent.click(screen.getByRole('button', { name: t('course.nextLesson', { title: 'درس l2' }) }))
    await screen.findByText('افتح المبيعات')
    expect(vi.mocked(client.markCourseItem).mock.calls.filter((c) => c[1] === 'l2')).toHaveLength(0)
  })

  it('video lesson is not finished by scrolling, only by next', async () => {
    vi.mocked(client.courseState).mockResolvedValue(state([item('l1', 'video'), item('l2', 'page')]))
    vi.mocked(client.courseLesson).mockResolvedValue({ id: 'l1', type: 'video', title: 'درس l1', videoUrl: 'https://youtu.be/dQw4w9WgXcQ' })
    const obs = fakeObserver()
    mount('/c/c1/l1', obs.observe)
    await screen.findByText(t('course.lessonOf', { n: '١', total: '٢' }))
    obs.reach()
    await new Promise((r) => setTimeout(r, 30))
    expect(client.markCourseItem).not.toHaveBeenCalled()
  })

  it('failed video shows the open-link fallback and next still works', async () => {
    vi.mocked(client.courseState).mockResolvedValue(state([item('l1', 'video'), item('l2', 'page')]))
    vi.mocked(client.markCourseItem).mockResolvedValue(state([item('l1', 'video', true), item('l2', 'page')]))
    vi.mocked(client.courseLesson).mockResolvedValue({ id: 'l1', type: 'video', title: 'درس l1', videoUrl: 'https://vimeo.com/123' })
    mount('/c/c1/l1')
    const fallback = await screen.findByRole('link', { name: t('course.videoFailed') })
    expect(fallback.getAttribute('href')).toBe('https://vimeo.com/123')
    fireEvent.click(screen.getByRole('button', { name: t('course.nextLesson', { title: 'درس l2' }) }))
    await waitFor(() => expect(client.markCourseItem).toHaveBeenCalledWith('c1', 'l1'))
  })

  it('page lesson renders its blocks', async () => {
    vi.mocked(client.courseState).mockResolvedValue(state([item('l1', 'page')]))
    vi.mocked(client.courseLesson).mockResolvedValue({
      id: 'l1',
      type: 'page',
      title: 'درس l1',
      blocks: [step({ id: 'h', block: 'header', title: 'الحدود' }), step({ id: 't', block: 'text', title: '', rich: [{ para: 'p', runs: [{ text: 'فوق ٥٠٠٠ يلزم اعتماد' }] }] })],
    })
    mount('/c/c1/l1')
    expect(await screen.findByRole('heading', { name: 'الحدود' })).toBeTruthy()
    expect(screen.getByText('فوق ٥٠٠٠ يلزم اعتماد')).toBeTruthy()
    // الدرس صفحة قصيرة لا كرّاسة — بلا «فهرس الكرّاسة» جانبي يشتّت المتدرّب
    expect(document.querySelector('.booklet-outline')).toBeNull()
  })

  it('guide lesson renders the guide steps', async () => {
    vi.mocked(client.courseState).mockResolvedValue(state([item('l1', 'guide')]))
    vi.mocked(client.courseLesson).mockResolvedValue(guideLesson('l1'))
    mount('/c/c1/l1')
    expect(await screen.findByText('افتح المبيعات')).toBeTruthy()
  })

  it('guide lesson offers train me through the extension bridge', async () => {
    vi.mocked(client.courseState).mockResolvedValue(state([item('l1', 'guide')]))
    const lesson = guideLesson('l1')
    vi.mocked(client.courseLesson).mockResolvedValue(lesson)
    mount('/c/c1/l1')
    fireEvent.click(await screen.findByRole('button', { name: t('viewer.train') }))
    await waitFor(() => expect(requestTrainStartGuide).toHaveBeenCalledWith(lesson.guide, { trial: false, hosts: lesson.trainHosts }))
  })

  it('unavailable lesson says so calmly and the way back stays', async () => {
    vi.mocked(client.courseState).mockResolvedValue(state([item('l2', 'page')]))
    vi.mocked(client.courseLesson).mockResolvedValue({ id: 'l1', type: 'guide', title: 'قديم', unavailable: true })
    mount('/c/c1/l1')
    expect(await screen.findByText(t('course.lessonGone'))).toBeTruthy()
    expect(screen.getByRole('link', { name: t('course.allLessons') })).toBeTruthy()
  })
})
