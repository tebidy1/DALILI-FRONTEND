/**
 * لغة الواجهة (I18N-01): مرآة theme.ts — الاختيار يُطبَّق فورًا على
 * <html lang/dir> ويُحفظ محليًا، وقيمة الخادم (myLocale) هي الحقيقة عند الاتصال.
 */
import { setI18nLocale, t } from '../i18n'

export type Locale = 'ar' | 'en'
export const LOCALE_KEY = 'dalili:locale'
const VALID: readonly Locale[] = ['ar', 'en']

const listeners = new Set<() => void>()

/** المحفوظ لهذا الجهاز — القيمة الغريبة أو غياب التخزين = العربية */
export function readLocale(): Locale {
  try {
    const v = localStorage.getItem(LOCALE_KEY)
    return VALID.includes(v as Locale) ? (v as Locale) : 'ar'
  } catch {
    return 'ar'
  }
}

/** اللغة المطبّقة الآن — تُقرأ من <html> فهي مصدر الحقيقة للعرض */
export function getLocale(): Locale {
  return document.documentElement.lang === 'en' ? 'en' : 'ar'
}

/** تطبيق اللغة على <html> وقاموس t() — بلا كتابة */
export function applyLocale(locale: Locale): void {
  const html = document.documentElement
  html.lang = locale
  html.dir = locale === 'en' ? 'ltr' : 'rtl'
  setI18nLocale(locale)
  document.title = t('doc.title')
}

/** حفظ الاختيار وتطبيقه وإشعار المشتركين (إعادة رسم الشجرة) */
export function setLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_KEY, locale)
  } catch {
    // التخزين مرفوض (وضع خاص) — التطبيق الفوري يكفي لهذه الجلسة
  }
  applyLocale(locale)
  for (const fn of listeners) fn()
}

export function subscribeLocale(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** مزامنة الخادم: قيمته هي الحقيقة — إن اختلفت طُبِّقت وحُفظت (نمط applyServerTheme) */
export function applyServerLocale(server: Locale): boolean {
  if (server === readLocale()) return false
  setLocale(server)
  return true
}
