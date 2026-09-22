import { describe, expect, it, vi } from 'vitest'
import { createAutoMemo, type AutoMemoDeps } from './auto-memo'
import { makeVoiceMemo, voiceMemoKey, type MemoHost, type StoredVoiceMemo } from './voice-memo'
import type { SessionMeta } from './protocol'

/** VOX-AUTO «التعليق التلقائي لكل بطاقة»: كل بطاقة جديدة توقف تعليق سابقتها وتحفظه
 * وتبدأ تعليقًا على الجديدة في الوضع التلقائي، وفي الوضع العادي تكتفي بإيقاف الجاري.
 * صمتُ الميكروفون في الانتقال التلقائي ليس خطأً يُعرَض — المستخدم لم يطلب الإيقاف بنفسه. */

type Ack = { ok: boolean; chunks?: string[]; durationMs?: number; errorAr?: string }

function world(init: { autoMemo?: boolean; stepCount?: number; state?: SessionMeta['state']; ack?: Ack } = {}) {
  const data: Record<string, unknown> = {}
  const host: MemoHost = {
    messageOffscreen: vi.fn().mockResolvedValue(init.ack ?? { ok: true, chunks: ['QUJD'], durationMs: 3000 }),
    store: {
      get: async (keys) => Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, data[k]])),
      getAll: async () => ({ ...data }),
      set: async (o) => {
        Object.assign(data, o)
      },
      remove: async (keys) => {
        for (const k of keys) delete data[k]
      },
    },
  }
  const memo = makeVoiceMemo(host)
  let meta: SessionMeta = {
    state: init.state ?? 'capturing',
    sessionId: 's1',
    startedAt: 0,
    stepCount: init.stepCount ?? 0,
    autoMemo: init.autoMemo,
  }
  const saved: Partial<SessionMeta>[] = []
  const deps: AutoMemoDeps = {
    memo,
    meta: () => meta,
    saveMeta: async (p) => {
      saved.push(p)
      meta = { ...meta, ...p }
    },
    syncMeta: async () => {
      const active = memo.activeMemo()
      meta = { ...meta, memoLive: active ? { stepIndex: active.stepIndex, startedAt: active.startedAt } : undefined }
    },
  }
  return {
    memo,
    data,
    meta: () => meta,
    setMeta: (p: Partial<SessionMeta>) => {
      meta = { ...meta, ...p }
    },
    saved,
    ctl: createAutoMemo(deps),
  }
}

