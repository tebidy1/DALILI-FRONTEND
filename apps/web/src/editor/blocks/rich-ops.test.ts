import { describe, expect, it } from 'vitest'
import { paraText, setPara, toggleMark } from './rich-ops'
import type { RichTextDto } from '@dalili/shared'

const one: RichTextDto = [{ para: 'p', runs: [{ text: 'مرحبا يا عالم' }] }]

describe('paraText — النص المسطّح الذي تُحسب عليه فهارس التحديد', () => {
  it('يلصق القطع بلا فواصل', () => {
    expect(paraText([{ text: 'أ' }, { text: 'ب', b: true }, { text: 'ج' }])).toBe('أبج')
  })
})

describe('toggleMark — تعليم جزء من الفقرة', () => {
  it('يشطر القطعة ثلاثًا ويعلّم الوسطى وحدها', () => {
    const out = toggleMark(one, 0, 7, 9, 'b')
    expect(out[0]?.runs).toEqual([{ text: 'مرحبا ي' }, { text: 'ا ', b: true }, { text: 'عالم' }])
  })

  it('تعليم مُعلَّم يزيله (تبديل لا تكديس)', () => {
    const marked = toggleMark(one, 0, 0, 5, 'b')
    const back = toggleMark(marked, 0, 0, 5, 'b')
    expect(back[0]?.runs.every((r) => !r.b)).toBe(true)
  })

  it('التعليم مرتين يعيد النص إلى قطعة واحدة مدموجة لا ثلاث', () => {
    const marked = toggleMark(one, 0, 0, 5, 'b')
    const back = toggleMark(marked, 0, 0, 5, 'b')
    expect(back[0]?.runs).toHaveLength(1)
    expect(back[0]?.runs[0]?.text).toBe('مرحبا يا عالم')
  })

  it('مدى فارغ أو مقلوب لا يغيّر شيئًا', () => {
    expect(toggleMark(one, 0, 3, 3, 'b')).toEqual(one)
    expect(toggleMark(one, 0, 5, 2, 'b')).toEqual(one)
  })

  it('فهرس فقرة خارج المدى يعيد النص كما هو بلا انهيار', () => {
    expect(toggleMark(one, 9, 0, 3, 'b')).toEqual(one)
  })

  it('المائل مستقل عن العريض — تعليم أحدهما لا يمسّ الآخر', () => {
    const bold = toggleMark(one, 0, 0, 5, 'b')
    const both = toggleMark(bold, 0, 0, 5, 'i')
    expect(both[0]?.runs[0]).toMatchObject({ b: true, i: true })
  })

  it('مدى يعبر قطعتين مختلفتَي الأسلوب يُعلَّم كله', () => {
    const start: RichTextDto = [{ para: 'p', runs: [{ text: 'أبج' }, { text: 'دهـ', i: true }] }]
    const out = toggleMark(start, 0, 1, 5, 'b')
    const marked = out[0]!.runs.filter((r) => r.b).map((r) => r.text).join('')
    expect(marked).toBe('بجده')
  })
})

describe('setPara — تغيير نوع الفقرة', () => {
  it('يبدّل النوع ويبقي القطع كما هي', () => {
    const out = setPara(one, 0, 'h2')
    expect(out[0]?.para).toBe('h2')
    expect(out[0]?.runs).toEqual(one[0]?.runs)
  })

  it('فهرس خارج المدى يعيد النص كما هو بلا انهيار', () => {
    expect(setPara(one, 9, 'h2')).toEqual(one)
  })
})
