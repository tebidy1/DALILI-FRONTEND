// @vitest-environment jsdom
import { renderHook, waitFor, act } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DaliliApiError, type GuideDetailsDto } from '@dalili/shared'
import { clearReaderCache, useGuideReader } from './useGuideReader'

const details = (title = 'دليل'): GuideDetailsDto => ({
  guide: { id: 'g1', schemaVersion: 1, title, locale: 'ar', dir: 'rtl', createdAt: '', updatedAt: '', steps: [] },
  share: null,
})

afterEach(() => clearReaderCache())

describe('useGuideReader', () => {
  it('تحميل ثم جاهز', async () => {
    const load = vi.fn().mockResolvedValue(details())
    const { result } = renderHook(() => useGuideReader('g1', load))
    expect(result.current.state.status).toBe('loading')
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
  })

  it('404 → رسالة عربية، وretry يعيد الجلب', async () => {
    const load = vi.fn().mockRejectedValueOnce(new DaliliApiError(404, 'x')).mockResolvedValueOnce(details())
    const { result } = renderHook(() => useGuideReader('g1', load))
    await waitFor(() => expect(result.current.state).toMatchObject({ status: 'error', errorAr: 'الدليل غير موجود — ربما حُذف أو نُقل إلى السلة' }))
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('الكاش يُعرض فورًا، وفشل التحديث يُبقيه مع stale', async () => {
    const load = vi.fn().mockResolvedValueOnce(details('قديم'))
    const first = renderHook(() => useGuideReader('g1', load))
    await waitFor(() => expect(first.result.current.state.status).toBe('ready'))
    first.unmount()
    load.mockRejectedValueOnce(new DaliliApiError(0, 'تعذر الاتصال'))
    const { result } = renderHook(() => useGuideReader('g1', load))
    expect(result.current.state.details?.guide.title).toBe('قديم')
    await waitFor(() => expect(result.current.state).toMatchObject({ status: 'ready', stale: true }))
  })

  it('إلغاء الجلب عند الإغلاق — لا تحديث حالة بعد unmount', async () => {
    let signal: AbortSignal | undefined
    const load = vi.fn((_id: string, s: AbortSignal) => {
      signal = s
      return new Promise<GuideDetailsDto>(() => {})
    })
    const { unmount } = renderHook(() => useGuideReader('g1', load))
    unmount()
    expect(signal?.aborted).toBe(true)
  })

  it('setShare يحدّث المشاركة محليًا (بعد إنشائها) فلا يُعاد الإنشاء', async () => {
    const load = vi.fn().mockResolvedValue(details())
    const { result } = renderHook(() => useGuideReader('g1', load))
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    act(() => result.current.setShare({ token: 'tok', shareUrl: 'http://api/s/tok', views: 0 }))
    expect(result.current.state.details?.share?.token).toBe('tok')
  })
})
