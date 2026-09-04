import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rectAfterSettle } from './events'

/** عنصر كامل للاختبار: موضع يتبدل بين القياسين + قابل «لفصل» */
function stubElement(rect: { x: number; y: number; w: number; h: number }) {
  return {
    isConnected: true,
    getBoundingClientRect: () =>
      ({ x: rect.x, y: rect.y, width: rect.w, height: rect.h }) as DOMRect,
  }
}

describe('rectAfterSettle — علة التعليم المتكررة: القياس لحظة النقر تقادم قبل اللقطة', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('عنصر تحرّك بعد النقر → يُقاس موضعه الجديد بعد الاستقرار لا القديم', () => {
    const el = stubElement({ x: 0, y: 100, w: 200, h: 44 })
    let got: { x: number; y: number } | null = null
    rectAfterSettle(el, 160, (r) => {
      got = r
    })
    // قبل انقضاء المهلة: لا قياس إطلاقًا
    expect(got).toBeNull()
    // تخطيط الصفحة انزاح بعد النقر (كما في لوحات SPA)
    Object.assign(el, { getBoundingClientRect: () => ({ x: 0, y: 144, width: 200, height: 44 }) as DOMRect })
    vi.advanceTimersByTime(160)
    expect(got).toEqual({ x: 0, y: 144, w: 200, h: 44 })
  })

  it('عنصر استُبدل أثناء الاستقرار (React أعاد بناءه) → null فيستخدم المتصل مستطيل لحظة النقر', () => {
    const el = stubElement({ x: 5, y: 5, w: 10, h: 10 })
    let got: unknown = 'unset'
    rectAfterSettle(el, 160, (r) => {
      got = r
    })
    ;(el as { isConnected: boolean }).isConnected = false
    vi.advanceTimersByTime(160)
    expect(got).toBeNull()
  })
})
