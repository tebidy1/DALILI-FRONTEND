/**
 * زر الجرس (2026-09-10): سجل «ما يتطلب انتباهك» في اللوحة. الأحداث الحقيقية التي
 * كانت تظهر لافتةً عابرة (notice) وتختفي — مسودة بعد فشل نشر، فشل تفريغ التعليقات،
 * بلوغ حد الخطوات، تبويب يحتاج F5، ونشر ناجح يستحق مرجعًا دائمًا — تُجمع هنا
 * محليًا فلا تضيع إن غاب المستخدم لحظتها (بطاقة النجاح تزول بعد دقيقتين، الحدث يبقى).
 * لا مصدر خادم ولا إشعارات نظام: الخادم بلا نظام إشعارات بعد، فالجرس صادق بما لديه.
 */

export const EVENTS_KEY = 'dalili:events'
/** سقف ثابت — أرشيف صغير للانتباه لا صندوق بريد */
export const EVENTS_CAP = 20

export type ActivityKind = 'draft' | 'stt' | 'limit' | 'tab' | 'publish'

export interface ActivityEvent {
  id: string
  kind: ActivityKind
  textAr: string
  ts: number
  read: boolean
  /** المرحلة ٣: الجرس يوصلك للحل — رابط الدليل أو ما يقابله إن وُجد */
  href?: string
}

const KINDS: readonly ActivityKind[] = ['draft', 'stt', 'limit', 'tab', 'publish']

/** تخزين غريب أو عنصر ناقص يُهمل بصمت — اللوحة لا تنكسر على بقايا نسخة قديمة */
export function normalizeEvents(v: unknown): ActivityEvent[] {
  if (!Array.isArray(v)) return []
  const out: ActivityEvent[] = []
  for (const e of v) {
    if (!e || typeof e !== 'object') continue
    const o = e as Record<string, unknown>
    if (typeof o.id !== 'string' || typeof o.textAr !== 'string' || typeof o.ts !== 'number') continue
    if (!KINDS.includes(o.kind as ActivityKind)) continue
    out.push({
      id: o.id,
      kind: o.kind as ActivityKind,
      textAr: o.textAr,
      ts: o.ts,
      read: o.read === true,
      ...(typeof o.href === 'string' && o.href ? { href: o.href } : {}),
    })
  }
  return out
}

export function unreadCount(events: readonly ActivityEvent[]): number {
  return events.reduce((n, e) => n + (e.read ? 0 : 1), 0)
}

export interface ActivityDeps {
  get: (key: string) => Promise<Record<string, unknown>>
  set: (obj: Record<string, unknown>) => Promise<void>
  now?: () => number
  id?: () => string
}

export function createActivity(deps: ActivityDeps) {
  const now = deps.now ?? (() => Date.now())
  const id = deps.id ?? (() => crypto.randomUUID())

  async function list(): Promise<ActivityEvent[]> {
    return normalizeEvents((await deps.get(EVENTS_KEY))[EVENTS_KEY])
  }

  async function write(events: ActivityEvent[]): Promise<ActivityEvent[]> {
    await deps.set({ [EVENTS_KEY]: events })
    return events
  }

  /** الأحدث أولًا؛ تكرار الحدث نفسه وهو غير مقروء يحدّث وقته بدل تكديس نسخ */
  async function push(kind: ActivityKind, textAr: string, href?: string): Promise<ActivityEvent[]> {
    const cur = await list()
    const head = cur[0]
    if (head && !head.read && head.kind === kind && head.textAr === textAr) {
      return write([{ ...head, ts: now(), ...(href ? { href } : {}) }, ...cur.slice(1)])
    }
    const ev: ActivityEvent = { id: id(), kind, textAr, ts: now(), read: false, ...(href ? { href } : {}) }
    return write([ev, ...cur].slice(0, EVENTS_CAP))
  }

  /** فتح الجرس = قراءة الكل — الشارة تُطفأ */
  async function markAllRead(): Promise<ActivityEvent[]> {
    const cur = await list()
    if (cur.every((e) => e.read)) return cur
    return write(cur.map((e) => (e.read ? e : { ...e, read: true })))
  }

  return { list, push, markAllRead }
}
