import { describe, expect, it } from 'vitest'
import { moveTo } from './reorder'

describe('moveTo — نقل عنصر إلى موضع جديد', () => {
  const a = ['أ', 'ب', 'ج', 'د']

  it('ينقل للأمام ويزيح ما بينهما', () => {
    expect(moveTo(a, 0, 2)).toEqual(['ب', 'ج', 'أ', 'د'])
  })

  it('ينقل للخلف', () => {
    expect(moveTo(a, 3, 1)).toEqual(['أ', 'د', 'ب', 'ج'])
  })

  it('نقل إلى موضعه نفسه لا يغيّر شيئًا ولا يُنشئ مصفوفة مختلفة المحتوى', () => {
    expect(moveTo(a, 2, 2)).toEqual(a)
  })

  it('لا يفسد المصفوفة الأصلية — نقاء', () => {
    const copy = [...a]
    moveTo(a, 0, 3)
    expect(a).toEqual(copy)
  })

  it('فهرس خارج المدى يعيد المصفوفة كما هي بلا رمي', () => {
    expect(moveTo(a, -1, 2)).toEqual(a)
    expect(moveTo(a, 1, 99)).toEqual(a)
  })
})
