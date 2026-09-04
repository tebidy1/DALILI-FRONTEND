/**
 * ترقيع معاملات الرابط — مصدر واحد لكل صفحات الفلترة (الهوم/البحث/الشريط).
 * قيمة فارغة أو null تمسح المفتاح، وأي ترقيع لا يمسّ الصفحة يعيدها لأولها
 * (تغيير المرشّح يصفّر الترقيم وإلا بقيت صفحة فارغة).
 */
export function patchParams(base: URLSearchParams, patch: Record<string, string | null>): URLSearchParams {
  const next = new URLSearchParams(base)
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === '') next.delete(k)
    else next.set(k, v)
  }
  if (!('page' in patch)) next.delete('page')
  return next
}
