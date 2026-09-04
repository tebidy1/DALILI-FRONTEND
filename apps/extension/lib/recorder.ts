import { bytesToB64 } from './audio-store'

/** VOX-01: تقطيع التسجيل — مقاطع MediaRecorder تُحوَّل b64 مع ساعة performance.now() */

export interface AudioChunkOut {
  idx: number
  b64: string
  /** ساعة performance.now() المحلية لحظة وصول المقطع — لا بعد فك الترميز */
  clock: number
  bytes: number
}

/**
 * يصنع مستقبِل ondataavailable: كل مقطع غير فارغ يُسلَّم بفهرس متسلسل،
 * والساعة تُقرأ تزامنيًا لحظة الحدث (فك b64 لاحقًا لا يزيح الزمن).
 * النوع {data: Blob} يقبل BlobEvent الحقيقي (تباين المعاملات).
 */
export function makeChunkHandler(onChunk: (c: AudioChunkOut) => void): (e: { data: Blob }) => void {
  let idx = 0
  return (e) => {
    const bytes = e.data.size
    if (bytes <= 0) return
    const clock = performance.now()
    void e.data
      .arrayBuffer()
      .then((buf) => bytesToB64(new Uint8Array(buf)))
      .then((b64) => {
        onChunk({ idx: idx++, b64, clock, bytes })
      })
      .catch(() => {
        // فشل ترميز مقطع واحد لا يوقف التسجيل — يُفقد هو فقط
      })
  }
}
