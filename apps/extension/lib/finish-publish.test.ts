import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFinish, type FinishDeps } from './finish-publish'
import type { SessionMeta } from './protocol'

/**
 * زر الجرس (2026-09-10): المسودة بعد إنهاء فاشل كانت لافتة عابرة فقط — الآن حدث
 * محفوظ في سجل الانتباه، سواء سقط النشر بالشبكة أو بغياب تسجيل الدخول.
 */

function world(meta: SessionMeta) {
  let cur = meta
  const pushEvent = vi.fn<(kind: string, textAr: string) => Promise<unknown>>().mockResolvedValue(undefined)
  const deps: FinishDeps = {
    meta: () => cur,
    saveMeta: async (p) => {
      cur = { ...cur, ...p }
    },
    stopActiveMemo: async () => {},
    abortMemos: async () => {},
    pushEvent,
  }
  return { finish: createFinish(deps), meta: () => cur, pushEvent }
}

const capturing: SessionMeta = { state: 'capturing', sessionId: 's1', startedAt: 0, stepCount: 3 }

beforeEach(() => {
  vi.stubGlobal('chrome', {
    storage: { local: { get: async () => ({}), set: async () => {}, remove: async () => {} } },
    tabs: { create: async () => ({}) },
  })
})

afterEach(() => vi.unstubAllGlobals())

describe('finish-publish — حدث المسودة في سجل الانتباه', () => {
  it('الخادم لا يُوصَل → مسودة + حدث draft يذكر أن الدليل محفوظ', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const w = world(capturing)
    await w.finish.finishCapture()
    expect(w.meta().state).toBe('draft')
    expect(w.pushEvent).toHaveBeenCalledTimes(1)
    const [kind, text] = w.pushEvent.mock.calls[0]!
    expect(kind).toBe('draft')
    expect(text).toContain('مسودة')
  })

  it('غير مسجّل الدخول (401) → مسودة + حدث draft يطلب الدخول', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })))
    const w = world(capturing)
    await w.finish.finishCapture()
    expect(w.meta().state).toBe('draft')
    expect(w.pushEvent).toHaveBeenCalledTimes(1)
    const [kind, text] = w.pushEvent.mock.calls[0]!
    expect(kind).toBe('draft')
    expect(text).toContain('الدخول')
  })

  it('جلسة بلا خطوات لا تُنشر ولا تُنتج حدثًا', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const w = world({ ...capturing, stepCount: 0 })
    await w.finish.finishCapture()
    expect(w.meta().state).toBe('paused')
    expect(w.pushEvent).not.toHaveBeenCalled()
  })
})
