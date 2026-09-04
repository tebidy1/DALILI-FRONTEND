import { stepTitle } from '@dalili/core'
import { stepKey, shotKey, type StepSummary, type StoredStep } from './protocol'
import { voiceMemoKey, type StoredVoiceMemo } from './voice-memo'

/** قارئات خفيفة فوق chrome.storage.local للوحة الجانبية — لا تُحمّل صور كل الخطوات */

export type StoreGet = (keys: string[]) => Promise<Record<string, unknown>>

export async function readStepSummaries(
  sessionId: string,
  stepCount: number,
  get: StoreGet,
): Promise<StepSummary[]> {
  if (stepCount <= 0) return []
  const keys = Array.from({ length: stepCount }, (_, i) => stepKey(sessionId, i))
  // VOX-09: مفاتيح التعليق الصوتي تُجلب في النداء نفسه — شارة 🎙 بلا طلبات إضافية
  const voiceKeys = Array.from({ length: stepCount }, (_, i) => voiceMemoKey(sessionId, i))
  const got = await get([...keys, ...voiceKeys])
  const out: StepSummary[] = []
  for (let i = 0; i < stepCount; i++) {
    const st = got[stepKey(sessionId, i)] as StoredStep | undefined
    if (!st) continue
    const ev = st.ev
    const memo = got[voiceMemoKey(sessionId, i)] as StoredVoiceMemo | undefined
    out.push({
      i,
      title: stepTitle({ kind: ev.kind, target: ev.target, value: ev.value, sensitive: ev.sensitive, pageTitle: ev.pageTitle }),
      sensitive: ev.sensitive,
      kind: ev.kind,
      missingReason: st.missingReason,
      // إطار الهدف الأحمر فوق لقطة المعاينة — نُمرّر مستطيله كما خزّنته الخلفية
      ...(st.mark ? { mark: st.mark } : {}),
      // VOX-09: شارة 🎙 بالمدة — قابلة للحذف قبل النشر
      ...(memo ? { voice: { durationMs: memo.durationMs, pending: memo.pending } } : {}),
    })
  }
  return out
}

export async function readLastShot(
  sessionId: string,
  stepCount: number,
  get: StoreGet,
): Promise<string | undefined> {
  for (let i = stepCount - 1; i >= 0; i--) {
    const key = shotKey(sessionId, i)
    const got = await get([key])
    const v = got[key]
    if (typeof v === 'string') return v
  }
  return undefined
}

/** لقطة خطوة بعينها — تُحمّل كسولًا عند كشف بطاقة سابقة (لا نحمّل صور كل الخطوات) */
export async function readShotAt(
  sessionId: string,
  index: number,
  get: StoreGet,
): Promise<string | undefined> {
  if (index < 0) return undefined
  const key = shotKey(sessionId, index)
  const got = await get([key])
  const v = got[key]
  return typeof v === 'string' ? v : undefined
}

/** خريطة فهرس→قيمة مضغوطة بعد حذف فهرس — نقية وقابلة للاختبار */
export function renumberAfterDelete<T>(items: Map<number, T>, deletedIndex: number, count: number): Map<number, T> {
  const out = new Map<number, T>()
  let w = 0
  for (let r = 0; r < count; r++) {
    if (r === deletedIndex) continue
    if (items.has(r)) out.set(w, items.get(r) as T)
    w++
  }
  return out
}
