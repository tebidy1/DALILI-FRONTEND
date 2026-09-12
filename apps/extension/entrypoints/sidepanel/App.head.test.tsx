// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { App } from './App'
import { META_KEY, type SessionMeta } from '../../lib/protocol'
import { EVENTS_KEY, type ActivityEvent } from '../../lib/activity'
import { SETTINGS_KEY } from '../../lib/settings-store'

/**
 * زرّا الترويسة (2026-09-10): الإعدادات والتنبيهات في أعلى اللوحة —
 * زران هادئان بجوار رمز الحالة، لا شيء جديد على جدار شاشة البدء.
 * الجرس يحمل نقطة «جديد» ما دام في السجل حدث غير مقروء، وفتحه يقرأ الكل.
 * الإعدادات تعرض طريقة البدء المفضّلة وتبدّل إبراز زرّي البدء، والاختصارات والإصدار.
 */

const setSpy = vi.fn()

function stubChrome(extra: Record<string, unknown> = {}) {
  const meta: SessionMeta = { state: 'idle', sessionId: '', startedAt: 0, stepCount: 0 }
  vi.stubGlobal('chrome', {
    storage: {
      onChanged: { addListener: () => {}, removeListener: () => {} },
      local: {
        get: async (keys: string | string[] | null) => {
          if (keys === null) return { ...extra }
          const list = Array.isArray(keys) ? keys : [keys]
          const out: Record<string, unknown> = {}
          for (const k of list) {
            if (k === META_KEY) out[k] = meta
            if (k in extra) out[k] = extra[k]
          }
          return out
        },
        set: async (obj: Record<string, unknown>) => {
          setSpy(obj)
          Object.assign(extra, obj)
        },
        remove: async () => {},
        getBytesInUse: async () => 2048,
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

const unreadDraft: ActivityEvent = { id: 'e1', kind: 'draft', textAr: 'دليلك محفوظ مسودة — انشره من اللوحة', ts: Date.now(), read: false }

beforeEach(() => {
  setSpy.mockReset()
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
})

afterEach(() => {
  vi.unstubAllGlobals()
})
afterEach(() => cleanup())

describe('الترويسة — زرّا الإعدادات والتنبيهات', () => {
  it('الزران حاضران في الترويسة على شاشة الخمول', async () => {
    stubChrome()
    render(<App />)
    expect(await screen.findByLabelText('الإعدادات')).toBeTruthy()
    expect(screen.getByLabelText('التنبيهات')).toBeTruthy()
  })

  it('بلا أحداث غير مقروءة → لا نقطة على الجرس', async () => {
    stubChrome({ [EVENTS_KEY]: [{ ...unreadDraft, read: true }] })
    render(<App />)
    await screen.findByLabelText('التنبيهات')
    await waitFor(() => expect(screen.queryByLabelText('تنبيهات جديدة')).toBeNull())
  })

  it('حدث غير مقروء → نقطة «تنبيهات جديدة» على الجرس', async () => {
    stubChrome({ [EVENTS_KEY]: [unreadDraft] })
    render(<App />)
    expect(await screen.findByLabelText('تنبيهات جديدة')).toBeTruthy()
  })

  it('فتح الجرس يعرض نص الحدث ويعلّم الكل مقروءًا في التخزين', async () => {
    stubChrome({ [EVENTS_KEY]: [unreadDraft] })
    render(<App />)
    fireEvent.click(await screen.findByLabelText('التنبيهات'))
    expect(await screen.findByText(unreadDraft.textAr)).toBeTruthy()
    await waitFor(() => {
      const write = setSpy.mock.calls.map((c) => c[0]).find((o) => EVENTS_KEY in o) as Record<string, ActivityEvent[]> | undefined
      expect(write?.[EVENTS_KEY]?.[0]?.read).toBe(true)
    })
  })

  it('جرس فارغ يقول «لا جديد» بصدق', async () => {
    stubChrome()
    render(<App />)
    fireEvent.click(await screen.findByLabelText('التنبيهات'))
    expect(await screen.findByText(/لا جديد/)).toBeTruthy()
  })
})

describe('لوحة الإعدادات', () => {
  it('تعرض الاختصارين والإصدار وزر الدخول للضيف', async () => {
    stubChrome()
    render(<App />)
    fireEvent.click(await screen.findByLabelText('الإعدادات'))
    const sheet = within(await screen.findByRole('dialog'))
    expect(sheet.getByRole('heading', { name: 'الإعدادات' })).toBeTruthy()
    expect(sheet.getByText('Ctrl+Shift+U')).toBeTruthy()
    expect(sheet.getByText('Ctrl+Shift+H')).toBeTruthy()
    expect(sheet.getByText(/٠\.٢\.٠/)).toBeTruthy()
    expect(sheet.getByRole('button', { name: 'تسجيل الدخول' })).toBeTruthy()
  })

  it('اختيار «مع تعليق صوتي» كطريقة بدء مفضّلة يُحفظ في التخزين', async () => {
    stubChrome()
    render(<App />)
    fireEvent.click(await screen.findByLabelText('الإعدادات'))
    fireEvent.click(await screen.findByRole('button', { name: 'مع تعليق صوتي' }))
    await waitFor(() => {
      const write = setSpy.mock.calls.map((c) => c[0]).find((o) => SETTINGS_KEY in o) as Record<string, { preferredStart: string }> | undefined
      expect(write?.[SETTINGS_KEY]?.preferredStart).toBe('audio')
    })
  })

  it('زر الإغلاق يعود لشاشة البدء', async () => {
    stubChrome()
    render(<App />)
    fireEvent.click(await screen.findByLabelText('الإعدادات'))
    await screen.findByRole('heading', { name: 'الإعدادات' })
    fireEvent.click(screen.getByLabelText('إغلاق'))
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'الإعدادات' })).toBeNull())
    expect(screen.getByText('ابدأ الالتقاط')).toBeTruthy()
  })
})

describe('طريقة البدء المفضّلة تقود إبراز زرّي البدء', () => {
  it('الافتراضي: «ابدأ الالتقاط» أساسي و«مع تعليق صوتي» ثانوي', async () => {
    stubChrome()
    render(<App />)
    const plain = (await screen.findByText('ابدأ الالتقاط')).closest('button')!
    const audio = screen.getByText('ابدأ مع تعليق صوتي').closest('button')!
    expect(plain.className).not.toContain('cta-2')
    expect(audio.className).toContain('cta-2')
  })

  it('المفضّل audio: يتبادلان الإبراز والنصوص لا تتغيّر', async () => {
    stubChrome({ [SETTINGS_KEY]: { preferredStart: 'audio' } })
    render(<App />)
    const audio = (await screen.findByText('ابدأ مع تعليق صوتي')).closest('button')!
    await waitFor(() => expect(audio.className).not.toContain('cta-2'))
    expect(screen.getByText('ابدأ الالتقاط').closest('button')!.className).toContain('cta-2')
  })
})
