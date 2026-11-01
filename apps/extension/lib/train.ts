import type { GuideDto, TrainHostsDto } from '@dalili/shared'
import { parseUrl, urlTokens } from '@dalili/core'
import { TRAIN_SHOT_PAD, type TrainOutcome, type TrainResult, type TrainSession, type TrainStep, type TrainStats } from './protocol'
import type { AnchorConfidence } from '@dalili/core'
import { isFieldEntryClick, scopeFromEntryClick, type EntryEnd } from './field-entry'

/** دربني — المنطق النقي لخطة التدريب وتقدّمها وإحصائها (GM-01..03).
 *  كل chrome.* يعيش في الخلفية؛ هذا الملف قابل للفحص بلا بيئة متصفح. */

/**
 * هل الرابط الحالي على الشاشة الهدف؟ = نفس المضيف وكل رموز شاشة الهدف حاضرة فيه.
 * تستعمله بوّابة الجهوزية داخل الصفحة: أول خطوة خارج الشاشة الهدف = انتظار الدخول لا زر مفقود.
 */
export function onTargetScreen(hereUrl: string | undefined, targetUrl: string): boolean {
  const here = hereUrl ? urlTokens(hereUrl) : { host: '', screen: [] }
  const target = urlTokens(targetUrl)
  if (!here.host || !target.host || here.host !== target.host) return false
  const have = new Set(here.screen.map((t) => t.toLowerCase()))
  return target.screen.map((t) => t.toLowerCase()).every((t) => have.has(t))
}

const bareHost = (h: string) => h.toLowerCase().replace(/\.$/, '').replace(/^www\./, '')
/** نمط يطابق المضيف: تماماً، أو النجمة لأي نطاق فرعي لا النطاق نفسه (كـ Systems::matches في الخادم) */
const matchesDomain = (pattern: string, host: string) => {
  const p = bareHost(pattern)
  return p.startsWith('*.') ? host.endsWith(p.slice(1)) : p === host
}

/**
 * ث٣ (§٥.٧): أصل (بروتوكول ومضيف ومنفذ) نسخة شركة الموظف التي يُفتح عليها دليل الشريك، أو null.
 * بطبقات (مراجعة ١): تبويب مفتوح على نطاق صريح للشركة، ثم على نجمة لها، ثم — حين لا نطاق صريح للشركة —
 * على نجمة النظام بشرط ألا يكون نسخة الشريك نفسها؛ وإلا أول نطاق صريح بـ https. تبويب مطابق يحفظ أصله (مراجعة ٣).
 * openUrls بالأحدث وصولاً أولاً.
 */
export function pickTrainHost(t: TrainHostsDto, openUrls: string[]): string | null {
  const tabs = openUrls.flatMap((raw) => {
    const u = parseUrl(raw)
    return u && (u.protocol === 'https:' || u.protocol === 'http:') ? [{ host: bareHost(u.hostname), raw: u.hostname, origin: u.origin }] : []
  })
  const hosts = t.hosts.map(bareHost)
  const from = bareHost(t.from ?? '')
  // النجمة تُطابَق على المضيف كما هو أيضاً: www.alofuq.sa نطاق فرعي لـ *.alofuq.sa
  const anyOf = (patterns: string[], tab: { host: string; raw: string }) => patterns.some((p) => matchesDomain(p, tab.host) || matchesDomain(p, tab.raw))
  const tiers: Array<(tab: { host: string; raw: string }) => boolean> = [(tab) => hosts.includes(tab.host), (tab) => anyOf(t.patterns, tab)]
  if (hosts.length === 0) tiers.push((tab) => tab.host !== from && anyOf(t.systemPatterns ?? [], tab))
  for (const fits of tiers) {
    const hit = tabs.find(fits)
    if (hit) return hit.origin
  }
  return hosts[0] ? `https://${hosts[0]}` : null
}

/** ث٣: شكل hosts القادم من صفحة الويب — سكربت المحتوى لا يرحّل غيره */
export function isTrainHosts(v: unknown): v is TrainHostsDto {
  const strings = (a: unknown) => Array.isArray(a) && a.every((x) => typeof x === 'string')
  const o = v as TrainHostsDto | null
  return !!o && typeof o === 'object' && strings(o.hosts) && strings(o.patterns) && (o.systemPatterns === undefined || strings(o.systemPatterns)) && (o.from === undefined || typeof o.from === 'string')
}

