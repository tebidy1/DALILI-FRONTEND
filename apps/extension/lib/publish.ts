import { assembleGuide, DEFAULT_MARK_COLOR, type RawStep } from '@dalili/core'
import type { DaliliClient } from '@dalili/shared'
import { stepKey, shotKey, type StoredStep } from './protocol'
import { voiceMemoKey, type StoredVoiceMemo } from './voice-memo'
import { uploadMemo } from './voice-memo-upload'
import { API_BASE } from './config'

/** بيانات الرفع الراجعة من الخادم */
interface UploadedShot {
  fileId: string
  fileUrl?: string
  thumbFileId?: string
}

/** ما خزّنته الخلفية عن الخطوة وقت الالتقاط */
interface StoredShotState {
  autoBlurred?: boolean
  /** ANNO-02: مستطيل الزر المقصود ببكسل الصورة — كان يُخبز في JPEG، صار بيانات */
  mark?: { x: number; y: number; w: number; h: number }
}

/**
 * يبني بيانات اللقطة من نتيجة الرفع وحالة الالتقاط — نقي وقابل للاختبار.
 * الإطار يخرج كبيانات باللون الافتراضي، والمحرر يغيّره لاحقًا من لوحة الحبر.
 */
export function screenshotFromStored(up: UploadedShot, st: StoredShotState) {
  return {
    fileId: up.fileId,
    fileUrl: up.fileUrl,
    thumbFileId: up.thumbFileId,
    blurRects: [] as never[],
    autoBlurred: st.autoBlurred,
    ...(st.mark ? { mark: { rect: st.mark, color: DEFAULT_MARK_COLOR } } : {}),
  }
}

/**
 * تجميع الخطوات المخزنة محليًا ونشرها: رفع الصور واحدة واحدة ثم إنشاء الدليل —
 * أو إضافتها لدليل قائم (CAP-17) في موضع محدد.
 * فشل رفع لقطة = خطوة صادقة بلا لقطة (لا كذب ولا إسقاط للدليل كله).
 */
export interface PublishResult {
  guideId: string
  /** VOX-09: عدد التعليقات الصوتية المرفقة وما فشل رفعه (يبقى pending محفوظًا) */
  memoTotal: number
  memoFailed: number
}

export async function publishSteps(
  client: DaliliClient,
  sessionId: string,
  stepCount: number,
  opts: { onMemoProgress?: (message: string) => void; /** المرحلة ٣: الاسم الاختياري — للدليل الجديد وحده */ title?: string } = {},
): Promise<PublishResult> {
  const raw: RawStep[] = []
  // VOX-09: التعليقات الصوتية تُحصى أولًا كي يُعرض تقدم رفع صادق «ن من م»
  const memoKeys: string[] = []
  for (let i = 0; i < stepCount; i++) memoKeys.push(voiceMemoKey(sessionId, i))
  const memoGot = await chrome.storage.local.get(memoKeys)
  let memoDone = 0
  let memoTotal = 0
  let memoFailed = 0
  for (const k of memoKeys) if (memoGot[k]) memoTotal++
  const keptMemoKeys = new Set<string>()
  for (let i = 0; i < stepCount; i++) {
    const key = stepKey(sessionId, i)
    const got = (await chrome.storage.local.get(key))[key] as StoredStep | undefined
    if (!got) continue
    const ev = got.ev
    const shotK = shotKey(sessionId, i)
    const shotDataUrl = (await chrome.storage.local.get(shotK))[shotK] as string | undefined
    let screenshot: RawStep['screenshot']
    if (shotDataUrl) {
      try {
        const blob = await (await fetch(shotDataUrl)).blob()
        const { fileId, thumbFileId } = await client.uploadBlob(blob)
        screenshot = screenshotFromStored(
          { fileId, fileUrl: `${API_BASE}/files/${fileId}`, thumbFileId },
          { autoBlurred: got.autoBlurred, mark: got.mark },
        )
      } catch {
        screenshot = { missing: true, reason: 'فشل رفع اللقطة — حرّر الخطوة في المحرر' }
      }
    } else {
      screenshot = { missing: true, reason: got.missingReason ?? 'لا توجد لقطة' }
    }
    // VOX-09: تعليق الخطوة يُرفع معها — فشله يبقيه pending في الدليل ولا يمنع النشر
    let voice: RawStep['voice']
    const memo = memoGot[voiceMemoKey(sessionId, i)] as StoredVoiceMemo | undefined
    if (memo) {
      memoDone++
      opts.onMemoProgress?.(`رفع التعليق الصوتي ${memoDone.toLocaleString('ar-EG')} من ${memoTotal.toLocaleString('ar-EG')}…`)
      try {
        voice = await uploadMemo(client, memo)
      } catch {
        voice = { durationMs: memo.durationMs, pending: true }
        memoFailed++
        keptMemoKeys.add(voiceMemoKey(sessionId, i)) // الصوت لا يفقد — يبقى محليًا
      }
    }
    raw.push({
      kind: ev.kind,
      target: ev.target,
      value: ev.value,
      sensitive: ev.sensitive,
      url: ev.url,
      pageTitle: ev.pageTitle,
      ts: ev.ts,
      screenshot,
      voice,
    })
  }
  const guide = assembleGuide(raw)
  // المرحلة ٣ (قرار المالك): التسمية لحظة «امتلاك» الدليل — ما كتبه المستخدم
  // يغلب الاسم المشتق من الصفحة، والفراغ يترك الاشتقاق القائم بلا مساس
  const named = opts.title?.trim()
  if (named) guide.title = named
  const created = await client.createGuide(guide as unknown as Parameters<DaliliClient['createGuide']>[0])
  const guideId = created.id
  // الصوت المرفوع عاش في الخادم — نسخته المحلية تُمسح؛ الفاشل وحده يبقى (لا يفقد أبدًا)
  const removeMemoKeys = memoKeys.filter((k) => memoGot[k] && !keptMemoKeys.has(k))
  if (removeMemoKeys.length > 0) await chrome.storage.local.remove(removeMemoKeys)
  return { guideId, memoTotal, memoFailed }
}

/** مسح كل خطوات الجلسات من التخزين المحلي — اللقطات والخطوات ومقاطع الصوت */
export async function clearAllSteps(): Promise<void> {
  const all = await chrome.storage.local.get(null)
  const keys = Object.keys(all).filter(
    (k) =>
      k.startsWith('dalili:step:') ||
      k.startsWith('dalili:shot:') ||
      k.startsWith('dalili:audio:'),
  )
  if (keys.length > 0) await chrome.storage.local.remove(keys)
}
