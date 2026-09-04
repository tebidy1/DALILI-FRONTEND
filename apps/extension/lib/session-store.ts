import { META_KEY, stepKey, shotKey, type SessionMeta, type StoredStep, type ToTabMsg } from './protocol'

/** حالة الجلسة موزّعة — قراءة/كتابة/بثّ فوق chrome.storage.local، استُخلصت من
 * background.ts (قانون الحجم ٤٠٠) بلا أي تغيير سلوك. المصدر يبقى التخزين نفسه. */

export const IDLE_META: SessionMeta = { state: 'idle', sessionId: '', startedAt: 0, stepCount: 0 }

export interface SessionStore {
  /** الحالة في الذاكرة — مرآة للتخزين تُستعاد عند إيقاظ العامل */
  get(): SessionMeta
  load(): Promise<SessionMeta>
  save(patch: Partial<SessionMeta>): Promise<void>
  /** كتابة عدّاد بلا تغيير — بثّ غير ضروري (مسار الاستبدال) */
  saveSilently(): Promise<void>
  broadcast(): Promise<Set<number>>
  activeTab(): Promise<chrome.tabs.Tab | undefined>
  readStep(sessionId: string, i: number): Promise<StoredStep | undefined>
  writeStep(sessionId: string, i: number, st: StoredStep): Promise<void>
  patchStep(sessionId: string, i: number, patch: Partial<StoredStep>): Promise<void>
}

export function createSessionStore(): SessionStore {
  let meta: SessionMeta = IDLE_META

  async function load(): Promise<SessionMeta> {
    const got = (await chrome.storage.local.get(META_KEY))[META_KEY] as SessionMeta | undefined
    if (got) meta = got
    return meta
  }

  async function broadcast(): Promise<Set<number>> {
    const msg: ToTabMsg = { t: 'meta', meta }
    const live = new Set<number>()
    const tabs = await chrome.tabs.query({})
    for (const t of tabs) {
      if (t.id !== undefined) {
        try {
          await chrome.tabs.sendMessage(t.id, msg)
          live.add(t.id)
        } catch {
          // تبويب بلا مستقبل (صفحة نظامية) — طبيعي
        }
      }
    }
    return live
  }

  return {
    get: () => meta,
    load,
    async save(patch) {
      meta = { ...meta, ...patch }
      await chrome.storage.local.set({ [META_KEY]: meta })
      await broadcast()
    },
    // عداد بلا تغيير — بث غير ضروري (مسار الاستبدال في الالتقاط)
    async saveSilently() {
      await chrome.storage.local.set({ [META_KEY]: meta })
    },
    broadcast,
    // التبويب النشط في النافذة الأخيرة تركيزًا — أو undefined (لا تبويب/صفحة نظامية)
    async activeTab() {
      return (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]
    },
    async readStep(sessionId, i) {
      const key = stepKey(sessionId, i)
      return (await chrome.storage.local.get(key))[key] as StoredStep | undefined
    },
    async writeStep(sessionId, i, st) {
      await chrome.storage.local.set({ [stepKey(sessionId, i)]: st })
    },
    async patchStep(sessionId, i, patch) {
      const st = await (async () => {
        const key = stepKey(sessionId, i)
        return (await chrome.storage.local.get(key))[key] as StoredStep | undefined
      })()
      if (st) await chrome.storage.local.set({ [stepKey(sessionId, i)]: { ...st, ...patch } })
    },
  }
}

/** مفتاح لقطة خطوة — للقراءة المباشرة في مسارات النشر والحذف */
export const shotKeyOf = shotKey
