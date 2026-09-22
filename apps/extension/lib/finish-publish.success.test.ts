import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFinish, type FinishDeps } from './finish-publish'
import type { SessionMeta } from './protocol'

/**
 * المرحلة ٣ (قرار المالك): النجاح يُرى — بعد نشر ناجح تُحفظ «lastPublished» في
 * الحالة كي تعرض اللوحة بطاقة «دليلك جاهز»، والاسم الاختياري يمر إلى النشر،
 * وفشل التفريغ يسجَّل بحدث يحمل رابط الدليل (الجرس يوصلك للحل).
 */

vi.mock('./publish', () => ({
  clearAllSteps: vi.fn().mockResolvedValue(undefined),
  publishSteps: vi.fn().mockResolvedValue({ guideId: 'g9', memoTotal: 1, memoFailed: 0 }),
}))
vi.mock('./voice-memo-upload', () => ({
  autoTranscribeSteps: vi.fn().mockResolvedValue({ ok: true }),
}))

function world(meta: SessionMeta) {
  let cur = meta
  const pushEvent = vi.fn<(kind: string, textAr: string, href?: string) => Promise<unknown>>().mockResolvedValue(undefined)
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

/** عناوين التبويبات المفتوحة — إثبات أن الدليل المنشور هو ما فُتح */
const tabUrls: string[] = []

const capturing: SessionMeta = { state: 'capturing', sessionId: 's1', startedAt: 0, stepCount: 3 }

beforeEach(() => {
  tabUrls.length = 0
  // ردّ جديد لكل نداء — كائن Response وحيد تُستهلك بنية مرة واحدة فيرمي «Body already read»
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ id: 'u1', email: 'owner@x.sa' }), { status: 200 }))),
  )
  vi.stubGlobal('chrome', {
    storage: { local: { get: async () => ({}), set: async () => {}, remove: async () => {} } },
    tabs: {
      create: async (opts: { url: string }) => {
        tabUrls.push(opts.url)
        return {}
      },
    },
  })
})

afterEach(() => vi.unstubAllGlobals())

describe('finish-publish — لحظة النجاح والتسمية (المرحلة ٣)', () => {
  it('النشر الناجح يحفظ lastPublished (الدليل والخطوات) ويفتح تبويب الدليل', async () => {
    const { publishSteps } = await import('./publish')
    const w = world(capturing)
    await w.finish.finishCapture()
    expect(w.meta().state).toBe('idle')
    expect(w.meta().lastPublished).toMatchObject({ guideId: 'g9', stepCount: 3 })
    expect(w.meta().lastPublished!.at).toBeGreaterThan(0)
    expect(vi.mocked(publishSteps)).toHaveBeenCalledTimes(1)
    expect(tabUrls).toEqual(['http://localhost:5174/g/g9'])
    // النشر الناجح حدثٌ في الجرس برابط دائم — بطاقة النجاح تزول، الحدث يبقى
    expect(w.pushEvent).toHaveBeenCalledWith('publish', expect.stringContaining('نُشر دليلك'), 'http://localhost:5174/g/g9')
  })

  it('الاسم الاختياري يمر إلى النشر للدليل الجديد', async () => {
    const { publishSteps } = await import('./publish')
    const w = world(capturing)
    await w.finish.finishCapture('دليل الفواتير خطوة بخطوة')
    expect(vi.mocked(publishSteps)).toHaveBeenLastCalledWith(
      expect.anything(),
      's1',
      3,
      expect.objectContaining({ title: 'دليل الفواتير خطوة بخطوة' }),
    )
  })

  it('فشل التفريغ بعد نشر ناجح يسجَّل بحدث يحمل رابط الدليل — النشر نفسه لا يتأثر', async () => {
    const { autoTranscribeSteps } = await import('./voice-memo-upload')
    vi.mocked(autoTranscribeSteps).mockResolvedValue({ ok: false })
    const w = world(capturing)
    await w.finish.finishCapture()
    expect(w.meta().state).toBe('idle')
    expect(w.pushEvent).toHaveBeenCalledWith('stt', expect.stringContaining('تفريغ'), 'http://localhost:5174/g/g9')
  })
})