/**
 * ث٣: خطوات موقع الدليل المسجّل (from، وإلا مضيف أول خطوة) تنتقل إلى أصل نسخة الشركة؛ المسار والاستعلام والـhash
 * كما هي. خطوة على مضيف آخر (دخول موحّد) تبقى ولو كانت الأولى (مراجعة ٢).
 */
export function rehostPlan(steps: TrainStep[], from: string | undefined, origin: string): TrainStep[] {
  const to = parseUrl(origin)
  const src = bareHost(from || parseUrl(steps[0]?.url ?? '')?.hostname || '')
  // الدليل على نسخة الشركة نفسها أصلاً: لا تغيير ولا ترقية بروتوكول
  if (!to || !src || bareHost(to.hostname) === src) return steps
  return steps.map((s) => {
    const u = parseUrl(s.url)
    if (!u || bareHost(u.hostname) !== src) return s
    u.protocol = to.protocol
    u.host = to.host
    return { ...s, url: u.toString() }
  })
}

type GuideStep = GuideDto['steps'][number]

const entryEnd = (s: GuideStep): EntryEnd => ({
  kind: s.kind,
  role: s.target?.role,
  url: s.url ?? '',
  anchor: s.target?.anchor,
  rect: s.screenshot && 'mark' in s.screenshot ? s.screenshot.mark?.rect : undefined,
})

/**
 * خطوات navigate انتقالات سياقية لا أفعال مستخدم — تدريب يقف على الأفعال ذات المرساة فقط.
 * و«انقر الحقل» التي تليها «أدخل» فيه تُطوى في الكتابة (field-entry): تصلح الأدلة الملتقطة
 * قبل الطيّ وقت الالتقاط بلا إعادة تسجيل، وترث الكتابةُ اسمَ عمود الخلية مرساةً دلالية.
 */
export function buildTrainPlan(guide: GuideDto): TrainStep[] {
  const steps: TrainStep[] = []
  const src = guide.steps
  for (let i = 0; i < src.length; i++) {
    const s = src[i]!
    if (s.kind === 'navigate') continue
    const next = src[i + 1]
    if (next && isFieldEntryClick(entryEnd(s), entryEnd(next))) continue
    let anchor = s.target?.anchor
    if (!anchor || anchor.length === 0) continue
    const prev = src[i - 1]
    if (prev && isFieldEntryClick(entryEnd(prev), entryEnd(s))) anchor = scopeFromEntryClick(prev.target?.anchor, anchor)
    steps.push({ id: s.id, kind: s.kind, title: s.title, note: s.note, anchor, url: s.url ?? '', shot: shotOf(s) })
  }
  return steps
}

type Rect = { x: number; y: number; w: number; h: number }
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/**
 * ث١: صورة الزر كما سُجّل — من لقطة الخطوة ومستطيل تحديدها. التمويه غير مخبوز في الملف
 * (يُرسم وقت العرض)، فتحديدٌ يمسّ منطقة مموّهة لا يُعرض أبدًا: الصورة قد تكشف ما مُوّه.
 */
function shotOf(s: GuideStep): TrainStep['shot'] {
  const sh = s.screenshot
  if (!sh || !('fileId' in sh) || !sh.fileUrl || !sh.mark) return undefined
  const mark = sh.mark.rect
  // البطاقة تعرض التحديد ± الهامش — فالفحص على المستطيل المعروض نفسه
  const shown = { x: mark.x - TRAIN_SHOT_PAD, y: mark.y - TRAIN_SHOT_PAD, w: mark.w + TRAIN_SHOT_PAD * 2, h: mark.h + TRAIN_SHOT_PAD * 2 }
  if (sh.blurRects.some((b) => overlaps(shown, b))) return undefined
  return { url: sh.fileUrl, mark: { x: mark.x, y: mark.y, w: mark.w, h: mark.h } }
}

/**
 * ث١: تسجيل نتيجة خطوة في موضعها. النتيجة لا تُستبدل إلا ترقيةً من «بإقرار الموظف» إلى
 * «متحقق» — حين يظهر أثر الخطوة بعد «تم». فهرس خارج الخطوات = الجلسة كما هي.
 */
export function recordOutcome(session: TrainSession, msg: { idx: number; outcome: TrainOutcome; confidence: AnchorConfidence | null }): TrainSession {
  const step = session.steps[msg.idx]
  if (!step) return session
  const outcomes = [...(session.outcomes ?? [])]
  const prev = outcomes[msg.idx]
  if (prev && !(prev.outcome === 'declared' && msg.outcome === 'verified')) return session
  outcomes[msg.idx] = { stepId: step.id, outcome: msg.outcome, confidence: msg.confidence }
  return { ...session, outcomes }
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
