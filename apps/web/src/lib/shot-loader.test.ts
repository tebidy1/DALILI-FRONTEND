import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createShotLoader } from './shot-loader'

/**
 * علّة 2026-10-23: دليل من ٤٠ خطوة أطلق ٤٠ طلب صورة دفعة واحدة، فردّ الخادم بـ 503/500
 * لنصفها، وبقيت إطاراتها فارغة إلى الأبد — لا حدّ للتزامن ولا إعادة محاولة ولا حالة فشل.
 */

class FakeImage {
  static all: FakeImage[] = []
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  src = ''
  constructor() {
    FakeImage.all.push(this)
  }
}

const started = () => FakeImage.all.filter((i) => i.src !== '')
const lastFor = (src: string) => [...FakeImage.all].reverse().find((i) => i.src === src)!

beforeEach(() => {
  FakeImage.all = []
  vi.useFakeTimers()
  vi.stubGlobal('Image', FakeImage)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('shot-loader', () => {
  it('لا يتجاوز حدّ التزامن، والتالي يبدأ حين يفرغ مكان', () => {
    const loader = createShotLoader({ maxConcurrent: 2, jitter: 0 })
    const ok = vi.fn()
    for (const s of ['a', 'b', 'c', 'd']) loader.load(s, { onLoad: ok, onFail: vi.fn() })
    expect(started().map((i) => i.src)).toEqual(['a', 'b'])
    lastFor('a').onload!()
    expect(started().map((i) => i.src)).toEqual(['a', 'b', 'c'])
    expect(ok).toHaveBeenCalledTimes(1)
  })

  it('يعيد المحاولة بمهلة متزايدة ثم ينجح — ولا يحجز مكانًا أثناء الانتظار', () => {
    const loader = createShotLoader({ maxConcurrent: 1, retries: 3, baseDelayMs: 1000, jitter: 0 })
    const ok = vi.fn()
    const fail = vi.fn()
    loader.load('a', { onLoad: ok, onFail: fail })
    loader.load('b', { onLoad: vi.fn(), onFail: vi.fn() })
    lastFor('a').onerror!()
    // أثناء مهلة «a» يأخذ «b» المكان
    expect(started().map((i) => i.src)).toEqual(['a', 'b'])
    lastFor('b').onload!()
    vi.advanceTimersByTime(999)
    expect(started().filter((i) => i.src === 'a')).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(started().filter((i) => i.src === 'a')).toHaveLength(2)
    lastFor('a').onerror!()
    vi.advanceTimersByTime(2000)
    expect(started().filter((i) => i.src === 'a')).toHaveLength(3)
    lastFor('a').onload!()
    expect(ok).toHaveBeenCalledTimes(1)
    expect(fail).not.toHaveBeenCalled()
  })

  it('بعد نفاد المحاولات: onFail مرة واحدة', () => {
    const loader = createShotLoader({ maxConcurrent: 1, retries: 2, baseDelayMs: 10, jitter: 0 })
    const fail = vi.fn()
    loader.load('a', { onLoad: vi.fn(), onFail: fail })
    lastFor('a').onerror!()
    vi.advanceTimersByTime(10)
    lastFor('a').onerror!()
    vi.advanceTimersByTime(20)
    lastFor('a').onerror!()
    expect(fail).toHaveBeenCalledTimes(1)
    expect(started()).toHaveLength(3)
  })

  it('طلب معلّق بلا ردّ يُعدّ فشلًا بعد المهلة فلا يحجز مكانًا إلى الأبد', () => {
    const loader = createShotLoader({ maxConcurrent: 1, retries: 0, attemptTimeoutMs: 5000, jitter: 0 })
    const fail = vi.fn()
    loader.load('hung', { onLoad: vi.fn(), onFail: fail })
    loader.load('next', { onLoad: vi.fn(), onFail: vi.fn() })
    expect(started().map((i) => i.src)).toEqual(['hung'])
    vi.advanceTimersByTime(5000)
    expect(fail).toHaveBeenCalledTimes(1)
    expect(started().map((i) => i.src)).toEqual(['hung', 'next'])
  })

  it('الإلغاء يحرّر المكان ويُسقط الانتظار ولا يستدعي أي ردّ', () => {
    const loader = createShotLoader({ maxConcurrent: 1, jitter: 0 })
    const ok = vi.fn()
    const cancelA = loader.load('a', { onLoad: ok, onFail: vi.fn() })
    const cancelB = loader.load('b', { onLoad: ok, onFail: vi.fn() })
    cancelB()
    cancelA()
    lastFor('a').onload?.()
    expect(ok).not.toHaveBeenCalled()
    loader.load('c', { onLoad: vi.fn(), onFail: vi.fn() })
    expect(started().map((i) => i.src)).toEqual(['a', 'c'])
  })

  it('التحميل التزامني (صورة في الذاكرة) يبلغ onLoad فورًا', () => {
    class SyncImage {
      onload: (() => void) | null = null
      set src(_v: string) {
        this.onload?.()
      }
    }
    vi.stubGlobal('Image', SyncImage)
    const loader = createShotLoader()
    const ok = vi.fn()
    loader.load('x.jpg', { onLoad: ok, onFail: vi.fn() })
    expect(ok).toHaveBeenCalledTimes(1)
  })
})
