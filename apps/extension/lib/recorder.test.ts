import { describe, expect, it, vi } from 'vitest'
import { makeChunkHandler } from './recorder'

/** VOX-01: تقطيع التسجيل — كل مقطع يُسلَّم مع ساعة performance.now() لحظة وصوله */

describe('makeChunkHandler', () => {
  it('كل مقطع يصل بفهرس متسلسل وحجمه وساعة لحظة الحدث — والفارغ يُتجاهل', async () => {
    const got: Array<{ idx: number; bytes: number; clock: number }> = []
    const handler = makeChunkHandler((c) => got.push(c))
    handler({ data: new Blob([new Uint8Array(10)]) })
    handler({ data: new Blob([]) }) // مقطع فارغ لا يحسب
    handler({ data: new Blob([new Uint8Array(20)]) })
    await vi.waitFor(() => expect(got).toHaveLength(2))
    expect(got[0]!.idx).toBe(0)
    expect(got[0]!.bytes).toBe(10)
    expect(got[1]!.idx).toBe(1)
    expect(got[1]!.bytes).toBe(20)
    expect(got[1]!.clock).toBeGreaterThanOrEqual(got[0]!.clock)
  })

  it('b64 المقطع يعود بايتات مطابقة', async () => {
    const got: string[] = []
    const handler = makeChunkHandler((c) => got.push(c.b64))
    const payload = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])
    handler({ data: new Blob([payload]) })
    await vi.waitFor(() => expect(got).toHaveLength(1))
    const back = Uint8Array.from(atob(got[0]!), (c) => c.charCodeAt(0))
    expect(back).toEqual(payload)
  })
})
