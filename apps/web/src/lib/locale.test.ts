import { beforeEach, describe, expect, it } from 'vitest'
import { applyLocale, readLocale, setLocale } from './locale'

describe('locale', () => {
  beforeEach(() => localStorage.clear())

  it('الافتراضي عربي دائمًا', () => {
    expect(readLocale()).toBe('ar')
  })
  it('القيمة الغريبة تقع أصلًا على العربي', () => {
    localStorage.setItem('dalili:locale', 'fr')
    expect(readLocale()).toBe('ar')
  })
  it('setLocale يحفظ ويطبّق الاتجاه واللغة على <html>', () => {
    setLocale('en')
    expect(readLocale()).toBe('en')
    expect(document.documentElement.lang).toBe('en')
    expect(document.documentElement.dir).toBe('ltr')
    setLocale('ar')
    expect(document.documentElement.dir).toBe('rtl')
  })
  it('applyLocale يطبّق بلا كتابة', () => {
    applyLocale('en')
    expect(localStorage.getItem('dalili:locale')).toBe(null)
  })
})
