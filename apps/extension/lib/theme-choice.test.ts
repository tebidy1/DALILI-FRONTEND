import { describe, expect, it } from 'vitest'
import { normalizeChoice, reconcileChoice } from './theme-choice'

/**
 * مزامنة الثيم في الامتداد (2026-09-06): الخيار المخزَّن محليًا للعرض الفوري،
 * وقيمة الخادم (myTheme من overview) هي الحقيقة إن وُجدت — الموقع والامتداد
 * يتبعان نفس الخيار المخزَّن على الخادم لكل مستخدم.
 */

describe('normalizeChoice — تطبيع القيمة المخزَّنة محليًا', () => {
  it('brand يُقبل كما هو', () => {
    expect(normalizeChoice('brand')).toBe('brand')
  })

  it('الامتداد وُلد جرافيتيًا — الغريب والناقص يرجعان classic', () => {
    expect(normalizeChoice('classic')).toBe('classic')
    expect(normalizeChoice('neon')).toBe('classic')
    expect(normalizeChoice(undefined)).toBe('classic')
    expect(normalizeChoice(42)).toBe('classic')
  })
})

describe('reconcileChoice — قيمة الخادم هي الحقيقة', () => {
  it('خادم brand فوق كاش classic → يتحول للهوية الجديدة ويُعلن التغيير', () => {
    expect(reconcileChoice('classic', 'brand')).toEqual({ choice: 'brand', changed: true })
  })

  it('خادم classic فوق كاش brand → يرجع للجرافيت', () => {
    expect(reconcileChoice('brand', 'classic')).toEqual({ choice: 'classic', changed: true })
  })

  it('تطابق القيمتين → بلا تغيير (لا إعادة حقن ولا كتابة)', () => {
    expect(reconcileChoice('brand', 'brand')).toEqual({ choice: 'brand', changed: false })
    expect(reconcileChoice('classic', 'classic')).toEqual({ choice: 'classic', changed: false })
  })

  it('بلا قيمة خادم (غير مسجل/فشل النداء) → الكاش كما هو، بلا تغيير', () => {
    expect(reconcileChoice('classic', undefined)).toEqual({ choice: 'classic', changed: false })
  })
})
