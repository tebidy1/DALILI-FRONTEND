import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * UX-03: تباين الألوان فحص آلي لا رأي — كل زوج (نص/خلفية) مستخدم فعليًا في الواجهة
 * يجب أن يحقق WCAG: ≥4.5:1 للنص العادي. الزوج مُعرَّف من رموز tokens.css،
 * فأي تعديل لوني يكسر التباين يُفشل الاختبار فورًا.
 */

const tokensCss = fs.readFileSync(path.join(__dirname, '..', 'ui', 'tokens.css'), 'utf8')

/** استخراج متغيرات الألوان من tokens.css — المصدر الوحيد */
function parseColors(css: string): Record<string, string> {
  const map: Record<string, string> = {}
  for (const m of css.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    map[m[1]!] = m[2]!.toLowerCase()
  }
  return map
}

function luminance(hex: string): number {
  const n = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * n(1) + 0.7152 * n(3) + 0.0722 * n(5)
}

/** نسبة تباين WCAG بين لونين */
export function contrastRatio(fg: string, bg: string): number {
  const l1 = luminance(fg)
  const l2 = luminance(bg)
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}

const C = parseColors(tokensCss)

/** أزواج (نص ← خلفية) المستخدمة فعليًا في الواجهة */
const TEXT_PAIRS: Array<[string, string, string]> = [
  ['النص الأساسي على الصفحة', C.ink!, C.paper!],
  ['النص الأساسي على البطاقة', C.ink!, C.card!],
  ['النص الثانوي على الصفحة', C.muted!, C.paper!],
  ['النص الثانوي على البطاقة', C.muted!, C.card!],
  ['نص الزر الأساسي على teal-700', C['brand-ink'] ?? '#ffffff', C.brand!],
  ['نص تحذيري على خلفية تحذير', C['warn-ink']!, C['warn-bg']!],
  ['خطر على خلفية خطر', C.danger!, C['danger-bg']!],
  ['نجاح على خلفية نجاح', C.ok!, C['ok-bg']!],
]

describe('UX-03: تباين WCAG مُقاس آليًا', () => {
  it('دالة النسبة نفسها صحيحة — أسود/أبيض = 21', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1)
  })

  it.each(TEXT_PAIRS)('%s يحقق ≥4.5:1', (_name, fg, bg) => {
    const ratio = contrastRatio(fg, bg)
    expect(ratio, `${fg} على ${bg} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5)
  })

  it('حلقة التركيز مرئية على الورق (≥3:1 — معيار مكونات الواجهة)', () => {
    expect(contrastRatio(C.ring!, C.paper!)).toBeGreaterThanOrEqual(3)
  })

  it('كل رموز الألوان الدلالية المعنية معرّفة — لا زوج مبنٍّ على قيمة مفقودة', () => {
    for (const key of ['ink', 'muted', 'paper', 'card', 'brand', 'brand-ink', 'danger', 'danger-bg', 'ok', 'ok-bg', 'warn-ink', 'warn-bg', 'ring']) {
      expect(C[key], `--${key} مفقود من tokens.css`).toBeTruthy()
    }
  })
})
