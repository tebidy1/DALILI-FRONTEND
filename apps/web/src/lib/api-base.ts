/**
 * أصل الـAPI. فارغ محليًّا = مسارات نسبية عبر بروكسي Vite (8787 أو لارافل 8790).
 * في الإنتاج الويب (`daleel.*`) والـAPI (`apidaleel.*`) على دومينين بلا بروكسي —
 * يُضبط `VITE_API_BASE` وقت البناء (ملف `apps/web/.env.production`، غير متتبَّع).
 */
export const API_BASE = ((import.meta.env.VITE_API_BASE as string | undefined) ?? '').trim().replace(/\/+$/, '')

/** الأصل الذي يقدّم `/files/:id` — أصل الـAPI إن فُصل عن الويب، وإلا أصل الصفحة (البروكسي) */
export function filesOrigin(): string {
  return API_BASE || window.location.origin
}
