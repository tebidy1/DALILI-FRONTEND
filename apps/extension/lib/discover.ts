/**
 * SRCH-04: المنطق النقي لشارة الاكتشاف — نطاق التبويب النشط
 * وصياغة عدده عربيًا. الجزء المتصل (tabs/العميل) في اللوحة الجانبية.
 */
import { toArabicDigits } from './ar-digits'

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

/** «دليل واحد / دليلان / ٣ أدلة / ١١ دليلًا» — قواعد العدد العربية */
export function guidesCountAr(n: number): string {
  if (n === 1) return 'دليل واحد'
  if (n === 2) return 'دليلان'
  if (n >= 3 && n <= 10) return `${toArabicDigits(n)} أدلة`
  return `${toArabicDigits(n)} دليلًا`
}
