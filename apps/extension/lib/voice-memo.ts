import { renumberAfterDelete } from './steps-read'

/**
 * VOX-09 «ميك الخطوة» — آلة حالة التعليق الصوتي في الخلفية:
 * يدمج التعليق مع **آخر خطوة ملتقطة**، يسقفه بستين ثانية يتوقف عندها تلقائيًا،
 * ويخزّنه محليًا تحت مفتاح الخطوة بـpending:true حتى يُرفع عند النشر —
 * فشلُ الرفع أو التفريغ لا يمحو الصوت أبدًا. التبعيات محقونة كي يُختبر بلا متصفح.
 */

/** سقف التعليق الصادق — الثواني الستون يقرؤها المستخدم في الواجهة نفسها */
export const MEMO_CAP_MS = 60_000

export const VOICE_PREFIX = 'voice:'

export const voiceMemoKey = (sessionId: string, i: number) => `voice:${sessionId}:${i}`

/** تعليق صوتي مخزَّن محليًا — chunks مقاطع webm بترتيبها b64، وpending حتى الرفع */
export interface StoredVoiceMemo {
  memoId: string
  chunks: string[]
  durationMs: number
  pending: boolean
}

/** رد offscreen المُتوقَّع — حقول MemoStopAck مُسطَّحة كي لا تتشعب الأنماط في الحارس */
export interface MemoHostAck {
  ok?: boolean
  errorAr?: string
  chunks?: string[]
  durationMs?: number
}

export interface MemoHost {
  messageOffscreen(msg: unknown): Promise<MemoHostAck | null>
  store: {
    get(keys: string[]): Promise<Record<string, unknown>>
    getAll(): Promise<Record<string, unknown>>
    set(obj: Record<string, unknown>): Promise<void>
    remove(keys: string[]): Promise<void>
  }
  /** نتيجة بلوغ السقف — نجاحه وإخفاقه تعرضهما اللوحة بصدق (فخ التسجيل الصامت) */
  onCapResult?(result: MemoStopResult): void
  now?: () => number
  setCapTimer?(fn: () => void, ms: number): unknown
  clearCapTimer?(t: unknown): void
}

export interface ActiveMemo {
  sid: string
  memoId: string
  stepIndex: number
  startedAt: number
}

export type MemoStartResult = { ok: true } | { ok: false; errorAr: string }

export type MemoStopResult = { ok: boolean; capped?: boolean; stepIndex?: number; durationMs?: number; errorAr?: string }

export function makeVoiceMemo(host: MemoHost) {
  const now = host.now ?? Date.now
  let active: ActiveMemo | null = null
  let capTimer: unknown = null

  function clearTimer() {
    if (capTimer !== null && capTimer !== undefined) host.clearCapTimer?.(capTimer)
    capTimer = null
  }

  async function startMemo(sid: string, stepIndex: number): Promise<MemoStartResult> {
    if (active) return { ok: false, errorAr: 'تسجيل تعليق جارٍ بالفعل — أوقفه أولًا' }
    // التعليق يدمج مع آخر خطوة ملتقطة — بلا خطوة لا معنى للتعليق (صدق قبل أي رسالة)
    if (stepIndex < 0) return { ok: false, errorAr: 'التقط خطوة أولًا ثم علّق عليها بصوتك' }
    const memoId = crypto.randomUUID().replace(/-/g, '').slice(0, 10)
    const ack = await host.messageOffscreen({ t: 'memo-start', sid, memoId })
    if (!ack?.ok) return { ok: false, errorAr: ack?.errorAr ?? 'تعذر بدء التسجيل — أعد المحاولة' }
    active = { sid, memoId, stepIndex, startedAt: now() }
    capTimer = host.setCapTimer?.(() => {
      void stopMemo('cap').then((r) => host.onCapResult?.(r))
    }, MEMO_CAP_MS) ?? null
    return { ok: true }
  }

  async function stopMemo(reason: 'user' | 'cap' = 'user'): Promise<MemoStopResult> {
    const cur = active
    if (!cur) return { ok: false, errorAr: 'لا تسجيل تعليق جارٍ' }
    clearTimer()
    active = null
    const ack = await host.messageOffscreen({ t: 'memo-stop', sid: cur.sid })
    if (!ack?.ok || !Array.isArray(ack.chunks) || typeof ack.durationMs !== 'number') {
      return { ok: false, errorAr: ack?.errorAr ?? 'فشل تسجيل التعليق — جرّب من جديد' }
    }
    // مقاطع فارغة = ميكروفون صامت: لا يُخزَّن تعليق ميت لا يُفرَّغ أبدًا (بلاغ المالك 2026-09-04)
    if (ack.chunks.length === 0) {
      return { ok: false, errorAr: 'لم يُسجَّل صوت — تأكد أن الميكروفون ليس صامتًا ثم أعد المحاولة' }
    }
    const memo: StoredVoiceMemo = { memoId: cur.memoId, chunks: ack.chunks, durationMs: ack.durationMs, pending: true }
    await host.store.set({ [voiceMemoKey(cur.sid, cur.stepIndex)]: memo })
    return { ok: true, capped: reason === 'cap', stepIndex: cur.stepIndex, durationMs: ack.durationMs }
  }

  async function readMemo(sid: string, i: number): Promise<StoredVoiceMemo | null> {
    const key = voiceMemoKey(sid, i)
    const got = (await host.store.get([key]))[key] as StoredVoiceMemo | undefined
    return got ?? null
  }

  async function clearMemo(sid: string, i: number): Promise<void> {
    await host.store.remove([voiceMemoKey(sid, i)])
  }

  /** مسح صوت جلسة كاملة (إلغاء الالتقاط) — مفاتيحها وحدها */
  async function purgeMemos(sid: string): Promise<void> {
    const all = await host.store.getAll()
    const keys = Object.keys(all).filter((k) => k.startsWith(VOICE_PREFIX) && k.includes(`:${sid}:`))
    if (keys.length > 0) await host.store.remove(keys)
  }

  /** حذف خطوة يعيد ترقيم صوت ما بعدها — نفس نمط renumberAfterDelete للخطوات واللقطات */
  async function renumberMemos(sid: string, deletedIndex: number, count: number): Promise<void> {
    const all = await host.store.getAll()
    const map = new Map<number, StoredVoiceMemo>()
    for (let i = 0; i < count; i++) {
      const v = all[voiceMemoKey(sid, i)] as StoredVoiceMemo | undefined
      if (v) map.set(i, v)
    }
    if (map.size === 0) return
    const renumbered = renumberAfterDelete(map, deletedIndex, count)
    const removeKeys: string[] = []
    for (let i = 0; i < count; i++) removeKeys.push(voiceMemoKey(sid, i))
    await host.store.remove(removeKeys)
    const writes: Record<string, StoredVoiceMemo> = {}
    renumbered.forEach((v, i) => (writes[voiceMemoKey(sid, i)] = v))
    await host.store.set(writes)
  }

  return {
    startMemo,
    stopMemo,
    readMemo,
    clearMemo,
    purgeMemos,
    renumberMemos,
    activeMemo: (): ActiveMemo | null => active,
  }
}
