/** VOX-01: تخزين مقاطع الصوت b64 — كل مقطع يُكتب فور وصوله فيصمد أمام موت service worker */

/** سقف الرفع الخادمي نفسه — نقصّر قبله فينتهي التسجيل الصوتي بصدق */
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024

export const AUDIO_PREFIX = 'dalili:audio:'

export const audioChunkKey = (sessionId: string, i: number) => `dalili:audio:${sessionId}:${i}`

/** حالة جلسة الصوت — تُخزَّن كاملة فتنجو من موت العامل وتُستأنف بلا فقد */
export interface AudioSessionState {
  sid: string
  /** Date.now() لحظة بدء التسجيل — زمن أي خطوة في مسار الصوت = step.ts − t0 */
  t0: number
  count: number
  bytes: number
  /** إزاحة آخر مقطع عن البدء (ms) — منها تُشتق المدة */
  lastOffsetMs: number
  /** VOX-06: بدء إيقاف مؤقت جارٍ (ساعة مطلقة) — الاستئناف يحوّله إلى فترة في pauses */
  pausedAt?: number
  /** فترات إيقاف مؤقت مكتملة [من، إلى] بالساعة المطلقة */
  pauses?: Array<[number, number]>
}

export function audioStateKey(sessionId: string): string {
  return `dalili:audio:${sessionId}:state`
}

export function bytesToB64(bytes: Uint8Array): string {
  let bin = ''
  const CH = 0x8000
  for (let i = 0; i < bytes.length; i += CH) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CH))
  }
  return btoa(bin)
}

export function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** حجم البايتات الفعلي من طول b64 (خصم الحشو) — بلا فك ترميز */
export function b64Bytes(b64: string): number {
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((b64.length * 3) / 4) - pad)
}

/** هل يتجاوز (المسجَّل حتى الآن + المقطع القادم) السقف؟ */
export function shouldStopForCap(bytesSoFar: number, nextChunkBytes: number): boolean {
  return bytesSoFar + nextChunkBytes > MAX_AUDIO_BYTES
}
