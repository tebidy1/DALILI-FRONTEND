import { describe, expect, it } from 'vitest'
import { t } from './index'

describe('i18n — t() (UX-06)', () => {
  it('يسترجع النص بمفتاحه', () => {
    expect(t('search.submit')).toBe('ابحث')
  })

  it('يعوّض المتغيرات', () => {
    expect(t('search.stepOf', { no: 14 })).toBe('الخطوة 14')
    expect(t('search.tookMs', { ms: 42 })).toBe('في 42 م.ث')
  })

  it('بلا متغيرات لا يبدّل شيئًا', () => {
    expect(t('palette.placeholder')).not.toContain('{')
  })
})
