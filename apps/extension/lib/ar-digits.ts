/**
 * الأرقام الهندية الشرقية — نسخة واحدة لكل واجهات الامتداد (المكتشف/الأحدث/بطاقة التدريب).
 * I18N-01: في الوضع الإنجليزي تُعاد الأرقام اللاتينية — الاسم باقٍ لمواضعه كثيرتها.
 */
import { i18nLocale } from './i18n'

const AR_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩']

export function toArabicDigits(n: number): string {
  if (i18nLocale() === 'en') return String(n)
  return String(n).replace(/\d/g, (d) => AR_DIGITS[Number(d)]!)
}
