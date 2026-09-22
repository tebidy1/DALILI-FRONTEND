// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { App } from './App'
import { META_KEY, stepKey, shotKey, type SessionMeta } from '../../lib/protocol'
import { voiceMemoKey, type StoredVoiceMemo } from '../../lib/voice-memo'

/**
 * VOX-09 «ميك الخطوة» — سلوكيات اللوحة الجانبية:
 * الزر يظهر أثناء الالتقاط فقط · معطل قبل أول خطوة · النقر يستدعي memo-toggle
 * مع مؤقت ظاهر أثناء التسجيل · ✕ على شارة 🎙 يحذف · الرفض يعرض لافتة الصدق ويعطل الزر
 */

const send = vi.fn()

function stubChrome(meta: SessionMeta, extra: Record<string, unknown> = {}) {
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
        set: async () => {},
        remove: async () => {},
      },
    },
    runtime: { sendMessage: (msg: unknown) => send(msg) },
    tabs: {
      query: async () => [],
      onActivated: { addListener: () => {} },
      onUpdated: { addListener: () => {} },
    },
  })
}

function stubPermissions(state: 'granted' | 'denied' | 'prompt') {
  Object.defineProperty(window.navigator, 'permissions', {
    value: { query: async () => ({ state }) },
    configurable: true,
  })
}

const capturing = (stepCount: number, over: Partial<SessionMeta> = {}): SessionMeta => ({
  state: 'capturing',
  sessionId: 's1',
  startedAt: Date.now(),
  stepCount,
  ...over,
})

const clickStep = (i: number) => ({
  ev: { kind: 'click', target: { text: 'حفظ' }, sensitive: false, url: 'https://x', pageTitle: 'X', ts: i, dpr: 1 },
})

beforeEach(() => {
  send.mockReset()
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
  stubPermissions('granted')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// الحزمة بلا globals فلا auto-cleanup من RTL — بقايا DOM تؤدي لأزرار مكررة.
// مُسجَّل بعد unstubAllGlobals كي يعمل قبله (LIFO) والـ stub ما زال حيًّا عند التفكيك
afterEach(() => cleanup())

describe('VOX-09: زر الميك في اللوحة الجانبية', () => {
  it('الزر يظهر أثناء الالتقاط فقط', async () => {
    stubChrome(capturing(1))
    const { unmount } = render(<App />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'سجّل تعليقًا صوتيًا لهذه الخطوة' })).toBeTruthy())
    unmount()
    stubChrome({ state: 'idle', sessionId: '', startedAt: 0, stepCount: 0 })
    render(<App />)
    await waitFor(() => expect(screen.getByText('● جاهز')).toBeTruthy())
    expect(screen.queryByRole('button', { name: 'سجّل تعليقًا صوتيًا لهذه الخطوة' })).toBeNull()
  })

  it('معطل قبل أول خطوة بتلميح صادق', async () => {
    stubChrome(capturing(0))
    render(<App />)
    const btn = await screen.findByRole('button', { name: 'التقط خطوة أولًا ثم علّق عليها بصوتك' })
    expect((btn as HTMLButtonElement).disabled).toBe(true)
  })

  it('النقر يستدعي memo-toggle، وأثناء التسجيل يظهر المؤقت ويحمر الزر', async () => {
    // تثبيت الزمن: بدأ التسجيل قبل ٧ ثوانٍ بالضبط مهما جاع المعالج — لا تذبذب
    const FIXED_NOW = 1_800_000_000_000
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW)
    stubChrome(
      capturing(1, { memoLive: { stepIndex: 0, startedAt: FIXED_NOW - 7000 } }),
      {
        [stepKey('s1', 0)]: clickStep(0),
        [shotKey('s1', 0)]: 'data:image/png;base64,QQ==',
      },
    )
    render(<App />)
    const btn = await screen.findByRole('button', { name: 'إيقاف التعليق الصوتي' })
    fireEvent.click(btn)
    await waitFor(() => expect(send).toHaveBeenCalledWith({ t: 'memo-toggle' }))
    expect(screen.getByText('٠:٠٧')).toBeTruthy() // مؤقت التسجيل بأرقام هندية
    // شريط التسجيل الحي: موجة أعلى البطاقة تحلّ محل السطر الأحمر القديم
    expect(screen.getByRole('status', { name: 'جارٍ تسجيل تعليق صوتي على هذه البطاقة' })).toBeTruthy()
    expect(screen.getByText('🎙 جارٍ التسجيل')).toBeTruthy()
    nowSpy.mockRestore()
  })

  it('✕ على شارة 🎙 يحذف التعليق بخطوتين — النقرة الأولى تسلّح والثانية تحذف (المرحلة ٢)', async () => {
    const memo: StoredVoiceMemo = { memoId: 'm1', chunks: ['QQ=='], durationMs: 12_000, pending: true }
    stubChrome(capturing(1), { [stepKey('s1', 0)]: clickStep(0), [voiceMemoKey('s1', 0)]: memo })
    render(<App />)
    const del = await screen.findByRole('button', { name: 'حذف التعليق الصوتي' })
    fireEvent.click(del)
    // النقرة الأولى: تسليح فقط — لا حذف بعد، والزر يطلب التأكيد
    expect(send).not.toHaveBeenCalledWith({ t: 'memo-delete', index: 0 })
    expect(screen.getByRole('button', { name: 'اضغط مجددًا لتأكيد حذف التعليق الصوتي' })).toBeTruthy()
    // المرحلة ٤: العدّاد يُرى على الزر المسلَّح — أربع ثوانٍ بالأرقام الهندية
    expect(screen.getByRole('button', { name: 'اضغط مجددًا لتأكيد حذف التعليق الصوتي' }).textContent).toContain('٤')
    fireEvent.click(screen.getByRole('button', { name: 'اضغط مجددًا لتأكيد حذف التعليق الصوتي' }))
    await waitFor(() => expect(send).toHaveBeenCalledWith({ t: 'memo-delete', index: 0 }))
    expect(screen.getByText(/١٢ ث/)).toBeTruthy()
  })

  it('رفض الإذن: لافتة صادقة والزر معطل لهذه الجلسة', async () => {
    stubPermissions('denied')
    stubChrome(capturing(1))
    render(<App />)
    const btn = await screen.findByRole('button', { name: 'سجّل تعليقًا صوتيًا لهذه الخطوة' })
    fireEvent.click(btn)
    await waitFor(() => expect(screen.getByText(/لا صوت — الالتقاط مستمر/)).toBeTruthy())
    expect((btn as HTMLButtonElement).disabled).toBe(true)
  })

  it('بلاغ المالك 2026-09-04: فشل إيقاف التعليق (تسجيل صامت) يعرض رسالته الصادقة في اللوحة', async () => {
    stubChrome(capturing(1, { memoLive: { stepIndex: 0, startedAt: Date.now() } }))
    send.mockImplementation((msg: { t?: string }) =>
      msg?.t === 'memo-toggle'
        ? Promise.resolve({ ok: false, errorAr: 'لم يُسجَّل صوت — تأكد أن الميكروفون ليس صامتًا ثم أعد المحاولة' })
        : undefined,
    )
    render(<App />)
    const btn = await screen.findByRole('button', { name: 'إيقاف التعليق الصوتي' })
    fireEvent.click(btn)
    await waitFor(() => expect(screen.getByText(/لم يُسجَّل صوت/)).toBeTruthy())
    // والزر يبقى في وضع الإيقاف — التسجيل ما زال معلقًا كي يعيد المحاولة
    expect(screen.getByRole('button', { name: 'إيقاف التعليق الصوتي' })).toBeTruthy()
  })
})
