import { describe, expect, it, vi } from 'vitest'
import { makeMemoRecorder, type MemoDeps } from './memo-recorder'

/** VOX-09 «ميك الخطوة»: مسجّل التعليق القصير — start/stop يعيدان مقاطع b64 ومدة،
 * وبدون إذن يرد ok:false برسالة عربية صادقة. بثابت مسجّل محلول كي يُختبر بلا متصفح */

class FakeRecorder {
  static last: FakeRecorder | null = null
  state = 'inactive'
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  constructor(_stream: unknown, opts: { mimeType?: string }) {
    expect(opts.mimeType).toBe('audio/webm;codecs=opus')
    FakeRecorder.last = this
  }
  start(_timeslice?: number) {
    this.state = 'recording'
  }
  stop() {
    this.state = 'inactive'
    queueMicrotask(() => this.onstop?.())
  }
}

function okStream() {
  return { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream
}

function deps(over: Partial<MemoDeps> = {}): MemoDeps {
  return {
    getUserMedia: vi.fn().mockResolvedValue(okStream()),
    recorderCtor: FakeRecorder as unknown as typeof MediaRecorder,
    now: () => 1000,
    ...over,
  }
}

describe('memo-recorder — تعليق الخطوة الصوتي (VOX-09)', () => {
  it('start ثم stop يعيدان المقاطع b64 والمدة — والتراكات تُوقف', async () => {
    let clock = 1000
    const tracks = [{ stop: vi.fn() }]
    const memo = makeMemoRecorder(
      deps({
        getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => tracks } as unknown as MediaStream),
        now: () => clock,
      }),
    )
    expect(await memo.start()).toEqual({ ok: true })
    clock = 3000 // ثانيتان من التسجيل
    FakeRecorder.last!.ondataavailable?.({ data: new Blob([new Uint8Array([1, 2, 3])]) })
    FakeRecorder.last!.ondataavailable?.({ data: new Blob([new Uint8Array([9])]) })
    const ack = await memo.stop()
    expect(ack.ok).toBe(true)
    expect(ack.ok && ack.chunks).toHaveLength(2)
    expect(ack.ok && ack.durationMs).toBe(2000)
    const back = Uint8Array.from(atob(ack.ok ? ack.chunks[0]! : ''), (c) => c.charCodeAt(0))
    expect([...back]).toEqual([1, 2, 3])
    expect(tracks[0]!.stop).toHaveBeenCalled()
  })

  it('بدون إذن ميكروفون: ok:false برسالة عربية ولا انهيار', async () => {
    const memo = makeMemoRecorder(deps({ getUserMedia: vi.fn().mockRejectedValue(new Error('denied')) }))
    const ack = await memo.start()
    expect(ack.ok).toBe(false)
    expect(!ack.ok && ack.errorAr.length).toBeGreaterThan(0)
  })

  it('إيقاف بلا تسجيل جارٍ يرفض عربيًا، وبدء مزدوج يرفض الثاني', async () => {
    const memo = makeMemoRecorder(deps())
    const idle = await memo.stop()
    expect(idle.ok).toBe(false)
    expect(!idle.ok && idle.errorAr.length).toBeGreaterThan(0)
    expect(await memo.start()).toEqual({ ok: true })
    const second = await memo.start()
    expect(second.ok).toBe(false)
  })

  it('مقطع فارغ لا يُحسب ضمن المقاطع', async () => {
    const memo = makeMemoRecorder(deps())
    await memo.start()
    FakeRecorder.last!.ondataavailable?.({ data: new Blob([]) })
    FakeRecorder.last!.ondataavailable?.({ data: new Blob([new Uint8Array([5])]) })
    const ack = await memo.stop()
    expect(ack.ok && ack.chunks).toHaveLength(1)
  })

  it('بلاغ المالك 2026-09-04: تسجيل بلا أي مقطع (ميكروفون صامت) يرفض بصدق — لا صوت ميت يُخزَّن', async () => {
    const memo = makeMemoRecorder(deps())
    await memo.start()
    // لا ondataavailable إطلاقًا طوال التسجيل — ثوانٍ مرّت بلا بايت واحد
    const ack = await memo.stop()
    expect(ack.ok).toBe(false)
    expect(!ack.ok && ack.errorAr).toContain('لم يُسجَّل صوت')
  })
})
