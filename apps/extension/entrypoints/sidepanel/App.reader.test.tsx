// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { META_KEY, type SessionMeta } from '../../lib/protocol'
import { READER_KEY } from '../../lib/reader'
import { clearReaderCache } from './reader/useGuideReader'

/**
 * PNL-01 تكاملًا: زر ↵ يفتح الدليل داخل اللوحة، «رجوع» يعيد القائمة بنفس البحث،
 * بدء الالتقاط يغلق القارئ، وفتح اللوحة يستعيد الدليل من storage.session.
 */

let meta: SessionMeta
let session: Record<string, unknown>
let storageListener: ((c: Record<string, chrome.storage.StorageChange>, area: string) => void) | null

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))

function stubAll() {
  meta = { state: 'idle', sessionId: '', startedAt: 0, stepCount: 0 }
  vi.stubGlobal('chrome', {
    storage: {
      onChanged: {
        addListener: (fn: typeof storageListener) => (storageListener = fn),
        removeListener: () => (storageListener = null),
      },
      local: {
        get: async (keys: string | string[] | null) => {
          const list = keys === null ? [] : Array.isArray(keys) ? keys : [keys]
          return list.includes(META_KEY) ? { [META_KEY]: meta } : {}
        },
        set: async () => {},
        remove: async () => {},
      },
      session: {
        get: async (k: string) => (k in session ? { [k]: session[k] } : {}),
        set: async (o: Record<string, unknown>) => Object.assign(session, o),
        remove: async (k: string) => void delete session[k],
      },
    },
    runtime: { sendMessage: vi.fn().mockResolvedValue({ ok: true }) },
    tabs: { query: async () => [], onActivated: { addListener: () => {}, removeListener: () => {} }, onUpdated: { addListener: () => {}, removeListener: () => {} } },
  })
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url.endsWith('/api/auth/me')) return json({ id: 'u1', email: 'a@b.c' })
      if (url.includes('/api/guides?')) return json({ items: [{ id: 'g1', title: 'إصدار فاتورة', updatedAt: '2026-09-01T00:00:00Z', stepCount: 1 }], total: 1, page: 1, limit: 8 })
      if (url.endsWith('/api/guides/g1'))
        return json({
          guide: { id: 'g1', schemaVersion: 1, title: 'إصدار فاتورة', locale: 'ar', dir: 'rtl', createdAt: '', updatedAt: '2026-09-01T00:00:00Z', steps: [] },
          share: null,
        })
      return json({ errorAr: 'غير متوقع' }, 404)
    }),
  )
}

beforeEach(() => {
  session = {}
  storageListener = null
  stubAll()
})
afterEach(() => {
  cleanup()
  clearReaderCache()
  vi.unstubAllGlobals()
})

describe('App — قارئ اللوحة (PNL-01)', () => {
  it('↵ يفتح القارئ ويحفظ المعرّف في الجلسة، و«رجوع» يعيد القائمة بنفس البحث والتركيز', async () => {
    render(<App />)
    const input = await screen.findByPlaceholderText('ابحث في أدلتك…')
    fireEvent.change(input, { target: { value: 'فاتورة' } })
    fireEvent.click(await screen.findByRole('button', { name: 'اعرض «إصدار فاتورة» هنا في اللوحة' }))
    expect(await screen.findByRole('heading', { name: 'إصدار فاتورة' })).toBeTruthy()
    expect(session[READER_KEY]).toBe('g1')

    fireEvent.click(screen.getByRole('button', { name: 'رجوع إلى القائمة' }))
    expect(((await screen.findByPlaceholderText('ابحث في أدلتك…')) as HTMLInputElement).value).toBe('فاتورة')
    expect(session[READER_KEY]).toBeUndefined()
    await waitFor(() => expect((document.activeElement as HTMLElement | null)?.dataset.guide).toBe('g1'))
  })

  it('فتح اللوحة يستعيد الدليل المفتوح من storage.session', async () => {
    session[READER_KEY] = 'g1'
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'إصدار فاتورة' })).toBeTruthy()
  })

  it('بدء الالتقاط يغلق القارئ', async () => {
    session[READER_KEY] = 'g1'
    render(<App />)
    await screen.findByRole('heading', { name: 'إصدار فاتورة' })
    meta = { state: 'capturing', sessionId: 's1', startedAt: Date.now(), stepCount: 0 }
    storageListener?.({ [META_KEY]: { newValue: meta } as chrome.storage.StorageChange }, 'local')
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'إصدار فاتورة' })).toBeNull())
    expect(session[READER_KEY]).toBeUndefined()
  })
})
