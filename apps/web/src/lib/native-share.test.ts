import { afterEach, describe, expect, it, vi } from 'vitest'
import { canNativeShare, nativeShare } from './native-share'

const orig = Object.getOwnPropertyDescriptor(navigator, 'share')

afterEach(() => {
  if (orig) Object.defineProperty(navigator, 'share', orig)
  else delete (navigator as { share?: unknown }).share
})

function setShare(fn: unknown) {
  Object.defineProperty(navigator, 'share', { value: fn, configurable: true, writable: true })
}

describe('nativeShare — ورقة النظام (P0)', () => {
  it('canNativeShare يعكس وجود navigator.share', () => {
    delete (navigator as { share?: unknown }).share
    expect(canNativeShare()).toBe(false)
    setShare(() => Promise.resolve())
    expect(canNativeShare()).toBe(true)
  })

  it('بلا دعم: يعيد false ولا يرمي', async () => {
    delete (navigator as { share?: unknown }).share
    expect(await nativeShare({ url: 'https://x/s/1' })).toBe(false)
  })

  it('مشاركة ناجحة تعيد true وتمرّر الحمولة', async () => {
    const spy = vi.fn().mockResolvedValue(undefined)
    setShare(spy)
    expect(await nativeShare({ title: 'ت', text: 'ت', url: 'https://x/s/1' })).toBe(true)
    expect(spy).toHaveBeenCalledWith({ title: 'ت', text: 'ت', url: 'https://x/s/1' })
  })

  it('إلغاء المستخدم (رفض الوعد) يعيد false بلا رمي', async () => {
    setShare(vi.fn().mockRejectedValue(new Error('AbortError')))
    expect(await nativeShare({ url: 'https://x/s/1' })).toBe(false)
  })
})
