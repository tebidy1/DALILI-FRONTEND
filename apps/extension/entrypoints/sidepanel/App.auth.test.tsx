// @vitest-environment jsdom
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { App } from './App'
import { AUTH_PING_KEY, META_KEY, type SessionMeta } from '../../lib/protocol'

/**
 * تسجيل الدخول من الويب لا يعيد رسم اللوحة (علة 2026-09-15): كانت اللوحة تفحص
 * الجلسة مرة واحدة عند الفتح فقط، فبعد الدخول في تبويب الويب لا شيء يتغير فيها
 * إلا بإغلاقها وفتحها. المطلوب:
 * 1) ختم «auth-ping» في التخزين (يكتبه مرسل رسالة auth-changed من الويب) يعيد الفحص فورًا
 * 2) عودة التركيز/الظهور للوحة يعيد الفحص أيضًا — شبكة أمان لو فات الترحيل
 * 3) الانتقال من زائر إلى مسجّل يعرض عبارة نجاح ظاهرة، وأول فحص عند الفتح لا يعرض شيئًا
 */

const IDLE: SessionMeta = { state: 'idle', sessionId: '', startedAt: 0, stepCount: 0 }
const user = { id: 'u1', email: 'owner@dalili.sa' }

let mePayload: unknown
const listeners: Array<(c: Record<string, chrome.storage.StorageChange>, a: string) => void> = []

function stubChrome() {
  vi.stubGlobal('chrome', {
    storage: {
      onChanged: {
        addListener: (fn: typeof listeners[number]) => listeners.push(fn),
        removeListener: (fn: typeof listeners[number]) => {
          const i = listeners.indexOf(fn)
          if (i >= 0) listeners.splice(i, 1)
        },
      },
      local: {
        get: async (keys: string | string[] | null) => {
          if (keys === null) return {}
          const list = Array.isArray(keys) ? keys : [keys]
          return Object.fromEntries(list.filter((k) => k === META_KEY).map((k) => [k, IDLE]))
        },
        set: async () => {},
        remove: async () => {},
      },
    },
    runtime: { sendMessage: async () => undefined, getManifest: () => ({ version: '0.2.0' }) },
    commands: { getAll: async () => [] },
    tabs: {
      query: async () => [],
      onActivated: { addListener: () => {}, removeListener: () => {} },
      onUpdated: { addListener: () => {}, removeListener: () => {} },
    },
  })
}

function stubFetch() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/api/auth/me')) {
      if (mePayload === null) return new Response('unauthorized', { status: 401 })
      return new Response(JSON.stringify(mePayload), { status: 200 })
    }
    if (url.includes('/api/guides')) return new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 })
    return new Response('{}', { status: 404 })
  })
}

beforeEach(() => {
  listeners.length = 0
  mePayload = null
  stubChrome()
  vi.stubGlobal('fetch', stubFetch())
})

afterEach(() => {
  // التنظيف أولًا: تفكيك اللوحة يحتاج chrome حاضرًا (مستمعو storage يُزالون عند الإغلاق)
  cleanup()
  vi.unstubAllGlobals()
})

/** عدّ الساعات قُدُمًا لتجاوز خمادلة إعادة الفحص (throttle) بحتمية */
function skipThrottle() {
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_000)
}

describe('الجلسة الحية — الدخول من الويب يصل اللوحة بلا إغلاق', () => {
  it('ختم auth-ping في التخزين يعيد فحص الجلسة ويعرض عبارة النجاح', async () => {
    const f = fetch as unknown as ReturnType<typeof stubFetch>
    render(<App />)
    // زائر أول الأمر: زر الدخول حاضر
    expect(await screen.findByRole('button', { name: 'تسجيل الدخول' })).toBeTruthy()
    const meCallsAfterMount = f.mock.calls.filter((c) => String(c[0]).includes('/api/auth/me')).length
    expect(meCallsAfterMount).toBeGreaterThan(0)

    // الدخول تم في تبويب الويب الآن — الخلفية تختم المفتاح
    mePayload = user
    for (const fn of [...listeners]) fn({ [AUTH_PING_KEY]: { newValue: Date.now() } }, 'local')

    // عبارة النجاح تظهر، وزر الدخول يختفي
    expect(await screen.findByText(/تم تسجيل الدخول/)).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'تسجيل الدخول' })).toBeNull())
  })

  it('عودة التركيز إلى اللوحة تعيد فحص الجلسة أيضًا — شبكة أمان بلا ترحيل', async () => {
    render(<App />)
    expect(await screen.findByRole('button', { name: 'تسجيل الدخول' })).toBeTruthy()

    mePayload = user
    skipThrottle()
    fireEvent(window, new Event('focus'))

    expect(await screen.findByText(/تم تسجيل الدخول/)).toBeTruthy()
  })

  it('أول فحص عند فتح اللوحة لمن هو مسجّل أصلًا لا يعرض عبارة النجاح', async () => {
    mePayload = user
    render(<App />)
    await waitFor(() => {
      const calls = (fetch as unknown as ReturnType<typeof stubFetch>).mock.calls.filter((c) =>
        String(c[0]).includes('/api/auth/me'),
      )
      expect(calls.length).toBeGreaterThan(0)
    })
    expect(screen.queryByText(/تم تسجيل الدخول/)).toBeNull()
  })
})
