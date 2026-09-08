import type { GuideDto } from '@dalili/shared'
import { urlTokens } from '@dalili/core'
import type { TrainResult, TrainSession, TrainStep, TrainStats } from './protocol'

/** دربني — المنطق النقي لخطة التدريب وتقدّمها وإحصائها (GM-01..03).
 *  كل chrome.* يعيش في الخلفية؛ هذا الملف قابل للفحص بلا بيئة متصفح. */

/**
 * LX-01: نمط تبويب التدريب.
 *  - reuse-here: تبويب مفتوح على الشاشة الهدف → تدرّب فوقه بلا فتح ولا انتقال.
 *  - reuse-navigate: تبويب على نفس الموقع (جلسة حيّة) لكن شاشة مختلفة → انتقل به للهدف.
 *  - open-new: الموقع غير مفتوح → افتح تبويبًا واحدًا على الهدف.
 * المطابقة الفعلية للجهوزية تبقى للمرساة داخل الصفحة؛ هذا يختار التبويب فقط. */
export type TrainTargetMode = 'reuse-here' | 'reuse-navigate' | 'open-new'

/**
 * هل الرابط الحالي على الشاشة الهدف؟ = نفس المضيف وكل رموز شاشة الهدف حاضرة فيه.
 * مصدر الحقيقة الواحد للمطابقة: يستعمله اختيار التبويب (خلفية) وبوّابة الجهوزية (محتوى).
 */
export function onTargetScreen(hereUrl: string | undefined, targetUrl: string): boolean {
  const here = hereUrl ? urlTokens(hereUrl) : { host: '', screen: [] }
  const target = urlTokens(targetUrl)
  if (!here.host || !target.host || here.host !== target.host) return false
  const have = new Set(here.screen.map((t) => t.toLowerCase()))
  return target.screen.map((t) => t.toLowerCase()).every((t) => have.has(t))
}

export interface TrainTabRef {
  id?: number
  url?: string
}
export interface TrainTabChoice {
  mode: TrainTargetMode
  tabId: number | null
}

/**
 * يختار تبويب التدريب من كل التبويبات المفتوحة — الأقرب للهدف أولًا (LX-01).
 * «دربني» يُطلَق من صفحة دليلي، لا من التطبيق الهدف؛ لذا نبحث كل التبويبات لا النشط وحده:
 *  ١) تبويب على الشاشة الهدف نفسها → تدرّب فوقه.  ٢) تبويب على نفس الموقع (مسجّل دخول) → انتقل به.
 *  ٣) لا شيء → افتح تبويبًا جديدًا (ثم تُدار الجهوزية/الدخول ببوّابة المرساة داخل الصفحة).
 */
export function pickTrainTab(tabs: TrainTabRef[], firstUrl: string): TrainTabChoice {
  const usable = tabs.filter((t): t is TrainTabRef & { id: number; url: string } => t.id != null && !!t.url)
  const onScreen = usable.find((t) => onTargetScreen(t.url, firstUrl))
  if (onScreen) return { mode: 'reuse-here', tabId: onScreen.id }
  const host = urlTokens(firstUrl).host
  const sameHost = host ? usable.find((t) => urlTokens(t.url).host === host) : undefined
  if (sameHost) return { mode: 'reuse-navigate', tabId: sameHost.id }
  return { mode: 'open-new', tabId: null }
}

/** خطوات navigate انتقالات سياقية لا أفعال مستخدم — تدريب يقف على الأفعال ذات المرساة فقط */
export function buildTrainPlan(guide: GuideDto): TrainStep[] {
  const steps: TrainStep[] = []
  for (const s of guide.steps) {
    if (s.kind === 'navigate') continue
    const anchor = s.target?.anchor
    if (!anchor || anchor.length === 0) continue
    steps.push({ id: s.id, kind: s.kind, title: s.title, note: s.note, anchor, url: s.url })
  }
  return steps
}

/** نتيجة تقدّم واحدة: جلسة جديدة أو جلسة منتهية بقرار اكتمالها (GM-03) */
export interface TrainAdvance {
  session: TrainSession
  finished: boolean
  completed: boolean
}

/** عتبة إكمال الإيقاف المبكر — الإكمال = كل الخطوات أو ≥80٪ منها */
const STOP_COMPLETION_RATIO = 0.8

export function advanceTrain(session: TrainSession, result: TrainResult): TrainAdvance {
  if (result === 'stop') {
    const ratio = session.idx / Math.max(1, session.steps.length)
    return { session, finished: true, completed: ratio >= STOP_COMPLETION_RATIO }
  }
  const idx = Math.min(session.idx + 1, session.steps.length)
  const finished = idx >= session.steps.length
  return { session: { ...session, idx }, finished, completed: finished }
}

/** تقدّم مجمّع لكل دليل — أرقام بلا هويات (GM-03) */
export function bumpTrainStats(prev: TrainStats | undefined, completed: boolean): TrainStats {
  return { runs: (prev?.runs ?? 0) + 1, completed: (prev?.completed ?? 0) + (completed ? 1 : 0) }
}

/** RC3: إعادة محاولة محدودة — «اكتمال التحميل» يسبق جهوزية سكربت المحتوى أحيانًا
 *  فتُرفض الرسالة الأولى؛ نعيد بفواصل قصيرة حتى نهاية المحاولات أو shouldStop.
 *  بلا حلقة أبدية: النتيجة false عند النفاد (قانون لا تعليق أبدًا). */
export async function retryUntil(
  attempt: () => Promise<unknown>,
  opts: { attempts: number; intervalMs: number; shouldStop?: () => boolean },
): Promise<boolean> {
  for (let i = 0; i < opts.attempts; i++) {
    if (opts.shouldStop?.()) return false
    try {
      await attempt()
      return true
    } catch {
      // آخر محاولة؟ لا انتظار بعدها
      if (i === opts.attempts - 1) return false
    }
    await new Promise((r) => setTimeout(r, opts.intervalMs))
  }
  return false
}
