import { describe, expect, it } from 'vitest'
import type { StepDto } from '@dalili/shared'
import { calloutHasText, calloutRich } from './callout'

const step = (over: Partial<StepDto>): StepDto => ({
  id: 'c1',
  kind: 'navigate',
  title: '',
  target: {},
  sensitive: false,
  url: '',
  pageTitle: '',
  ts: 1,
  block: 'tip',
  ...over,
})

describe('calloutRich — التنبيه جملةً لا حقلين (BKL-07)', () => {
  it('الجملة المنسّقة تُعاد كما هي حين توجد', () => {
    const rich = [{ para: 'p' as const, runs: [{ text: 'اطلب الصلاحية' }] }]
    expect(calloutRich(step({ rich }))).toBe(rich)
  })

  it('الكتلة القديمة تُقرأ جملةً: العنوان عريضًا ثم الملاحظة — بلا تعديل مخزونها', () => {
    const legacy = step({ title: 'انتبه', note: 'لا تحذف الفاتورة' })
    expect(calloutRich(legacy)).toEqual([
      { para: 'p', runs: [{ text: 'انتبه', b: true }, { text: ' — لا تحذف الفاتورة' }] },
    ])
    // لا كتابة في الخطوة نفسها: التحويل قراءةٌ لا ترحيل
    expect(legacy.rich).toBeUndefined()
  })

  it('العنوان وحده أو الملاحظة وحدها يعملان', () => {
    expect(calloutRich(step({ title: 'انتبه' }))).toEqual([{ para: 'p', runs: [{ text: 'انتبه', b: true }] }])
    expect(calloutRich(step({ note: 'تنبيه فقط' }))).toEqual([{ para: 'p', runs: [{ text: 'تنبيه فقط' }] }])
  })

  it('الكتلة الفارغة تعطي فقرة فارغة جاهزة للكتابة لا فراغًا', () => {
    expect(calloutRich(step({}))).toEqual([{ para: 'p', runs: [{ text: '' }] }])
    expect(calloutHasText(step({}))).toBe(false)
    expect(calloutHasText(step({ title: 'انتبه' }))).toBe(true)
  })
})
