/**
 * SRCH-04: المنطق النقي لشارة الاكتشاف — نطاق التبويب النشط
 * وصياغة عدده عربيًا. الجزء المتصل (tabs/العميل) في اللوحة الجانبية.
 */
import { toArabicDigits } from './ar-digits'
import { t } from './i18n'

/** نطاق الرابط أو null لما ليس صفحة ويب (chrome:// وfile:// وغيره) */
export function hostOf(url: string): string | null {
  try {
    const u = new URL(url)
    // المضيف الفارغ يظهر في about:blank — ليس موقعًا
    if (!u.hostname || !/^https?:$/.test(u.protocol)) return null
    return u.hostname
  } catch {
    return null
  }
}

/** «دليل واحد / دليلان / ٣ أدلة / ١١ دليلًا» — قواعد العدد العربية، وإنجليزية I18N-01 */
export function guidesCountAr(n: number): string {
  if (n === 1) return t('ext.guidesOne')
  if (n === 2) return t('ext.guidesTwo')
  if (n >= 3 && n <= 10) return t('ext.guidesFew', { count: toArabicDigits(n) })
  return t('ext.guidesMany', { count: toArabicDigits(n) })
}
