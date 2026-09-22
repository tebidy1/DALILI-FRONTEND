import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ar } from './i18n'

// I18N-01: لا عربي حرفيًّا خارج القاموس — بوابة معمارية تمنع الارتداد.
// vitest يجري من جذر الحزمة فprocess.cwd() = apps/extension
const ROOTS = [join(process.cwd(), 'entrypoints'), join(process.cwd(), 'lib')]
/** القاموس نفسه ومزامن اللغة والنطاق الرقمي — واختبارات المصادر (بياناتها عربية مشروعة) */
const ALLOW = new Set(['i18n.ts', 'locale-choice.ts', 'ar-digits.ts'])
/** عربية مقصودة في المصدر (موثقة): تشمّس رسالة الخادم العربية، وحرفية العلامة،
 *  والرقم الشرقي في حشو المؤقت، واسم اللغة «العربية» بلغته في ورقة الإعدادات */
const DELIBERATE = new Set(['App.tsx', 'IdleScreen.tsx', 'parts.tsx', 'Sheets.tsx'])
const ARABIC = /[\u0600-\u06FF]/

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (/\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

describe('i18n coverage (extension)', () => {
  it('لا نص عربي خارج lib/i18n.ts', () => {
    const offenders: string[] = []
    for (const f of ROOTS.flatMap(walk)) {
      const base = f.replaceAll('\\', '/').split('/').pop()!
      if (ALLOW.has(base) || DELIBERATE.has(base)) continue
      const src = readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\r\n/g, '\n') // فخ CRLF: ‏$ لا تطابق قبل \r فيبقى سطر التعليق كاملًا
        .split('\n')
        .map((l) => l.replace(/\/\/.*$/, ''))
        .join('\n')
      if (ARABIC.test(src)) offenders.push(f.slice(process.cwd().length + 1))
    }
    expect(offenders, `ملفات ما تزال بعربية حرفية: ${offenders.join(', ')}`).toEqual([])
  })

  it('كل مفتاح استعماله ممكن — القاموس غير فارغ', () => {
    expect(Object.keys(ar).length).toBeGreaterThan(100)
  })
})
