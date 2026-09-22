import { describe, expect, it } from 'vitest'
import { createHistory } from './history'

/** EDT-10: مكدس تراجع/إعادة — دفع مع دمج متتابع، سقف، وتراجع/إعادة متناوبان */
describe('createHistory', () => {
  it('دفع ثم تراجع يعيد الحالة السابقة، وإعادة يعيد اللاحقة', () => {
    const h = createHistory<string>()
    expect(h.undo()).toBeNull() // لا شيء للتراجع عنه — صادق لا استثناء
    h.push('a')
    h.push('b')
    expect(h.undo()).toBe('a')
    expect(h.redo()).toBe('b')
    expect(h.redo()).toBeNull() // لا شيء بعد الأخير
  })

  it('الدمج المتتابع: نفس المفتاح داخل النافذة يستبدل القمة لا يراكمها', () => {
    const h = createHistory<string>()
    h.push('بداية')
    h.push('ك', 'title')
    h.push('كتب', 'title')
    h.push('كتبت', 'title')
    h.push('شيء آخر', 'other')
    // تراجعة تعيد ما قبل «شيء آخر»، وتراجعة ثانية تعيد ما قبل سلسلة الكتابة كلها
    expect(h.undo()).toBe('كتبت')
    expect(h.undo()).toBe('بداية')
  })

  it('دفع جديد بعد تراجع يقطع فرع الإعادة (لا ظلال ماضٍ مزيف)', () => {
    const h = createHistory<string>()
    h.push('1')
    h.push('2')
    h.push('3')
    expect(h.undo()).toBe('2')
    h.push('بديل')
    expect(h.redo()).toBeNull()
    expect(h.undo()).toBe('2')
  })

  it('السقف 50: الأقدم يُطاح عندما يتجاوز المكدس الحد', () => {
    const h = createHistory<number>()
    for (let i = 0; i <= 60; i++) h.push(i)
    let undos = 0
    while (h.undo() !== null && undos < 200) undos++
    // 61 دفعة بلا دمج → آخر 50 تبقى (11..60) → 49 تراجعة متاحة
    expect(undos).toBe(49)
    expect(h.undo()).toBeNull()
  })
})
