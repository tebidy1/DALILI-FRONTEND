import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { CourseStateDto, GuideDto, StepDto } from '@dalili/shared'
import { DaliliApiError } from '@dalili/shared'
import { client } from '../api'
import { ReadOnlyGuide } from './ReadOnlyGuide'

vi.mock('../api', () => ({
  client: { courseState: vi.fn(), markCourseItem: vi.fn(), getGuide: vi.fn() },
  WEB_SHARE_BASE: '/s/',
  webShareUrl: (u: string) => u,
}))

const step = (over: Partial<StepDto>): StepDto => ({ id: 's1', kind: 'click', title: 'اضغط حفظ', target: {}, sensitive: false, url: '', pageTitle: '', ts: 1, ...over })
const guide = (over: Partial<GuideDto> = {}): GuideDto => ({
  id: 'g1', schemaVersion: 1, title: 'فاتورة مبدئية', locale: 'ar', dir: 'rtl', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  steps: [step({})], ...over,
})
const course = (over: Partial<CourseStateDto> = {}): CourseStateDto => ({
  guideId: 'g1', title: 'فاتورة مبدئية', kind: 'guide', items: [{ id: 'g1', title: 'فاتورة مبدئية', done: false, type: 'guide', minutes: 1 }],
  itemsDone: 0, minutes: 1, nextItemId: 'g1', completedAt: null, ...over,
})

/** مراقب محقون: يحفظ النداء فيستدعيه الاختبار كأن آخر الدليل ظهر */
function fakeObserver() {
  const seen: Array<() => void> = []
  return { observe: (_el: Element, cb: () => void) => (seen.push(cb), () => {}), reach: () => act(() => seen.forEach((cb) => cb())) }
}

const mount = (g: GuideDto, courseId: string | null, observe?: (el: Element, cb: () => void) => () => void) =>
  render(
    <MemoryRouter>
      <ReadOnlyGuide guide={g} courseId={courseId} observe={observe} />
    </MemoryRouter>,
  )

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('د١: ReadOnlyGuide للمتدرّب', () => {
  it('الكرّاسة تُعرض كتلاً لا بطاقات خطوات', async () => {
    vi.mocked(client.courseState).mockRejectedValue(new DaliliApiError(404, 'x', 'E-CRS-01'))
    const bk = guide({ id: 'bk', kind: 'booklet', title: 'كرّاسة', steps: [step({ id: 'h', block: 'header', title: 'مقدمة' }), step({ id: 't', block: 'text', title: '', rich: [{ para: 'p', runs: [{ text: 'أهلاً بك' }] }] })] })
    mount(bk, 'bk')
    expect(await screen.findByRole('heading', { name: 'مقدمة' })).toBeTruthy()
    expect(screen.getByText('أهلاً بك')).toBeTruthy()
    expect(document.querySelector('.step-block')).toBeNull()
  })

  it('الوصول إلى آخر الدليل يُنهي العنصر في الدورة', async () => {
    vi.mocked(client.courseState).mockResolvedValue(course())
    vi.mocked(client.markCourseItem).mockResolvedValue(course({ items: [{ id: 'g1', title: 'فاتورة مبدئية', done: true, type: 'guide', minutes: 1 }], itemsDone: 1, nextItemId: null, completedAt: '2026-10-31T10:00:00Z' }))
    const obs = fakeObserver()
    mount(guide(), 'g1', obs.observe)
    await screen.findByText('أنهيتَ ٠ من ١')
    obs.reach()
    await waitFor(() => expect(client.markCourseItem).toHaveBeenCalledWith('g1', 'g1'))
    expect(await screen.findByText('أكملتَ الدورة 🎉 أحسنت')).toBeTruthy()
  })

  it('الوصول قبل وصول حالة الدورة لا يضيع', async () => {
    let resolve: (s: CourseStateDto) => void = () => {}
    vi.mocked(client.courseState).mockReturnValue(new Promise((r) => (resolve = r)))
    vi.mocked(client.markCourseItem).mockResolvedValue(course({ itemsDone: 1 }))
    const obs = fakeObserver()
    mount(guide(), 'g1', obs.observe)
    obs.reach()
    await act(async () => resolve(course()))
    await waitFor(() => expect(client.markCourseItem).toHaveBeenCalledWith('g1', 'g1'))
  })

  it('قارئ بلا دورة: لا شريط ولا تسجيل', async () => {
    vi.mocked(client.courseState).mockRejectedValue(new DaliliApiError(404, 'x', 'E-CRS-01'))
    const obs = fakeObserver()
    mount(guide(), 'g1', obs.observe)
    await waitFor(() => expect(client.courseState).toHaveBeenCalled())
    obs.reach()
    expect(screen.queryByText(/أنهيتَ/)).toBeNull()
    expect(client.markCourseItem).not.toHaveBeenCalled()
  })

  it('الانتقال إلى الدليل التالي لا يُنهيه قبل الوصول إلى آخره', async () => {
    const two = course({ guideId: 'bk', kind: 'booklet', items: [{ id: 'g1', title: 'أ', done: false, type: 'guide', minutes: 1 }, { id: 'g2', title: 'ب', done: false, type: 'guide', minutes: 1 }] })
    vi.mocked(client.courseState).mockResolvedValue(two)
    vi.mocked(client.markCourseItem).mockResolvedValue(course({ guideId: 'bk', kind: 'booklet', items: [{ id: 'g1', title: 'أ', done: true, type: 'guide', minutes: 1 }, { id: 'g2', title: 'ب', done: false, type: 'guide', minutes: 1 }], itemsDone: 1, nextItemId: 'g2' }))
    const obs = fakeObserver()
    const view = mount(guide(), 'bk', obs.observe)
    await screen.findByText('أنهيتَ ٠ من ٢')
    obs.reach()
    await waitFor(() => expect(client.markCourseItem).toHaveBeenCalledWith('bk', 'g1'))
    view.rerender(
      <MemoryRouter>
        <ReadOnlyGuide guide={guide({ id: 'g2', title: 'ب' })} courseId="bk" observe={obs.observe} />
      </MemoryRouter>,
    )
    await screen.findByText('ب', { selector: 'bdi' })
    expect(client.markCourseItem).not.toHaveBeenCalledWith('bk', 'g2')
  })

  it('مضمّنات الكرّاسة لا تظهر «غير متاح» أثناء تحميلها', async () => {
    vi.mocked(client.courseState).mockRejectedValue(new DaliliApiError(404, 'x', 'E-CRS-01'))
    let resolve: (v: { guide: GuideDto }) => void = () => {}
    vi.mocked(client.getGuide).mockReturnValue(new Promise((r) => (resolve = r)) as never)
    const bk = guide({ id: 'bk', kind: 'booklet', title: 'كرّاسة', steps: [step({ id: 'e', block: 'embed', title: '', embed: { guideId: 'gA', expanded: false } })] })
    mount(bk, 'bk')
    await waitFor(() => expect(client.getGuide).toHaveBeenCalled())
    expect(screen.queryByText(/غير متاح/)).toBeNull()
    await act(async () => resolve({ guide: guide({ id: 'gA', title: 'فاتورة' }) }))
    expect(await screen.findByText('فاتورة')).toBeTruthy()
  })

  it('بلا courseId (عرض نسخة قديمة) لا يسأل عن دورة', () => {
    mount(guide(), null)
    expect(client.courseState).not.toHaveBeenCalled()
  })
})
