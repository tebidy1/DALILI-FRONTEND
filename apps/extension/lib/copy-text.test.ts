// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyText } from './copy-text'

afterEach(() => vi.restoreAllMocks())

describe('copyText', () => {
  it('يستعمل clipboard API حين تتاح', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    await copyText('http://web/s/tok')
    expect(writeText).toHaveBeenCalledWith('http://web/s/tok')
  })
  it('يرجع إلى execCommand حين يرفض clipboard', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('no focus')) }, configurable: true })
    const exec = vi.fn().mockReturnValue(true)
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true })
    await copyText('x')
    expect(exec).toHaveBeenCalledWith('copy')
  })
  it('يرمي حين تفشل الطريقتان', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    Object.defineProperty(document, 'execCommand', { value: vi.fn().mockReturnValue(false), configurable: true })
    await expect(copyText('x')).rejects.toThrow()
  })
})
