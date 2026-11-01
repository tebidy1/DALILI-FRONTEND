import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render } from '@testing-library/react'
import { StepImage } from './StepImage'

/**
 * علّة 2026-10-23: لقطة رفضها الخادم (503/500) بقيت إطارًا فارغًا صامتًا إلى الأبد.
 * الآن: «جارٍ التحميل» أثناء الطلب، وبعد نفاد المحاولات «تعذّر» مع زرّ إعادة.
 */

let mode: 'error' | 'load' | 'hang' = 'error'
let created = 0

class ScriptedImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  naturalWidth = 800
  naturalHeight = 600
  set src(_v: string) {
    created++
    if (mode === 'error') queueMicrotask(() => this.onerror?.())
    if (mode === 'load') queueMicrotask(() => this.onload?.())
  }
}

beforeEach(() => {
  mode = 'error'
  created = 0
  vi.useFakeTimers()
  vi.stubGlobal('Image', ScriptedImage)
  // سياق رسم صامت: كل دالّة لا تفعل شيئًا (الاختبار عن حالة التحميل لا عن الرسم)
  const ctx = new Proxy({}, { get: () => () => undefined, set: () => true })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ctx as never)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function exhaustRetries() {
  // ٦ محاولات بمهلة 1+2+4+8+16 ث (+٣٠٪ عشوائية على الأكثر)
  for (let i = 0; i < 8; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(25_000)
    })
  }
}

describe('حالة تحميل اللقطة', () => {
  it('أثناء الطلب: حالة «جارٍ التحميل» معلنة لقارئ الشاشة', () => {
    mode = 'hang'
    const { container } = render(<StepImage src="x.jpg" blurRects={[]} mode="view" alt="لقطة" />)
    const status = container.querySelector('.shot-status')
    expect(status?.getAttribute('role')).toBe('status')
    expect(status?.textContent).toMatch(/تحميل/)
  })

  it('فشل عابر ثم نجاح: لا رسالة فشل، والحالة تختفي', async () => {
    mode = 'error'
    const { container } = render(<StepImage src="x.jpg" blurRects={[]} mode="view" alt="لقطة" />)
    await act(async () => {
      await Promise.resolve()
    })
    mode = 'load'
    await exhaustRetries()
    expect(created).toBe(2)
    expect(container.querySelector('.shot-status')).toBeNull()
  })

  it('بعد نفاد المحاولات: «تعذّر» وزرّ يعيد المحاولة فعلًا', async () => {
    const { container, getByRole } = render(<StepImage src="x.jpg" blurRects={[]} mode="view" alt="لقطة" />)
    await exhaustRetries()
    expect(created).toBe(6)
    expect(container.querySelector('.shot-status.failed')?.textContent).toMatch(/تعذّر/)

    mode = 'load'
    fireEvent.click(getByRole('button', { name: /إعادة المحاولة/ }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(created).toBe(7)
    expect(container.querySelector('.shot-status')).toBeNull()
  })
})
