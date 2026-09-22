/**
 * أساس التدويل (UX-06 → I18N-01): قاموسان ar/en بنفس المفاتيح،
 * وt() واعٍ للغة الحالية. قاعدة صارمة: لا نص واجهة مضمّن في JSX.
 * بوابة التعادل parity.test.ts تمنع أي مفتاح ناقص أو زائد.
 */
import { ar, type TKey } from './ar'
import { en, type TValue, type TVars } from './en'
import type { Locale } from '../lib/locale'

export { ar, type TKey }
export type { TVars, TValue }

let current: Locale = 'ar'

/** تعيين قاموس العرض — يستدعيه applyLocale من lib/locale.ts حصرًا */
export function setI18nLocale(locale: Locale): void {
  current = locale
}

export function i18nLocale(): Locale {
  return current
}

/** استرجاع نص مترجم مع استبدال {متغير} — غياب المفتاح بالإنجليزية يقع على العربي */
export function t(key: TKey, vars?: TVars): string {
  const v: TValue = (current === 'en' ? en[key] : undefined) ?? ar[key]
  let s = typeof v === 'function' ? v(vars ?? {}) : v
  if (vars) {
    for (const [k, val] of Object.entries(vars)) {
      s = s.replaceAll(`{${k}}`, String(val))
    }
  }
  return s
}
