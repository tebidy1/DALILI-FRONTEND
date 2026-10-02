import { describe, expect, it } from 'vitest'
import { guideDurationMs } from './format'

/**
 * سطر بيانات الدليل (العارض والمحرر) يعرض المدة من مدى طوابع الخطوات. أدلة مسجِّل
 * الديسكتوب تخلط ساعتين: طوابع المستشعرات (ملّي ثانية منذ إقلاع الجهاز ≈ ٦٦ مليونًا)
 * وطوابع خطوات الانتقال (`Date.now()` ≈ ١٫٧٩ تريليون) — فكان المدى «٢٩ مليون دقيقة».
 */
describe('guideDurationMs — مدة معقولة مهما اختلطت الساعات', () => {
  const step = (ts: number) => ({ ts })

  it('ساعة واحدة (طوابع epoch): المدى بين أول وآخر خطوة', () => {
    const t0 = 1_790_000_000_000
    expect(guideDurationMs([step(t0), step(t0 + 20_000), step(t0 + 95_000)])).toBe(95_000)
  })

  it('الصوت إن وُجد يغلب مدى الطوابع', () => {
    expect(guideDurationMs([step(1), step(2)], 60_000)).toBe(60_000)
  })

  it('ساعتان مختلطتان: المدى من المجموعة الأكبر وحدها — لا فرق بين ساعتين', () => {
    const steps = [
      step(66_453_623.97),
      step(66_460_423.76),
      step(66_465_458.01),
      step(1_790_366_370_082),
      step(1_790_366_384_465),
      step(66_484_649.82),
    ]
    expect(Math.round(guideDurationMs(steps))).toBe(31_026)
  })

  it('خطوة واحدة أو طوابع ناقصة → صفر (لا مدة تُعرض)', () => {
    expect(guideDurationMs([step(5)])).toBe(0)
    expect(guideDurationMs([{ ts: undefined as unknown as number }, { ts: Number.NaN }])).toBe(0)
  })
})
