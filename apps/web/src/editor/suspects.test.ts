import { describe, expect, it } from 'vitest'
import { scanText, stepSuspects } from './suspects'
import type { StepDto } from '@dalili/shared'

describe('رادار الطمس التلقائي — الأنماط الافتراضية', () => {
  it('يلتقط الآيبان السعودي وسط نص عربي', () => {
    const hits = scanText('تم التحويل إلى SA0380000000608010167519 أمس')
    expect(hits.some((s) => s.kind === 'iban' && s.sample === 'SA0380000000608010167519')).toBe(true)
  })

  it('يلتقط رقم الهوية والجوال بصيغتيهما والبريد', () => {
    const hits = scanText('الهوية 1234567890، الجوال 0512345678 أو +966512345678، راسل a.b@company.co')
    expect(hits.some((s) => s.kind === 'nid')).toBe(true)
    expect(hits.filter((s) => s.kind === 'phone').length).toBe(2)
    expect(hits.some((s) => s.kind === 'email' && s.sample === 'a.b@company.co')).toBe(true)
  })

  it('النص العربي البريء بلا أرقام معلومة يمر بلا شكوك', () => {
    expect(scanText('انقر على «حفظ التعديلات» في شاشة الإعدادات')).toEqual([])
  })

  it('لا يلتهم رقمًا أطول من عشرة بحدود الكلمات (هوية زائفة)', () => {
    expect(scanText('طابع زمني 12345678901')).toEqual([])
  })

  it('يلتقط بريدًا خالدًا', () => {
    expect(scanText('owner@itqan.sa').some((s) => s.kind === 'email')).toBe(true)
  })
})

describe('رادار الطمس — من حقائق الخطوة المخزّنة', () => {
  const base = { id: 's1', kind: 'step' } as unknown as StepDto

  it('يفكّ نص JSON المعتم (target) ويمسح تسمياته', () => {
    const step = {
      ...base,
      title: 'انقر هنا',
      target: JSON.stringify({ text: 'حساب SA0380000000608010167519', role: 'Text' }),
    } as unknown as StepDto
    const hits = stepSuspects(step)
    expect(hits.some((s) => s.kind === 'iban')).toBe(true)
  })

  it('يمسح عنوان النافذة من source والنص الخام غير JSON أيضًا', () => {
    const step = {
      ...base,
      target: 'سطر حر غير JSON فيه 0550000001',
      source: JSON.stringify({ windowTitle: 'مصروفات العميل - 1234567890' }),
    } as unknown as StepDto
    const hits = stepSuspects(step)
    expect(hits.some((s) => s.kind === 'phone' && s.sample === '0550000001')).toBe(true)
    expect(hits.some((s) => s.kind === 'nid')).toBe(true)
  })

  it('خطوة بلا نصوص حساسة تعود نظيفة', () => {
    const step = {
      ...base,
      title: 'انقر على «حفظ»',
      target: JSON.stringify({ text: 'حفظ', role: 'Button' }),
      source: JSON.stringify({ windowTitle: 'المفكرة' }),
    } as unknown as StepDto
    expect(stepSuspects(step)).toEqual([])
  })

  it('سقف الشارة أربع شكوك لا يُتجاوز مهما تعدّدت الإصابات', () => {
    const step = {
      ...base,
      title: 'a1@x.co a2@x.co a3@x.co a4@x.co a5@x.co 0512345678',
    } as unknown as StepDto
    expect(stepSuspects(step).length).toBeLessThanOrEqual(4)
  })
})
