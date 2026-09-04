/**
 * أدوات تنسيق للعرض — وقت نسبي عربي، ومدة، ومضيف الرابط.
 * كل الكلمات عبر t() (لا نص واجهة مضمّن)، والأرقام بالهندية الشرقية.
 */
import { t, type TKey } from '../i18n'

/** رقم بالأرقام العربية الشرقية (٠١٢…) */
function ar(n: number): string {
  return Math.round(n).toLocaleString('ar-EG')
}

/** رقم شرقي للعدادات المعروضة (الشريط الجانبي وشريط الإحصاءات) */
export function arDigits(n: number): string {
  return ar(n)
}

/** مضيف الرابط بلا www — لرقاقة موقع الدليل (مثل «localhost») */
export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '') || null
  } catch {
    return null
  }
}

/** وقت نسبي عربي مقروء: «الآن» أو «قبل ٣ ساعات»… من طابع ISO */
export function relativeTimeAr(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return ''
  const sec = Math.max(0, (now - then) / 1000)
  const pick = (key: TKey, value: number) => t(key, { count: ar(value) })
  if (sec < 45) return t('fmt.now')
  const min = sec / 60
  if (min < 60) return pick('fmt.minutesAgo', min)
  const hr = min / 60
  if (hr < 24) return pick('fmt.hoursAgo', hr)
  const day = hr / 24
  if (day < 30) return pick('fmt.daysAgo', day)
  const month = day / 30
  if (month < 12) return pick('fmt.monthsAgo', month)
  return pick('fmt.yearsAgo', month / 12)
}

/** مدة مقروءة من مللي ثانية: «٢٠ ثانية» أو «٣ دقائق» */
export function durationAr(ms: number): string {
  const sec = Math.max(0, ms / 1000)
  if (sec < 60) return t('fmt.seconds', { count: ar(sec) })
  return t('fmt.minutes', { count: ar(sec / 60) })
}

/** مدة الدليل: من الصوت إن وُجد، وإلا من مدى ts بين أول وآخر خطوة */
export function guideDurationMs(steps: Array<{ ts: number }>, audioMs?: number): number {
  if (audioMs && audioMs > 0) return audioMs
  if (steps.length < 2) return 0
  const times = steps.map((s) => s.ts).filter((n) => Number.isFinite(n))
  if (times.length < 2) return 0
  return Math.max(0, Math.max(...times) - Math.min(...times))
}

/** اسم مالك مشتق من البريد (لا اسم/صورة في MeDto) — الجزء قبل @ بحرف كبير */
export function ownerNameFromEmail(email: string | undefined): string {
  if (!email) return ''
  const local = email.split('@')[0] ?? ''
  return local.charAt(0).toUpperCase() + local.slice(1)
}

/** اسم الدور المساحي بالعربية — أسرة `home.role*` وحدها (نصوص `team.role*` مطابقة لها حرفيًا)، وmember القديم يُطَّع منشئًا */
export function roleLabelAr(role: string): string {
  const key = role === 'admin' ? 'home.roleAdmin' : role === 'viewer' ? 'home.roleViewer' : 'home.roleCreator'
  return t(key)
}

const hijriFmt = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', { dateStyle: 'medium' })
const gregFmt = new Intl.DateTimeFormat('ar', { dateStyle: 'medium' })

/** تاريخ هجري (أم القرى) للقوائم والنتائج — سلسلة فارغة إن كان الطابع غير صالح */
export function hijriDateAr(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : hijriFmt.format(d)
}

/** تاريخ مزدوج للتلميح: «هجري · ميلادي» */
export function dualDateAr(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${hijriFmt.format(d)} · ${gregFmt.format(d)}`
}

/** نسخ للحافظة — false عند الرفض (متصفح ويب فيو) فيعرض النداء الرابط نفسه بصدق */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
