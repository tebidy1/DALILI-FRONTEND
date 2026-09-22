/**
 * مزامنة اللغة (I18N-01): الكاش المحلي (chrome.storage) للعرض الفوري عند
 * الإقلاع، وقيمة الخادم (myLocale في libraryOverview) هي الحقيقة إن وُصلنا —
 * مرآة theme-choice.ts حرفيًا.
 */
import { setI18nLocale, type Locale } from './i18n'

export type { Locale }

export const LOCALE_STORAGE_KEY = 'dalili:locale'

/** الافتراضي عربي دائمًا — القيمة الغريبة تقع عليه */
export function normalizeLocale(v: unknown): Locale {
  return v === 'en' ? 'en' : 'ar'
}

/** قراءة اللغة من التخزين وتعيينها قاموس t() — يستدعيه كل سياق إقلاع */
export async function initI18nLocale(): Promise<Locale> {
  try {
    const got = await chrome.storage.local.get(LOCALE_STORAGE_KEY)
    const locale = normalizeLocale(got[LOCALE_STORAGE_KEY])
    setI18nLocale(locale)
    return locale
  } catch {
    return 'ar'
  }
}

/** كتابة الاختيار على التخزين وتطبيقه فورًا في هذا السياق */
export async function writeLocale(locale: Locale): Promise<void> {
  setI18nLocale(locale)
  try {
    await chrome.storage.local.set({ [LOCALE_STORAGE_KEY]: locale })
  } catch {
    // التخزين مرفوض — التطبيق الفوري يكفي لهذه الجلسة
  }
}

/** قراءة بلا تطبيق — لمصافحة الخادم */
export async function readLocale(): Promise<Locale> {
  try {
    const got = await chrome.storage.local.get(LOCALE_STORAGE_KEY)
    return normalizeLocale(got[LOCALE_STORAGE_KEY])
  } catch {
    return 'ar'
  }
}

/**
 * المفاضلة بين الكاش المحلي وقيمة الخادم — changed يخبر المستدعي هل يعيد
 * التطبيق ويكتب الكاش، أم أن كل شيء متطابق فلا لمسة.
 */
export function reconcileLocale(
  cached: Locale,
  server: Locale | undefined,
): { locale: Locale; changed: boolean } {
  if (server !== 'ar' && server !== 'en') return { locale: cached, changed: false }
  return server === cached ? { locale: cached, changed: false } : { locale: server, changed: true }
}

/** تطبيق اللغة على وثيقة السياق الحالي: lang وdir وعنوان التبويب (I18N-01) */
export function applyDocLocale(locale: Locale, title?: string): void {
  const html = document.documentElement
  html.lang = locale
  html.dir = locale === 'en' ? 'ltr' : 'rtl'
  if (title) document.title = title
}
