import { describe, expect, it, vi, type Mock } from 'vitest'
import { makeVoiceMemo, applyMemosToGuide, MEMO_CAP_MS, type MemoHost, type StoredVoiceMemo } from './voice-memo'
import type { Guide } from '@dalili/core'

describe('applyMemosToGuide — ربط التعليقات بخطوات الدليل عند الإنهاء', () => {
  function fakeGuide(stepCount: number): Guide {
    return {
      id: 'g1',
      schemaVersion: 2,
      title: 'دليل',
      locale: 'ar',
      dir: 'rtl',
      createdAt: '2026-09-17T00:00:00.000Z',
      updatedAt: '2026-09-17T00:00:00.000Z',
      steps: Array.from({ length: stepCount }, (_, i) => ({
        id: `s${i}`,
        kind: 'click',
        title: `خطوة ${i}`,
        target: {},
        sensitive: false,
        ts: i * 1000,
      })),
    }
  }

  it('كل خطوة لها تعليق تصير pending بالمدة، وبلا تعليق تبقى كما هي', () => {
    const store = new Map<number, StoredVoiceMemo>([
      [0, { memoId: 'm0', chunks: ['a'], durationMs: 3000, pending: true }],
      [2, { memoId: 'm2', chunks: ['b'], durationMs: 9000, pending: true }],
    ])
    const guide = fakeGuide(3)
    applyMemosToGuide(guide, store)
    expect(guide.steps[0]?.voice).toEqual({ durationMs: 3000, pending: true })
    expect(guide.steps[1]?.voice).toBeUndefined()
    expect(guide.steps[2]?.voice).toEqual({ durationMs: 9000, pending: true })
    // بلا fileId ولا fileUrl — الرقم الحقيقيّ من حدث رفع الطابور حصرًا
    expect(guide.steps[0]?.voice).not.toHaveProperty('fileId')
  })

  it('إعادة تسجيل تعليق خطوة ⇐ الأحدث المنتصر، وفهرس خارج الدليل يُتجاهل بصدق', () => {
    const store = new Map<number, StoredVoiceMemo>([
      [1, { memoId: 'old', chunks: ['a'], durationMs: 1000, pending: true }],
      [99, { memoId: 'ghost', chunks: ['z'], durationMs: 1000, pending: true }],
    ])
    const guide = fakeGuide(2)
    applyMemosToGuide(guide, store)
    expect(guide.steps[1]?.voice).toEqual({ durationMs: 1000, pending: true })
  })
})

/** VOX-09 منقولًا للديسكتوب: آلة حالة التعليق — بلا خطوة ترفض، سقف ٦٠ث يوقف
 * تلقائيًا، والصوت يبقى pending حتى يرفعه طابور Rust (لا يُفقَد أبدًا).
 * الحالات نفسها التي اختُبرت بالإضافة بحارسها الأصلي. */

/** مخزن الذاكرة كما تعيش التعليقات بين التسجيل والتسليم في الودجة */
function memStore() {
  const map = new Map<number, StoredVoiceMemo>()
  return map
}

function host(over: Partial<MemoHost> = {}): MemoHost & { onCapResult: Mock; fireCap: () => Promise<void>; store: Map<number, StoredVoiceMemo> } {
  const store = memStore()
  let capFn = async () => {}
  const h = {
    recorder: {
      start: vi.fn().mockResolvedValue({ ok: true }),
      stop: vi.fn().mockResolvedValue({ ok: true, chunks: ['QUJD'], durationMs: 5000 }),
    },
    store,
    onCapResult: vi.fn(),
    now: () => 1000,
    setCapTimer: (fn: () => void) => {
      capFn = async () => fn()
      return 'timer'
    },
    clearCapTimer: vi.fn(),
    async fireCap() {
      await capFn()
      // تفريغ المهام الماحقة كي تصل نتيجة السقف إلى onCapResult
      await new Promise((resolve) => setTimeout(resolve, 0))
    },
    ...over,
  } as MemoHost & { onCapResult: Mock; fireCap: () => Promise<void>; store: Map<number, StoredVoiceMemo> }
  return h
}

