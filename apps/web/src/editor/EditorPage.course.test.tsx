import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { CourseStateDto, GuideDetailsDto, LessonStepDto } from '@dalili/shared'
import { t } from '../i18n'
import { client } from '../api'
import { EditorPage } from './EditorPage'

vi.mock('../api', () => ({
  client: {
    getGuide: vi.fn(),
    courseState: vi.fn(),
    markCourseItem: vi.fn(),
    updateGuide: vi.fn().mockResolvedValue(undefined),
    updateGuideMeta: vi.fn().mockResolvedValue({}),
    guideComments: vi.fn().mockResolvedValue({ comments: [] }),
    me: vi.fn().mockResolvedValue({ id: 'u1', email: 'mgr@example.com' }),
    listGuides: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 200 }),
    createGuide: vi.fn(),
    markGuideRead: vi.fn().mockResolvedValue(undefined),
  },
  WEB_SHARE_BASE: '/s/',
  webShareUrl: (u: string) => u,
}))

const details: GuideDetailsDto = {
  guide: { id: 'g1', schemaVersion: 1, title: 'فاتورة مبدئية', locale: 'ar', dir: 'rtl', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', steps: [] },
  share: null,
  meta: { starred: false, folderId: null, tags: [] },
}
const course: CourseStateDto = {
  guideId: 'g1', title: 'فاتورة مبدئية', kind: 'guide', items: [{ id: 'g1', title: 'فاتورة مبدئية', done: false, type: 'guide', minutes: 1 }],
  itemsDone: 0, minutes: 2, nextItemId: 'g1', completedAt: null,
}

/** مراجعة د١ (Important 1): المدير ومدير القسم والمحرر يُسند إليهم أيضاً — ومن يحرّر الدليل كان لا يرى الشريط */
describe('د١: الدورة لمن يملك التحرير', () => {
  it('شريط الدورة يظهر في وضع العرض ويختفي في التعديل', async () => {
    vi.mocked(client.getGuide).mockResolvedValue(details)
    vi.mocked(client.courseState).mockResolvedValue(course)
    render(
      <MemoryRouter initialEntries={['/g/g1']}>
        <Routes>
          <Route path="/g/:id" element={<EditorPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText('أنهيتَ ٠ من ١')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: t('editor.edit') }))
    expect(screen.queryByText('أنهيتَ ٠ من ١')).toBeNull()
  })
})

const lessonStep = (id: string, lesson: LessonStepDto) => ({ id, kind: 'navigate' as const, title: '', target: {}, sensitive: false, url: '', pageTitle: '', ts: 0, block: 'lesson' as const, lesson })
const courseDoc = (access?: GuideDetailsDto['access']): GuideDetailsDto => ({
  ...details,
  guide: { ...details.guide, id: 'c1', kind: 'course', title: 'دورة المبيعات', steps: [lessonStep('l1', { type: 'page', title: 'مرجع' })] },
  ...(access ? { access } : {}),
})

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/g/:id" element={<EditorPage />} />
        <Route path="/c/:id" element={<p>مشغّل الدورة</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('د١ب: الدورة في المحرر', () => {
  it('reader of a course is sent to the player', async () => {
    vi.mocked(client.getGuide).mockResolvedValue(courseDoc({ owner: false, edit: false, publish: false, moderate: false }))
    renderAt('/g/c1')
    expect(await screen.findByText('مشغّل الدورة')).toBeTruthy()
  })

  it('editor of a course sees the lesson list and autosaves', async () => {
    vi.mocked(client.getGuide).mockResolvedValue(courseDoc())
    vi.mocked(client.updateGuide).mockClear()
    renderAt('/g/c1')
    expect(await screen.findByRole('link', { name: t('course.openAsTrainee') })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: t('editor.edit') }))
    fireEvent.change(screen.getByLabelText(t('course.lessonTitle')), { target: { value: 'مرجع الحدود' } })
    await waitFor(() => expect(client.updateGuide).toHaveBeenCalled(), { timeout: 2000 })
    const saved = vi.mocked(client.updateGuide).mock.calls.at(-1)![1]
    expect(saved.steps[0]!.lesson).toEqual({ type: 'page', title: 'مرجع الحدود' })
  })

  it('convert booklet creates a course and opens it', async () => {
    const booklet: GuideDetailsDto = {
      ...details,
      guide: { ...details.guide, id: 'b1', kind: 'booklet', title: 'كرّاسة الفواتير', steps: [{ ...lessonStep('h', { type: 'page', title: '' }), block: 'header', title: 'مقدمة', lesson: undefined }] },
    }
    vi.mocked(client.getGuide).mockResolvedValue(booklet)
    vi.mocked(client.createGuide).mockResolvedValue({ id: 'c2' })
    render(
      <MemoryRouter initialEntries={['/g/b1']}>
        <Routes>
          <Route path="/g/:id" element={<EditorPageOrNew />} />
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.click(await screen.findByRole('button', { name: t('editor.more.aria') }))
    fireEvent.click(screen.getByRole('menuitem', { name: t('booklet.toCourse') }))
    await waitFor(() => expect(client.createGuide).toHaveBeenCalled())
    const created = vi.mocked(client.createGuide).mock.calls[0]![0]
    expect(created.kind).toBe('course')
    expect(created.title).toBe('كرّاسة الفواتير')
    expect(created.steps.map((s) => s.block)).toEqual(['lesson', 'header'])
    expect(await screen.findByText('opened:c2')).toBeTruthy()
  })
})

/** يكشف التنقل بعد التحويل: صفحة الدورة الجديدة تُفتح على /g/c2 */
function EditorPageOrNew() {
  const loc = useLocation()
  return loc.pathname === '/g/c2' ? <p>opened:c2</p> : <EditorPage />
}
