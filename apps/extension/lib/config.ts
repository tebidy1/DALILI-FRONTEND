/** PLAT-02: عناوين الخادم والويب بيئيَّان — ثابتا التطوير افتراضًا، ويُبنيان بـ VITE_API_BASE/VITE_WEB_BASE */

export function resolveBase(
  env: Record<string, string | undefined>,
  key: string,
  fallback: string,
): string {
  const raw = env[key]?.trim()
  // http(s) فقط: إعداد بناء خاطئ لا يحقن مخططًا غريبًا في مسارات الرفع والمشاركة
  if (raw && /^https?:\/\//i.test(raw)) return raw.replace(/\/+$/, '')
  return fallback
}

// import.meta.env يوفرها WXT/Vite وقت البناء؛ في بيئة الاختبار العقدية قد تغيب
const env = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {})

export const API_BASE = resolveBase(env, 'VITE_API_BASE', 'http://localhost:8787')
export const WEB_BASE = resolveBase(env, 'VITE_WEB_BASE', 'http://localhost:5174')
