import { describe, expect, it } from 'vitest'
import { ar, arDigits, en, i18nLocale, setI18nLocale, t, type TKey } from './i18n'

// I18N-01: بوابة التعادل في الديسكتوب + سلوك t()/الأرقام باللغتين (نقيّ بلا DOM)

const VARS = /\{(\w+)\}/g
const varsOf = (s: string) => [...s.matchAll(VARS)].map((m) => m[1]).sort()

describe('desktop i18n parity (ar ⇄ en)', () => {
  const keys = Object.keys(ar) as TKey[]

  it('كل مفتاح عربي له مقابل إنجليزي والعكس', () => {
    const missing = keys.filter((k) => en[k] === undefined)
    expect(missing, `ناقص في en: ${missing.join(', ')}`).toEqual([])
    const arSet = new Set<string>(keys)
    expect(Object.keys(en).filter((k) => !arSet.has(k))).toEqual([])
  })

  it('متغيرات الاستيفاء نفسها بين اللغتين', () => {
    const bad: string[] = []
    for (const k of keys) {
      if (JSON.stringify(varsOf(ar[k])) !== JSON.stringify(varsOf(en[k]))) bad.push(k)
    }
    expect(bad, `متغيرات مختلفة في: ${bad.join(', ')}`).toEqual([])
  })
})

describe('t() والأرقام باللغتين', () => {
  it('الافتراضي عربي — والقبوع عليه', () => {
    expect(i18nLocale()).toBe('ar')
    expect(t('dt.capture')).toBe('التقاط')
    expect(t('dt.stepN', { n: arDigits(3) })).toBe('الخطوة ٣')
    expect(arDigits(12)).toBe('١٢')
  })

  it('الوضع الإنجليزي: نصوص لاتينية وأرقام لاتينية', () => {
    setI18nLocale('en')
    expect(t('dt.capture')).toBe('Capture')
    expect(t('dt.popTitle')).toBe('ITQAN — Control')
    expect(t('dt.stepsN', { n: arDigits(5) })).toBe('5 steps')
    expect(arDigits(12)).toBe('12')
    setI18nLocale('ar')
    expect(t('dt.capture')).toBe('التقاط')
  })
})
