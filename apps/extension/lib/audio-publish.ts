import { netDurationMs, type AudioMeta } from '@dalili/core'
import type { DaliliClient } from '@dalili/shared'
import { audioChunkKey, b64ToBytes, type AudioSessionState } from './audio-store'
import { API_BASE } from './config'

/** VOX-01: تجميع الصوت ورفعه — مشترك بين الخلفية (الإنهاء) واللوحة (نشر المسودة) */

/** إيقاف مسجّل offscreen وانتظار قصير لتفريغ آخر مقطع — بلا تعليق أبدًا */
export async function stopRecorderAndWait(sid: string): Promise<void> {
  try {
    await chrome.runtime.sendMessage({ t: 'offscreen-stop', sid })
  } catch {
    // الوثيقة غير موجودة أصلًا — لا شيء لإيقافه
  }
  await new Promise((r) => setTimeout(r, 400))
}

/** تجميع المقاطع المخزنة إلى blob واحد — بلا مقاطع = بلا صوت (صدق) */
async function assembleAudioBlob(sid: string, count: number): Promise<Blob | null> {
  if (count <= 0) return null
  const keys: string[] = []
  for (let i = 0; i < count; i++) keys.push(audioChunkKey(sid, i))
  const stored = await chrome.storage.local.get(keys)
  const parts: Uint8Array<ArrayBuffer>[] = []
  for (const k of keys) {
    const b64 = stored[k] as string | undefined
    if (typeof b64 === 'string') parts.push(b64ToBytes(b64))
  }
  if (parts.length === 0) return null
  return new Blob(parts, { type: 'audio/webm' })
}

/**
 * إيقاف + تجميع + رفع + ميتا — أي فشل يعيد undefined والدليل يُنشر بلا صوت.
 * تقرأ الحالة من التخزين (لا من ذاكرة الخلفية) فتعمل من أي سياق.
 */
export async function buildAudioMeta(
  client: DaliliClient,
  sid: string,
  state: AudioSessionState,
): Promise<AudioMeta | undefined> {
  try {
    await stopRecorderAndWait(sid)
    const blob = await assembleAudioBlob(sid, state.count)
    if (!blob) return undefined
    const { fileId } = await client.uploadBlob(blob, 'voice.webm')
    // زمن المحتوى لا يجري أثناء الإيقاف؛ والقيمة مقرَّبة (المخطط يشترط int)
    const pauses = state.pauses ?? []
    const durationMs = netDurationMs(state.t0, state.lastOffsetMs, pauses)
    return {
      fileId,
      fileUrl: `${API_BASE}/files/${fileId}`,
      durationMs,
      startedAt: state.t0,
      pauses: pauses.length > 0 ? pauses : undefined,
    }
  } catch {
    return undefined
  }
}

/** سقف انتظار التفريغ التلقائي — لا يعلّق النشر أبدًا (قانون لا تعليق) */
const AUTO_STT_TIMEOUT_MS = 90_000

/**
 * التفريغ التلقائي بعد النشر (قرار المالك 2026-08-30): يملأ الخادم ملاحظات الخطوات
 * الفارغة من كلام الصوت. بلا صوت = لا شيء. الفشل يعاد بصدق ليفتح المحرر بلافتة
 * إعادة المحاولة — ولا يمسّ الدليل المنشور إطلاقًا.
 */
export async function autoTranscribe(
  client: DaliliClient,
  guideId: string,
  hadAudio: boolean,
): Promise<{ ok: boolean; applied?: number }> {
  if (!hadAudio) return { ok: true }
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), AUTO_STT_TIMEOUT_MS)
  try {
    const res = await client.transcribeGuide(guideId, { apply: true, signal: ac.signal })
    return { ok: true, applied: res.applied ?? 0 }
  } catch {
    return { ok: false }
  } finally {
    clearTimeout(timer)
  }
}
