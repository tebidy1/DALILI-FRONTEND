import { describe, it, expect } from 'vitest'
import { readStepSummaries, readLastShot, readShotAt, renumberAfterDelete } from './steps-read'
import { stepKey, shotKey, type StoredStep } from './protocol'
import { voiceMemoKey, type StoredVoiceMemo } from './voice-memo'

function fakeStore(entries: Record<string, unknown>) {
  return async (keys: string[]) => {
    const out: Record<string, unknown> = {}
    for (const k of keys) if (k in entries) out[k] = entries[k]
    return out
  }
}

const sid = 'sess01'
const click: StoredStep = { ev: { kind: 'click', target: { text: 'حفظ' }, sensitive: false, url: 'https://x', pageTitle: 'X', ts: 1, dpr: 1 } }
const pass: StoredStep = { ev: { kind: 'input', target: { label: 'كلمة المرور' }, sensitive: true, url: 'https://x', pageTitle: 'X', ts: 2, dpr: 1 } }

describe('steps-read', () => {
  it('builds Arabic titles and flags sensitivity from stored steps', async () => {
    const get = fakeStore({ [stepKey(sid, 0)]: click, [stepKey(sid, 1)]: pass })
    const out = await readStepSummaries(sid, 2, get)
    expect(out[0]!.title).toBe('انقر على «حفظ»')
    expect(out[1]!.sensitive).toBe(true)
    expect(out[1]!.title).toContain('سرية')
  })

  it('passes through the target mark rect for the red preview frame', async () => {
    const marked: StoredStep = { ...click, mark: { x: 10, y: 20, w: 30, h: 40 } }
    const get = fakeStore({ [stepKey(sid, 0)]: marked, [stepKey(sid, 1)]: pass })
    const out = await readStepSummaries(sid, 2, get)
    expect(out[0]!.mark).toEqual({ x: 10, y: 20, w: 30, h: 40 })
    expect(out[1]!.mark).toBeUndefined()
  })

  it('reads only the last shot', async () => {
    const get = fakeStore({ [shotKey(sid, 0)]: 'data:a', [shotKey(sid, 1)]: 'data:b' })
    expect(await readLastShot(sid, 2, get)).toBe('data:b')
  })

  it('reads a specific step shot on demand (كشف بطاقة سابقة)', async () => {
    const get = fakeStore({ [shotKey(sid, 0)]: 'data:a', [shotKey(sid, 1)]: 'data:b' })
    expect(await readShotAt(sid, 0, get)).toBe('data:a')
    expect(await readShotAt(sid, 2, get)).toBeUndefined()
    expect(await readShotAt(sid, -1, get)).toBeUndefined()
  })

  it('VOX-09: شارة 🎙 بالمدة تُقرأ من مخزن الصوت للخطوة', async () => {
    const memo: StoredVoiceMemo = { memoId: 'm1', chunks: ['QQ=='], durationMs: 12_000, pending: true }
    const get = fakeStore({
      [stepKey(sid, 0)]: click,
      [voiceMemoKey(sid, 0)]: memo,
      [stepKey(sid, 1)]: pass,
    })
    const out = await readStepSummaries(sid, 2, get)
    expect(out[0]!.voice).toEqual({ durationMs: 12_000, pending: true })
    expect(out[1]!.voice).toBeUndefined()
  })

  it('renumbers a map after deleting a middle index', () => {
    const m = new Map([[0, 'a'], [1, 'b'], [2, 'c']])
    const r = renumberAfterDelete(m, 1, 3)
    expect(r.get(0)).toBe('a')
    expect(r.get(1)).toBe('c')
    expect(r.has(2)).toBe(false)
  })
})
