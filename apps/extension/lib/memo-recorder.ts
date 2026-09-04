import { bytesToB64 } from './audio-store'

/** VOX-09 «ميك الخطوة»: مسجّل التعليق القصير — نفس بنية VOX-01 (getUserMedia +
 * MediaRecorder webm/opus بمقاطع 1000ms) لكنه لا يبثّ: يجمع المقاطع ويعيدها كلها
 * عند الإيقاف مع المدة، فتعليق خطوة واحد ملفٌ مستقل يُرفع ويُفرَّغ بمعزل عن الصوت المستمر.
 * التبعيات قابلة للحقن كي يُختبر بلا متصفح. بلا تشغيل دائم ولا rAF. */

export interface MemoDeps {
  /** غيابه يستعمل الميكروفون العالمي (offscreen) — يُحقن في الاختبارات */
  getUserMedia?: (constraints: { audio: { echoCancellation: boolean } }) => Promise<MediaStream>
  recorderCtor?: typeof MediaRecorder
  now?: () => number
}

export type MemoStartAck = { ok: true } | { ok: false; errorAr: string }

export type MemoStopAck =
  | { ok: true; chunks: string[]; durationMs: number }
  | { ok: false; errorAr: string }

export function makeMemoRecorder(deps: MemoDeps) {
  const Ctor = deps.recorderCtor ?? globalThis.MediaRecorder
  const now = deps.now ?? Date.now
  const openMic = deps.getUserMedia ?? ((c: { audio: { echoCancellation: boolean } }) => globalThis.navigator.mediaDevices.getUserMedia(c))
  let rec: MediaRecorder | null = null
  let stream: MediaStream | null = null
  let blobs: Blob[] = []
  let t0 = 0

  async function start(): Promise<MemoStartAck> {
    if (rec && rec.state !== 'inactive') return { ok: false, errorAr: 'تسجيل تعليق جارٍ بالفعل — أوقفه أولًا' }
    try {
      stream = await openMic({ audio: { echoCancellation: true } })
    } catch {
      return { ok: false, errorAr: 'تعذر فتح الميكروفون — علّق على الخطوة بعد منح الإذن' }
    }
    let r: MediaRecorder
    try {
      r = new Ctor(stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 32_000 })
    } catch {
      stream.getTracks().forEach((t) => t.stop())
      stream = null
      return { ok: false, errorAr: 'متصفحك لا يدعم تسجيل webm/opus — التعليق الصوتي غير متاح' }
    }
    blobs = []
    r.ondataavailable = (e) => {
      if (e.data.size > 0) blobs.push(e.data)
    }
    rec = r
    t0 = now()
    r.start(1_000)
    return { ok: true }
  }

  async function stop(): Promise<MemoStopAck> {
    if (!rec || rec.state === 'inactive') return { ok: false, errorAr: 'لا تسجيل تعليق جارٍ' }
    const r = rec
    const stopped = new Promise<void>((resolve) => {
      r.onstop = () => resolve()
    })
    r.stop()
    await stopped
    stream?.getTracks().forEach((t) => t.stop())
    stream = null
    rec = null
    const durationMs = Math.max(1, now() - t0)
    const chunks: string[] = []
    for (const b of blobs) chunks.push(bytesToB64(new Uint8Array(await b.arrayBuffer())))
    blobs = []
    // ميكروفون صامت (مقطوع/مكتوم): صفر بايت طوال التسجيل — صدقٌ الآن خير من شارة
    // «بانتظار التفريغ» زومبية في المحرر لا يفرّغها أحد أبدًا (بلاغ المالك 2026-09-04)
    if (chunks.length === 0) return { ok: false, errorAr: 'لم يُسجَّل صوت — تأكد أن الميكروفون ليس صامتًا ثم أعد المحاولة' }
    return { ok: true, chunks, durationMs }
  }

  return {
    start,
    stop,
    isRecording: () => rec !== null && rec.state !== 'inactive',
  }
}
