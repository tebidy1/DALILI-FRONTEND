import { describe, expect, it } from 'vitest'
import { arDigits, countPhrase, kindLabel } from './panel-text'

/** نصوص لوحة الودجة الموسَّعة — صوت المنتج نفسه: أرقام عربية وتسميات
 *  أنواع مطابقة حرفيًّا للإضافة (parts.tsx kindLabel) */

describe('نصوص لوحة الودجة', () => {
  it('arDigits تحوّل الأرقام اللاتينية إلى عربية للعرض', () => {
    expect(arDigits(0)).toBe('٠')
    expect(arDigits(12)).toBe('١٢')
    expect(arDigits(200)).toBe('٢٠٠')
  })

  it('kindLabel يسمّي أنواع الخطوات كما في الإضافة حرفيًّا', () => {
    expect(kindLabel('click')).toBe('نقرة')
    expect(kindLabel('input')).toBe('إدخال')
    expect(kindLabel('select')).toBe('اختيار')
    expect(kindLabel('toggle')).toBe('تبديل')
    expect(kindLabel('navigate')).toBe('تنقّل')
    expect(kindLabel('keypress')).toBe('مفتاح')
  })

  it('countPhrase تعرض عدد الخطوات بالأرقام العربية', () => {
    expect(countPhrase(0)).toBe('٠ خطوة')
    expect(countPhrase(3)).toBe('٣ خطوة')
    expect(countPhrase(25)).toBe('٢٥ خطوة')
  })
})
