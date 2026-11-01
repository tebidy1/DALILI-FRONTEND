// @vitest-environment jsdom
import { renderHook, waitFor, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GuideSummaryDto, MeDto, WorkspaceDto } from '@dalili/shared'
import { useLibrary, type LibraryApi } from './useLibrary'

const me = { id: 'u1', email: 'emp@co.test' } as MeDto
const accounts = (active: string, status: WorkspaceDto['status'] = 'active'): WorkspaceDto[] => [
  { id: 'co', name: 'شركة الأفق', role: 'viewer', kind: 'company', status: active === 'co' ? status : 'active', active: active === 'co' },
  { id: 'me', name: 'مساحتي', role: 'admin', kind: 'personal', status: 'active', active: active === 'me' },
]

function api(over: Partial<LibraryApi> = {}): LibraryApi {
  let current = 'co'
  return {
    listMyWorkspaces: vi.fn(async () => accounts(current)),
    switchWorkspace: vi.fn(async (id: string) => {
      current = id
      return { workspaceId: id }
    }),
    discover: vi.fn(async () => ({ count: 1, onScreen: [], onSite: [{ id: `g-${current}`, title: 'د', updatedAt: '', views: 0 }] })),
    listGuides: vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 8 })),
    ...over,
  } as LibraryApi
}

beforeEach(() => {
  vi.stubGlobal('chrome', {
    tabs: {
      query: async () => [{ url: 'https://erp.example/a', active: true }],
      onActivated: { addListener: () => {}, removeListener: () => {} },
      onUpdated: { addListener: () => {}, removeListener: () => {} },
    },
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('useLibrary — ت (§٣.٥)', () => {
  it('switch reloads discover in the new account', async () => {
    const a = api()
    const { result } = renderHook(() => useLibrary(me, a))
    await waitFor(() => expect(result.current.discover).toMatchObject({ status: 'ready', data: { onSite: [{ id: 'g-co' }] } }))
    await act(() => result.current.switchTo('me'))
    expect(a.switchWorkspace).toHaveBeenCalledWith('me')
    await waitFor(() => expect(result.current.discover).toMatchObject({ status: 'ready', data: { onSite: [{ id: 'g-me' }] } }))
    expect(result.current.accounts.find((x) => x.active)?.id).toBe('me')
  })

  it('خطأ الشبكة حالة معلنة، و«أعد المحاولة» يعيد الطلب', async () => {
    const discover = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ count: 0, onScreen: [], onSite: [] })
    const a = api({ discover })
    const { result } = renderHook(() => useLibrary(me, a))
    await waitFor(() => expect(result.current.discover.status).toBe('error'))
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.discover).toMatchObject({ status: 'ready', data: { count: 0 } }))
  })

  it('الحساب النشط موقوف: لا طلبات قائمة، والحجب معلن', async () => {
    const a = api({ listMyWorkspaces: vi.fn(async () => accounts('co', 'suspended')) })
    const { result } = renderHook(() => useLibrary(me, a))
    await waitFor(() => expect(result.current.blocked).toBe('suspended'))
    expect(a.discover).not.toHaveBeenCalled()
    expect(a.listGuides).not.toHaveBeenCalled()
  })

  it('الأخيرة تحمل علامات الصف كما يرسلها الخادم (★ و«جديد» و👁)', async () => {
    const item = { id: 'g1', title: 'د', updatedAt: '', stepCount: 2, pinned: true, fresh: 'new', readerCount: 3, creatorName: 'سارة' } as unknown as GuideSummaryDto
    const a = api({ listGuides: vi.fn(async () => ({ items: [item], total: 1, page: 1, limit: 8 })) })
    const { result } = renderHook(() => useLibrary(me, a))
    await waitFor(() => expect(result.current.recent[0]).toMatchObject({ pinned: true, fresh: 'new', readerCount: 3, creatorName: 'سارة' }))
  })

  it('searchAll يجلب المكتبة كاملة (حتى ١٠٠) للبحث المحلي', async () => {
    const a = api()
    const { result } = renderHook(() => useLibrary(me, a))
    await waitFor(() => expect(result.current.accounts.length).toBe(2))
    await act(async () => {
      await result.current.searchAll()
    })
    expect(a.listGuides).toHaveBeenCalledWith({ limit: 100, sort: 'updated', order: 'desc' }, undefined)
  })

  it('بلا دخول: لا شيء يُطلب', () => {
    const a = api()
    const { result } = renderHook(() => useLibrary(null, a))
    expect(result.current.discover.status).toBe('off')
    expect(a.listMyWorkspaces).not.toHaveBeenCalled()
  })
})
