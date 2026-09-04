import { describe, expect, it, vi, type Mock } from 'vitest'
import { makeVoiceMemo, voiceMemoKey, type MemoHost, type StoredVoiceMemo } from './voice-memo'

/** VOX-09 «ميك الخطوة»: آلة حالة التعليق في الخلفية — بلا خطوة يرفض، السقف 60ث
 * يوقف تلقائيًا، والصوت يُخزَّن محليًا pending:true حتى يُرفع (لا يفقد أبدًا) */

function memStore() {
  const data: Record<string, unknown> = {}
  return {
    data,
    store: {
      get: async (keys: string[]) => Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, data[k]])),
      getAll: async () => ({ ...data }),
      set: async (o: Record<string, unknown>) => {
        Object.assign(data, o)
      },
      remove: async (keys: string[]) => {
        for (const k of keys) delete data[k]
      },
    },
  }
}

function host(over: Partial<MemoHost> = {}): MemoHost & { onCapResult: Mock; capFn: () => Promise<void>; data: Record<string, unknown> } {
  const mem = memStore()
  let capFn = async () => {}
  const h = {
    messageOffscreen: vi.fn().mockResolvedValue({ ok: true, chunks: ['QUJD'], durationMs: 5000 }),
    store: mem.store,
    data: mem.data,
    onCapResult: vi.fn(),
    now: () => 1000,
    setCapTimer: (fn: () => void) => {
      capFn = async () => fn()
      return 'timer'
    },
    clearCapTimer: vi.fn(),
    async capFn() {
      await capFn()
      // سلسلة الإيقاف promise — ماحق المهام كي تصل النتيجة إلى onCapResult
      await new Promise((resolve) => setTimeout(resolve, 0))
    },
    ...over,
  } as MemoHost & { onCapResult: Mock; capFn: () => Promise<void>; data: Record<string, unknown> }
  return h
}

