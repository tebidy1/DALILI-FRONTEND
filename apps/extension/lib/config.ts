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

/** منشآ الإنتاج الحيّان — مصدرهما المستودع نفسه */
export const PROD_BASES = {
  api: 'https://apidaleel.sootnote.com',
  web: 'https://daleel.sootnote.com',
} as const

const DEV_BASES = { api: 'http://localhost:8787', web: 'http://localhost:5174' } as const

/**
 * PLAT-05: حزمة المتجر لا يجوز أن تُبنى على localhost. كان الإعداد المحليّ في
 * `.env` — وڤيت يحمّل `.env` في وضع الإنتاج أيضًا، فحزمة المتجر كانت تتعلّق
 * كليًّا بملفّ `.env.production` غير المتتبَّع؛ لو غاب على جهاز آخر لخرجت حزمة
 * إنتاج تكلّم `localhost:5175` بلا أي خطأ. الآن: المحليّ في `.env.development`
 * (وضع التطوير فقط)، و`.env.production` متتبَّع في المستودع، وهذا الافتراضي
 * خطّ الدفاع الأخير — بناء الإنتاج يرتدّ إلى النطاقين الحيّين.
 */
export function defaultBases(env: Record<string, unknown>): { api: string; web: string } {
  const prod = env.PROD === true || env.MODE === 'production'
  return prod ? { api: PROD_BASES.api, web: PROD_BASES.web } : { api: DEV_BASES.api, web: DEV_BASES.web }
}

// import.meta.env يوفرها WXT/Vite وقت البناء؛ في بيئة الاختبار العقدية قد تغيب
const env = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {})
const fallback = defaultBases(env as Record<string, unknown>)

export const API_BASE = resolveBase(env, 'VITE_API_BASE', fallback.api)
export const WEB_BASE = resolveBase(env, 'VITE_WEB_BASE', fallback.web)
