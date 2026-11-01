import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { CourseStateDto } from '@dalili/shared'
import { DaliliApiError } from '@dalili/shared'
import { useCourse } from './useCourse'
import { client } from '../api'

vi.mock('../api', () => ({ client: { courseState: vi.fn(), markCourseItem: vi.fn() } }))

const state = (over: Partial<CourseStateDto> = {}): CourseStateDto => ({
  guideId: 'bk', title: 'فواتير المبيعات', kind: 'booklet',
  items: [{ id: 'gA', title: 'أ', done: false, type: 'guide', minutes: 1 }, { id: 'gB', title: 'ب', done: false, type: 'guide', minutes: 1 }],
  itemsDone: 0, minutes: 4, nextItemId: 'gA', completedAt: null, ...over,
})

afterEach(() => vi.clearAllMocks())

describe('د١: useCourse', () => {
  it('404 يعطي state=null بلا خطأ — ليس كل قارئ متدرّباً', async () => {
    vi.mocked(client.courseState).mockRejectedValue(new DaliliApiError(404, 'غير مُسندة', 'E-CRS-01'))
    const { result } = renderHook(() => useCourse('bk'))
    await waitFor(() => expect(client.courseState).toHaveBeenCalled())
    expect(result.current.state).toBeNull()
  })

  it('بلا دورة لا يطلب شيئاً', () => {
    renderHook(() => useCourse(null))
    expect(client.courseState).not.toHaveBeenCalled()
  })

  it('finish يسجّل العنصر ويحدّث الحالة', async () => {
    vi.mocked(client.courseState).mockResolvedValue(state())
    vi.mocked(client.markCourseItem).mockResolvedValue(state({ itemsDone: 1, nextItemId: 'gB' }))
    const { result } = renderHook(() => useCourse('bk'))
    await waitFor(() => expect(result.current.state).not.toBeNull())
    await act(() => result.current.finish('gA'))
    expect(client.markCourseItem).toHaveBeenCalledWith('bk', 'gA')
    expect(result.current.state?.itemsDone).toBe(1)
    expect(result.current.justCompleted).toBe(false)
  })

  it('justCompleted عند الانتقال للإكمال فقط', async () => {
    vi.mocked(client.courseState).mockResolvedValue(state({ itemsDone: 1, nextItemId: 'gB' }))
    vi.mocked(client.markCourseItem).mockResolvedValue(state({ itemsDone: 2, nextItemId: null, completedAt: '2026-10-31T10:00:00Z' }))
    const { result } = renderHook(() => useCourse('bk'))
    await waitFor(() => expect(result.current.state).not.toBeNull())
    await act(() => result.current.finish('gB'))
    expect(result.current.justCompleted).toBe(true)
  })

  it('دورة مكتملة أصلاً لا تحتفل مرة ثانية عند التحميل', async () => {
    vi.mocked(client.courseState).mockResolvedValue(state({ itemsDone: 2, nextItemId: null, completedAt: '2026-10-30T10:00:00Z' }))
    const { result } = renderHook(() => useCourse('bk'))
    await waitFor(() => expect(result.current.state).not.toBeNull())
    expect(result.current.justCompleted).toBe(false)
  })
})