describe('voice-memo — تعليق الخطوة في الخلفية (VOX-09)', () => {
  it('بدء بلا خطوات يرفض برسالة صادقة ولا يلمس offscreen', async () => {
    const h = host()
    const vm = makeVoiceMemo(h)
    const r = await vm.startMemo('s1', -1)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.errorAr).toContain('التقط خطوة')
    expect(h.messageOffscreen).not.toHaveBeenCalled()
  })

  it('بدء مزدوج يرفض، والإيقاف يخزّن المقاطع pending تحت مفتاح الخطوة', async () => {
    const h = host()
    const vm = makeVoiceMemo(h)
    expect((await vm.startMemo('s1', 2)).ok).toBe(true)
    expect((await vm.startMemo('s1', 3)).ok).toBe(false)
    const r = await vm.stopMemo('user')
    expect(r.ok).toBe(true)
    expect(r.stepIndex).toBe(2)
    const saved = h.data[voiceMemoKey('s1', 2)] as StoredVoiceMemo
    expect(saved.pending).toBe(true)
    expect(saved.chunks).toEqual(['QUJD'])
    expect(saved.durationMs).toBe(5000)
    expect(h.clearCapTimer).toHaveBeenCalled()
    // وبعده لا تسجيل جارٍ
    expect((await vm.stopMemo('user')).ok).toBe(false)
  })

  it('السقف 60ث يوقف تلقائيًا ويخزّن ويردّ النتيجة على onCapResult', async () => {
    const h = host()
    const vm = makeVoiceMemo(h)
    await vm.startMemo('s1', 0)
    await h.capFn() // انفجار مؤقت السقف
    expect(h.onCapResult).toHaveBeenCalledTimes(1)
    expect(h.onCapResult).toHaveBeenCalledWith(expect.objectContaining({ ok: true, capped: true, stepIndex: 0 }))
    const saved = h.data[voiceMemoKey('s1', 0)] as StoredVoiceMemo
    expect(saved.durationMs).toBe(5000)
    // وبعده لا تسجيل جارٍ
    expect((await vm.stopMemo('user')).ok).toBe(false)
  })

  it('بلاغ المالك 2026-09-04: إيقاف بمقاطع فارغة يرفض ولا يخزّن تعليقًا ميتًا لا يُفرَّغ أبدًا', async () => {
    const h = host({ messageOffscreen: vi.fn().mockResolvedValue({ ok: true, chunks: [], durationMs: 8603 }) })
    const vm = makeVoiceMemo(h)
    await vm.startMemo('s1', 0)
    const r = await vm.stopMemo('user')
    expect(r.ok).toBe(false)
    expect(!r.ok && r.errorAr).toContain('لم يُسجَّل صوت')
    expect(Object.keys(h.data)).toHaveLength(0)
  })

  it('سقف 60ث على تسجيل صامت يردّ فشله على onCapResult كي تعرضه اللوحة', async () => {
    const h = host({ messageOffscreen: vi.fn().mockResolvedValue({ ok: true, chunks: [], durationMs: 60_000 }) })
    const vm = makeVoiceMemo(h)
    await vm.startMemo('s1', 0)
    await h.capFn()
    const call = h.onCapResult.mock.calls[0]?.[0]
    expect(call?.ok).toBe(false)
    expect(call?.errorAr).toContain('لم يُسجَّل صوت')
    expect(h.data[voiceMemoKey('s1', 0)]).toBeUndefined()
  })

  it('رفض offscreen عند البدء يمرر الرسالة العربية', async () => {
    const h = host({ messageOffscreen: vi.fn().mockResolvedValue({ ok: false, errorAr: 'تعذر فتح الميكروفون' }) })
    const vm = makeVoiceMemo(h)
    const r = await vm.startMemo('s1', 0)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.errorAr).toBe('تعذر فتح الميكروفون')
  })

  it('فشل الإيقاف لا يخزن شيئًا ويعيد رسالة عربية', async () => {
    const h = host({ messageOffscreen: vi.fn().mockResolvedValue({ ok: false, errorAr: 'لا تسجيل جارٍ' }) })
    const vm = makeVoiceMemo(h)
    await vm.startMemo('s1', 0)
    const r = await vm.stopMemo('user')
    expect(r.ok).toBe(false)
    expect(Object.keys(h.data)).toHaveLength(0)
  })

  it('renumberMemos بعد حذف فهرس يعيد ترقيم مفاتيح الصوت كما الخطوات', async () => {
    const h = host()
    h.data[voiceMemoKey('s1', 0)] = { memoId: 'm0', chunks: ['a'], durationMs: 1000, pending: true }
    h.data[voiceMemoKey('s1', 2)] = { memoId: 'm2', chunks: ['c'], durationMs: 3000, pending: true }
    const vm = makeVoiceMemo(h)
    await vm.renumberMemos('s1', 0, 3)
    // m0 كان على الفهرس المحذوف (زال) وm2 انتقل من 2 إلى 1 — كما الخطوات تمامًا
    expect(h.data[voiceMemoKey('s1', 0)]).toBeUndefined()
    expect((h.data[voiceMemoKey('s1', 1)] as StoredVoiceMemo).memoId).toBe('m2')
    expect(h.data[voiceMemoKey('s1', 2)]).toBeUndefined()
  })

  it('purgeMemos يمحو صوت الجلسة وحدها', async () => {
    const h = host()
    h.data[voiceMemoKey('s1', 0)] = { memoId: 'm0', chunks: ['a'], durationMs: 1000, pending: true }
    h.data[voiceMemoKey('s2', 0)] = { memoId: 'mx', chunks: ['z'], durationMs: 1000, pending: true }
    h.data['dalili:step:s1:0'] = { ev: {} }
    const vm = makeVoiceMemo(h)
    await vm.purgeMemos('s1')
    expect(h.data[voiceMemoKey('s1', 0)]).toBeUndefined()
    expect(h.data[voiceMemoKey('s2', 0)]).toBeTruthy()
    expect(h.data['dalili:step:s1:0']).toBeTruthy()
  })
})