describe('voice-memo — تعليق الخطوة في الودجة (نقل VOX-09)', () => {
  it('سقف التعليق ٦٠ث كالإضافة حرفيًا', () => {
    expect(MEMO_CAP_MS).toBe(60_000)
  })

  it('بدء بلا خطوة يرفض برسالة صادقة ولا يلمس المسجّل', async () => {
    const h = host()
    const vm = makeVoiceMemo(h)
    const r = await vm.startMemo(-1)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.errorAr).toContain('التقط خطوة')
    expect(h.recorder.start).not.toHaveBeenCalled()
  })

  it('بدء مزدوج يرفض، والإيقاف يخزّن المقاطع pending تحت فهرس الخطوة', async () => {
    const h = host()
    const vm = makeVoiceMemo(h)
    expect((await vm.startMemo(2)).ok).toBe(true)
    expect((await vm.startMemo(3)).ok).toBe(false)
    const r = await vm.stopMemo('user')
    expect(r.ok).toBe(true)
    expect(r.stepIndex).toBe(2)
    const saved = h.store.get(2)!
    expect(saved.pending).toBe(true)
    expect(saved.chunks).toEqual(['QUJD'])
    expect(saved.durationMs).toBe(5000)
    expect(saved.memoId).toMatch(/^[0-9a-f]{10}$/)
    expect(h.clearCapTimer).toHaveBeenCalled()
    // وبعده لا تسجيل جارٍ
    expect((await vm.stopMemo('user')).ok).toBe(false)
  })

  it('activeMemo يكشف الجاري بفهرسه ثم يخمو بعد الإيقاف', async () => {
    const h = host()
    const vm = makeVoiceMemo(h)
    expect(vm.activeMemo()).toBeNull()
    await vm.startMemo(1)
    expect(vm.activeMemo()?.stepIndex).toBe(1)
    await vm.stopMemo('user')
    expect(vm.activeMemo()).toBeNull()
  })

  it('السقف ٦٠ث يوقف تلقائيًا ويخزّن ويردّ النتيجة على onCapResult', async () => {
    const h = host()
    const vm = makeVoiceMemo(h)
    await vm.startMemo(0)
    await h.fireCap() // انفجار مؤقّت السقف
    expect(h.onCapResult).toHaveBeenCalledTimes(1)
    expect(h.onCapResult).toHaveBeenCalledWith(expect.objectContaining({ ok: true, capped: true, stepIndex: 0 }))
    expect(h.store.get(0)?.durationMs).toBe(5000)
    // وبعده لا تسجيل جارٍ
    expect((await vm.stopMemo('user')).ok).toBe(false)
  })

  it('بلاغ المالك 2026-09-04: إيقاف بمقاطع فارغة يرفض ولا يخزّن تعليقًا ميتًا لا يُفرَّغ أبدًا', async () => {
    const h = host({ recorder: { start: vi.fn().mockResolvedValue({ ok: true }), stop: vi.fn().mockResolvedValue({ ok: true, chunks: [], durationMs: 8603 }) } })
    const vm = makeVoiceMemo(h)
    await vm.startMemo(0)
    const r = await vm.stopMemo('user')
    expect(r.ok).toBe(false)
    expect(!r.ok && r.errorAr).toContain('لم يُسجَّل صوت')
    expect(h.store.size).toBe(0)
  })

  it('سقف ٦٠ث على تسجيل صامت يردّ فشله على onCapResult كي تعرضه الودجة', async () => {
    const h = host({ recorder: { start: vi.fn().mockResolvedValue({ ok: true }), stop: vi.fn().mockResolvedValue({ ok: true, chunks: [], durationMs: 60_000 }) } })
    const vm = makeVoiceMemo(h)
    await vm.startMemo(0)
    await h.fireCap()
    const call = h.onCapResult.mock.calls[0]?.[0]
    expect(call?.ok).toBe(false)
    expect(call?.errorAr).toContain('لم يُسجَّل صوت')
    expect(h.store.get(0)).toBeUndefined()
  })

  it('رفض المسجّل عند البدء يمرّر الرسالة العربية', async () => {
    const h = host({ recorder: { start: vi.fn().mockResolvedValue({ ok: false, errorAr: 'تعذر فتح الميكروفون — علّق على الخطوة بعد منح الإذن' }), stop: vi.fn() } })
    const vm = makeVoiceMemo(h)
    const r = await vm.startMemo(0)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.errorAr).toBe('تعذر فتح الميكروفون — علّق على الخطوة بعد منح الإذن')
  })

  it('فشل الإيقاف لا يخزن شيئًا ويعيد رسالة عربية', async () => {
    const h = host({ recorder: { start: vi.fn().mockResolvedValue({ ok: true }), stop: vi.fn().mockResolvedValue({ ok: false, errorAr: 'لا تسجيل جارٍ' }) } })
    const vm = makeVoiceMemo(h)
    await vm.startMemo(0)
    const r = await vm.stopMemo('user')
    expect(r.ok).toBe(false)
    expect(h.store.size).toBe(0)
  })

  it('clearMemo يحذف فهرسًا واحدًا وpurge يمحو الجلسة كلها', async () => {
    const h = host()
    const vm = makeVoiceMemo(h)
    h.store.set(0, { memoId: 'm0', chunks: ['a'], durationMs: 1000, pending: true })
    h.store.set(1, { memoId: 'm1', chunks: ['b'], durationMs: 2000, pending: true })
    await vm.clearMemo(0)
    expect(h.store.has(0)).toBe(false)
    expect(h.store.has(1)).toBe(true)
    await vm.purge()
    expect(h.store.size).toBe(0)
  })
})
