import { describe, expect, it, vi } from 'vitest'
import { createAutoMemo, type AutoMemoDeps, type AutoMemoMeta } from './auto-memo'
import { makeVoiceMemo, type MemoHost, type StoredVoiceMemo } from './voice-memo'

/** ‏VOX-AUTO منقولًا من الإضافة: «ابدأ مع تعليق صوتي» يفتح تعليقًا على كل بطاقة
 *  جديدة ويغلق سابقه، الإيقاف المؤقّت يحفظ ويستأنف على آخر بطاقة، وفشل البدء
 *  يعطّل الوضع بلافتة صادقة. الحالات مطابقة لسلوك الإضافة المرجعيّ. */

function memoHost(): MemoHost & { store: Map<number, StoredVoiceMemo> } {
  return {
    recorder: {
      start: vi.fn().mockResolvedValue({ ok: true }),
      stop: vi.fn().mockResolvedValue({ ok: true, chunks: ['QUJD'], durationMs: 4000 }),
    },
    store: new Map(),
    now: () => 1000,
  }
}

interface World {
  meta: AutoMemoMeta
  deps: AutoMemoDeps
  notices: string[]
  started: number
  stopped: number
}

function world(over: Partial<AutoMemoMeta> = {}): World {
  const w: World = {
    meta: { capturing: true, paused: false, stepCount: 0, autoMemo: true, ...over },
    notices: [],
    started: 0,
    stopped: 0,
  } as never
  const host = memoHost()
  const startOrig = host.recorder.start as ReturnType<typeof vi.fn>
  const stopOrig = host.recorder.stop as ReturnType<typeof vi.fn>
  startOrig.mockImplementation(() => {
    w.started++
    return { ok: true }
  })
  stopOrig.mockImplementation(() => {
    w.stopped++
    return { ok: true, chunks: ['QUJD'], durationMs: 4000 }
  })
  const deps: AutoMemoDeps = {
    memo: makeVoiceMemo(host),
    meta: () => ({ ...w.meta }),
    setAutoMemo: (v) => {
      w.meta.autoMemo = v
    },
    onNotice: (t) => w.notices.push(t),
  }
  w.deps = deps
  return w
}

/** تعليمات offscreen حقيقية تُحل بلا مهام ماحقة — السياسة تسلسلها */
async function drain(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0))
}

describe('auto-memo — التعليق التلقائي لكل بطاقة (نقل VOX-AUTO)', () => {
  it('بطاقة جديدة تغلق تعليق السابقة وتفتح على الجديدة في وضع autoMemo', async () => {
    const w = world()
    const ctl = createAutoMemo(w.deps)
    w.meta.stepCount = 1
    await ctl.onNewStep(0)
    expect(w.started).toBe(1)
    w.meta.stepCount = 2
    await ctl.onNewStep(1)
    expect(w.stopped).toBe(1) // سابقة أُغلقت وحُفظت
    expect(w.started).toBe(2) // والجديدة فُتح عليها
    await drain()
  })

  it('بلا autoMemo: بطاقة جديدة تغلق الجاري ولا تفتح بديلًا — الصوت لا يمتد بحسن نية', async () => {
    const w = world({ autoMemo: false })
    const ctl = createAutoMemo(w.deps)
    w.meta.stepCount = 1
    await ctl.onNewStep(0)
    expect(w.started).toBe(0)
    // تعليق يدوي جارٍ ثم بطاقة جديدة: يُغلق ولا بديل
    await w.deps.memo.startMemo(0)
    const before = w.started // بدءُ اليدوي يعدّ — القياس عليه بعده
    w.meta.stepCount = 2
    await ctl.onNewStep(1)
    expect(w.stopped).toBe(1)
    expect(w.started).toBe(before)
    await drain()
  })

  it('بطاقة أحدث وصلت أثناء الانتظار ⇐ لا تعليق عابر على بطاقة تلاشت', async () => {
    const w = world()
    const ctl = createAutoMemo(w.deps)
    w.meta.stepCount = 3 // وصل ٢ و٣ أثناء التسلسل — الفهرس 1 لم يعد الأحدث
    await ctl.onNewStep(1)
    expect(w.started).toBe(0)
    await drain()
  })

  it('فشل بدء التعليق يعطّل الوضع التلقائي بلافتة عربية صادقة', async () => {
    const host = memoHost()
    ;(host.recorder.start as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, errorAr: 'تعذر فتح الميكروفون — علّق على الخطوة بعد منح الإذن' })
    const meta: AutoMemoMeta = { capturing: true, paused: false, stepCount: 1, autoMemo: true }
    const notices: string[] = []
    const deps: AutoMemoDeps = {
      memo: makeVoiceMemo(host),
      meta: () => ({ ...meta }),
      setAutoMemo: (v) => {
        meta.autoMemo = v
      },
      onNotice: (t) => notices.push(t),
    }
    const ctl = createAutoMemo(deps)
    await ctl.onNewStep(0)
    expect(meta.autoMemo).toBe(false) // الوضع عُطِّل فعلًا
    expect(notices).toEqual(['تعذر فتح الميكروفون — علّق على الخطوة بعد منح الإذن'])
    await drain()
  })

  it('الإيقاف المؤقّت يحفظ الجاري والاستئناف يعيد على آخر بطاقة في الوضع التلقائي', async () => {
    const w = world()
    const ctl = createAutoMemo(w.deps)
    w.meta.stepCount = 2
    await ctl.onNewStep(1)
    expect(w.started).toBe(1)
    await ctl.suspend()
    expect(w.stopped).toBe(1)
    await ctl.resumeAfterPause()
    expect(w.started).toBe(2)
    // وفي الوضع اليدوي الاستئناف لا يبدأ شيئًا
    const w2 = world({ autoMemo: false })
    const ctl2 = createAutoMemo(w2.deps)
    await ctl2.resumeAfterPause()
    expect(w2.started).toBe(0)
    await drain()
  })

  it('الإنهاء يغلق الجاري كي يُرفع مع بقية التعليقات', async () => {
    const w = world()
    const ctl = createAutoMemo(w.deps)
    w.meta.stepCount = 1
    await ctl.onNewStep(0)
    await ctl.stopForFinish()
    expect(w.stopped).toBe(1)
    await drain()
  })

  it('زر الميك في الوضع التلقائي مفتاح تشغيل/إيقاف للوضع كله', async () => {
    const w = world()
    const ctl = createAutoMemo(w.deps)
    w.meta.stepCount = 1
    const off = await ctl.toggle()
    expect(off).toEqual({ ok: true, enabled: false })
    expect(w.notices.some((t) => t.includes('أُوقف التعليق التلقائي'))).toBe(true)
    // إعادة التشغيل بلا خطوات يرفض بصدق
    w.meta.stepCount = 0
    const back = await ctl.toggle()
    expect(back).toEqual({ ok: false, errorAr: 'التقط خطوة أولًا ثم علّق عليها بصوتك' })
    // وبخطوات يعيد الفتح على الأخيرة
    w.meta.stepCount = 2
    const on = await ctl.toggle()
    expect(on).toEqual({ ok: true, enabled: true })
    expect(w.started).toBeGreaterThan(0)
    await drain()
  })
})