describe('auto-memo — التعليق التلقائي لكل بطاقة (VOX-AUTO)', () => {
  it('الوضع التلقائي: أول بطاقة جديدة يبدأ عليها التعليق فورًا', async () => {
    const w = world({ autoMemo: true, stepCount: 1 })
    await w.ctl.onNewStep('s1', 0)
    expect(w.memo.activeMemo()?.stepIndex).toBe(0)
    expect(w.meta().memoLive?.stepIndex).toBe(0)
  })

  it('بطاقة تالية توقف تعليق السابقة وتخزّنه وتبدأ على الجديدة', async () => {
    const w = world({ autoMemo: true, stepCount: 1 })
    await w.ctl.onNewStep('s1', 0)
    await w.setMeta({ stepCount: 2 })
    await w.ctl.onNewStep('s1', 1)
    const saved = w.data[voiceMemoKey('s1', 0)] as StoredVoiceMemo
    expect(saved.pending).toBe(true)
    expect(w.memo.activeMemo()?.stepIndex).toBe(1)
    expect(w.meta().memoLive?.stepIndex).toBe(1)
  })

  it('الوضع العادي: بطاقة جديدة توقف التعليق الجاري وتحفظه دون بدء بديل', async () => {
    const w = world({ stepCount: 1 })
    expect((await w.memo.startMemo('s1', 0)).ok).toBe(true)
    await w.setMeta({ stepCount: 2, memoLive: { stepIndex: 0, startedAt: 1 } })
    await w.ctl.onNewStep('s1', 1)
    expect(w.data[voiceMemoKey('s1', 0)]).toBeTruthy()
    expect(w.memo.activeMemo()).toBeNull()
    expect(w.meta().memoLive).toBeUndefined()
  })

  it('صمت الميكروفون في الانتقال التلقائي: لا شكوى ولا تخزين، والتسجيل يتابع على الجديدة', async () => {
    const w = world({ autoMemo: true, stepCount: 1, ack: { ok: true, chunks: [], durationMs: 0 } })
    await w.ctl.onNewStep('s1', 0)
    await w.setMeta({ stepCount: 2 })
    await w.ctl.onNewStep('s1', 1)
    expect(w.data[voiceMemoKey('s1', 0)]).toBeUndefined()
    expect(w.saved.some((p) => p.notice)).toBe(false)
    expect(w.memo.activeMemo()?.stepIndex).toBe(1)
  })

  it('فشل بدء التعليق (ميكروفون مكسور) يعطّل الوضع التلقائي بلافتة صادقة', async () => {
    const w = world({ autoMemo: true, stepCount: 1, ack: { ok: false, errorAr: 'تعذر فتح الميكروفون' } })
    await w.ctl.onNewStep('s1', 0)
    expect(w.meta().autoMemo).toBe(false)
    expect(w.saved.some((p) => p.notice?.includes('تعذر فتح الميكروفون'))).toBe(true)
    expect(w.memo.activeMemo()).toBeNull()
  })

  it('بطاقة أحدث وصلت أثناء بدء التعليق: لا تعليق عابر على البطاقة القديمة', async () => {
    const data: Record<string, unknown> = {}
    let resolveStart!: (v: Ack) => void
    const messageOffscreen = vi
      .fn<() => Promise<Ack>>()
      .mockImplementationOnce(() => new Promise<Ack>((r) => (resolveStart = r)))
      .mockResolvedValue({ ok: true, chunks: ['QUJD'], durationMs: 3000 })
    const host: MemoHost = {
      messageOffscreen,
      store: {
        get: async (keys) => Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, data[k]])),
        getAll: async () => ({ ...data }),
        set: async (o) => {
          Object.assign(data, o)
        },
        remove: async (keys) => {
          for (const k of keys) delete data[k]
        },
      },
    }
    const memo = makeVoiceMemo(host)
    let meta: SessionMeta = { state: 'capturing', sessionId: 's1', startedAt: 0, stepCount: 1, autoMemo: true }
    const deps: AutoMemoDeps = {
      memo,
      meta: () => meta,
      saveMeta: async (p) => {
        meta = { ...meta, ...p }
      },
      syncMeta: async () => {},
    }
    const ctl = createAutoMemo(deps)
    const first = ctl.onNewStep('s1', 0) // بدء التعليق على البطاقة 0 معلّق على offscreen
    meta = { ...meta, stepCount: 2 } // في هذه الأثناء وصلت بطاقة أحدث
    const second = ctl.onNewStep('s1', 1)
    await vi.waitFor(() => expect(resolveStart).toBeInstanceOf(Function))
    resolveStart({ ok: true })
    await Promise.all([first, second])
    expect(data[voiceMemoKey('s1', 0)]).toBeUndefined()
    expect(memo.activeMemo()?.stepIndex).toBe(1)
  })

  it('الإيقاف المؤقت يوقف التعليق الجاري ويحفظه (لا صوت في غيابك)', async () => {
    const w = world({ autoMemo: true, stepCount: 1 })
    await w.ctl.onNewStep('s1', 0)
    await w.ctl.suspend()
    expect(w.data[voiceMemoKey('s1', 0)]).toBeTruthy()
    expect(w.memo.activeMemo()).toBeNull()
    expect(w.meta().memoLive).toBeUndefined()
  })

  it('الاستئناف يعيد التعليق التلقائي على آخر بطاقة، والوضع العادي لا يبدأ شيئًا', async () => {
    const auto = world({ autoMemo: true, stepCount: 3 })
    await auto.ctl.resumeAfterPause()
    expect(auto.memo.activeMemo()?.stepIndex).toBe(2)

    const manual = world({ stepCount: 3 })
    await manual.ctl.resumeAfterPause()
    expect(manual.memo.activeMemo()).toBeNull()
  })

  it('زر الميك في الوضع التلقائي: ضغطة توقف التعليق وتعطّل التلقائي، وضغطة تعيد تفعيله', async () => {
    const w = world({ autoMemo: true, stepCount: 1 })
    await w.ctl.onNewStep('s1', 0)
    const off = await w.ctl.toggle()
    expect(off).toEqual({ ok: true, enabled: false })
    expect(w.meta().autoMemo).toBe(false)
    expect(w.data[voiceMemoKey('s1', 0)]).toBeTruthy()
    expect(w.memo.activeMemo()).toBeNull()

    const on = await w.ctl.toggle()
    expect(on).toEqual({ ok: true, enabled: true })
    expect(w.meta().autoMemo).toBe(true)
    expect(w.memo.activeMemo()?.stepIndex).toBe(0)
  })

  it('إعادة تفعيل التلقائي بلا خطوات ترفض برسالة صادقة', async () => {
    const w = world({ stepCount: 0 })
    const r = await w.ctl.toggle()
    expect(r.ok).toBe(false)
    expect(r.errorAr).toContain('التقط خطوة')
    expect(w.meta().autoMemo).toBeUndefined()
  })

  it('إنهاء الالتقاط يوقف التعليق الجاري ويحفظه كي يُنشر مع بقية التعليقات', async () => {
    const w = world({ autoMemo: true, stepCount: 1 })
    await w.ctl.onNewStep('s1', 0)
    await w.ctl.stopForFinish()
    expect(w.data[voiceMemoKey('s1', 0)]).toBeTruthy()
    expect(w.memo.activeMemo()).toBeNull()
  })
})
