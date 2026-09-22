import { describe, expect, it } from 'vitest'
import { ar } from './i18n'
import { en } from './i18n'

// I18N-01: بوابة التعادل في الإضافة — قانون الاكتمال المطلق بين القاموسين

const VARS = /\{(\w+)\}/g
const varsOf = (s: string) => [...s.matchAll(VARS)].map((m) => m[1]).sort()

describe('extension i18n parity (ar ⇄ en)', () => {
  const keys = Object.keys(ar) as (keyof typeof ar)[]

  it('كل مفتاح عربي له مقابل إنجليزي', () => {
    const missing = keys.filter((k) => en[k] === undefined)
    expect(missing, `ناقص في en: ${missing.join(', ')}`).toEqual([])
  })

  it('لا مفاتيح زائدة في الإنجليزية', () => {
    const arSet = new Set<string>(keys)
    expect(Object.keys(en).filter((k) => !arSet.has(k))).toEqual([])
  })

  it('متغيرات الاستيفاء نفسها في النصوص الثابتة', () => {
    const bad: string[] = []
    for (const k of keys) {
      const ev = en[k]
      if (typeof ev !== 'string') continue // الدوال تلتقط متغيراتها بنوعها
      if (JSON.stringify(varsOf(ar[k])) !== JSON.stringify(varsOf(ev))) bad.push(k)
    }
    expect(bad, `متغيرات مختلفة في: ${bad.join(', ')}`).toEqual([])
  })
})
