import type { DaliliClient } from '@dalili/shared'
import type { StepVoice } from '@dalili/core'
import { b64ToBytes } from './audio-store'
import { API_BASE } from './config'

/** VOX-09 «ميك الخطوة» — رفع التعليقات وتفريغها بعد النشر:
 * كل تعليق يُرفع ملف webm واحد (مقاطعه متتالية من تسجيل واحد)، والفشل يبقيه
 * pending:true محفوظًا محليًا — لا يمنع النشر ولا يفقد الصوت أبدًا (صدق). */

/** سقف انتظار التفريغ التلقائي — لا يعلّق النشر أبدًا (نمط autoTranscribe القائم) */
const AUTO_STT_TIMEOUT_MS = 90_000

/** رفع تعليق واحد: يعيد حقل voice الجمعي للخطوة، والفشل يعيد pending بلا ملف */
export async function uploadMemo(client: DaliliClient, memo: { chunks: string[]; durationMs: number; pending: boolean }): Promise<StepVoice> {
  const parts = memo.chunks.map((c) => b64ToBytes(c))
  if (parts.length === 0) return { durationMs: memo.durationMs, pending: true }
  const blob = new Blob(parts, { type: 'audio/webm' })
  const { fileId } = await client.uploadBlob(blob, 'memo.webm')
  return { fileId, fileUrl: `${API_BASE}/files/${fileId}`, durationMs: memo.durationMs }
}

/** التفريغ التلقائي لتعليقات الخطوات (قرار المالك 2026-09-04): بلا تعليقات لا شيء،
 * والفشل يُعاد بصدق فيفتح المحرر بلافتة إعادة المحاولة ولا يمس الدليل */
export async function autoTranscribeSteps(client: DaliliClient, guideId: string, hadMemos: boolean): Promise<{ ok: boolean }> {
  if (!hadMemos) return { ok: true }
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), AUTO_STT_TIMEOUT_MS)
  try {
    await client.transcribeSteps(guideId, ac.signal)
    return { ok: true }
  } catch {
    return { ok: false }
  } finally {
    clearTimeout(timer)
  }
}
