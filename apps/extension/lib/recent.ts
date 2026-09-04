import { normalizeFa } from '@dalili/core'
import { toArabicDigits } from './ar-digits'

/** الحد الأدنى من دليل تعرضه اللوحة في «الأدلة الأخيرة» */
export interface RecentGuide {
  id: string
  title: string
  updatedAt: string
  stepCount: number
}

/** تصفية فورية بالعنوان بعد تطبيع عربي (همزة/تاء مربوطة/تشكيل) — استعلام فارغ يعيد الكل */
export function filterByTitle<T extends { title: string }>(list: T[], query: string): T[] {
  const q = normalizeFa(query).trim()
  if (!q) return list
  return list.filter((g) => normalizeFa(g.title).includes(q))
}

/** رابط صفحة البحث الكامل في الويب — null للاستعلام الفارغ (لا فتح بلا كلمة) */
export function searchHref(webBase: string, query: string): string | null {
  const q = query.trim()
  if (!q) return null
  return `${webBase}/search?q=${encodeURIComponent(q)}`
}

/** زمن نسبي عربي مختصر بأرقام عربية — «الآن» تحت الدقيقة، ثم دقيقة/ساعة/يوم */
export function relativeTimeAr(iso: string, now = Date.now()): string {
  const diff = now - Date.parse(iso)
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'الآن'
  if (min < 60) return `منذ ${toArabicDigits(min)} دقيقة`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `منذ ${toArabicDigits(hr)} ساعة`
  const day = Math.floor(hr / 24)
  return `منذ ${toArabicDigits(day)} يوم`
}
