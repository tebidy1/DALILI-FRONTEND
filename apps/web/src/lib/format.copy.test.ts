// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyWithFallback } from './format'

/**
 * فحص «خيارات المشاركة تعمل» (طلب المالك 2026-10-02): البديل كان يعيد true دائمًا
 * حتى لو رفض المتصفح النسخ — فتظهر «نُسخ» والحافظة فارغة. النتيجة الآن صادقة.
 */
function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
}

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(navigator, 'clipboard')
  Reflect.deleteProperty(document, 'execCommand')
})

describe('copyWithFallback — نتيجة صادقة', () => {
  it('الحافظة الحديثة تنجح → true بلا لمس البديل', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard(writeText)
    expect(await copyWithFallback('https://x/s/abc')).toBe(true)
    expect(writeText).toHaveBeenCalledWith('https://x/s/abc')
  })

  it('الحافظة مرفوضة والبديل ينجح → true، ولا يبقى حقل مؤقت في الصفحة', async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error('denied')))
    const exec = vi.fn().mockReturnValue(true)
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true })
    expect(await copyWithFallback('https://x/s/abc')).toBe(true)
    expect(exec).toHaveBeenCalledWith('copy')
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('الحافظة مرفوضة والبديل يرفض → false', async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error('denied')))
    Object.defineProperty(document, 'execCommand', { value: vi.fn().mockReturnValue(false), configurable: true })
    expect(await copyWithFallback('https://x/s/abc')).toBe(false)
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('لا حافظة ولا execCommand أصلًا → false بلا رمي', async () => {
    expect(await copyWithFallback('https://x/s/abc')).toBe(false)
    expect(document.querySelector('textarea')).toBeNull()
  })
})
