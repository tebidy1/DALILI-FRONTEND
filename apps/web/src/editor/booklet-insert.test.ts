import { describe, expect, it } from 'vitest'
import { newBlockStep } from './booklet-insert'

describe('newBlockStep — كتلة جديدة صالحة للعقد (BKL-01)', () => {
  it('كتلة النص تولد فقرة فارغة جاهزة للكتابة لا rich غائبًا', () => {
    const s = newBlockStep('text')
    expect(s.block).toBe('text')
    expect(s.rich).toEqual([{ para: 'p', runs: [{ text: '' }] }])
    expect(s.url).toBe('')
    expect(s.sensitive).toBe(false)
  })

  it('كتلة التضمين تحمل المعرّف والعنوان ومطوية افتراضيًا', () => {
    const s = newBlockStep('embed', { guideId: 'g1', title: 'دليل الفوترة' })
    expect(s.embed).toEqual({ guideId: 'g1', expanded: false })
    expect(s.title).toBe('دليل الفوترة')
  })

  it('الفاصل والصورة والرابط بلا حقول زائدة', () => {
    for (const k of ['divider', 'image', 'link'] as const) {
      const s = newBlockStep(k)
      expect(s.block).toBe(k)
      expect(s.rich).toBeUndefined()
      expect(s.embed).toBeUndefined()
    }
  })

  // BKL-07: التنبيه جملة يكتبها صاحبها لا حقلا عنوان وملاحظة (طلب المالك 2026-09-07)
  it('التنبيه والتحذير يولدان جملة فارغة بلا عنوان مفروض', () => {
    for (const k of ['tip', 'alert'] as const) {
      const s = newBlockStep(k)
      expect(s.block).toBe(k)
      expect(s.title).toBe('')
      expect(s.note).toBeUndefined()
      expect(s.rich).toEqual([{ para: 'p', runs: [{ text: '' }] }])
    }
  })

  it('الهيدر يحمل تسميته العربية', () => {
    expect(newBlockStep('header').title).toBe('عنوان قسم')
  })

  it('كتلة الفيديو تُنشأ فارغة الرابط جاهزة للصق', () => {
    const s = newBlockStep('video')
    expect(s.block).toBe('video')
    expect(s.url).toBe('')
  })

  it('الخطوة اليدوية بلا block فتُرقَّم كخطوة عادية', () => {
    const s = newBlockStep('step')
    expect(s.block).toBeUndefined()
    expect(s.title).toBe('')
  })

  it('كل كتلة تأخذ معرّفًا فريدًا', () => {
    expect(newBlockStep('text').id).not.toBe(newBlockStep('text').id)
  })
})
