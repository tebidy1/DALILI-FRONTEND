/** تسليم الدليل (٣د-٣) — حدود محقونة كالجلسة: **كل الشبكة في Rust**، وهنا
 *  أوامرُ IPC واشتراكُ أحداث فحسب. التسلسل: طابورُ اللقطات ذات المعرّف
 *  المحلّيّ ‏⇐ استبدالُ ‏localId بـ‏fileId عند كلّ ‏uploaded (بأيّ ترتيب —
 *  المطابقة بالمفتاح لا بالموضع) ‏⇐ حين تكتمل يُسلَّم الدليل معتِمًا إلى
 *  ‏queue_guide ‏⇐ عند ‏guide-created يُفتح مسارُ الدليل في المتصفّح. */

import type { Guide, Step } from '@dalili/core'
import { isMissingScreenshot } from '@dalili/core'

export interface UploadedEvt {
  sessionId: string
  localId: string
  fileId: string
  thumbFileId?: string
}

export interface GuideCreatedEvt {
  sessionId: string
  guideId: string
}

/** أوامر IPC حصرًا — لا شبكة هنا إطلاقًا */
export interface DeliveryCommands {
  queueFile(sessionId: string, localId: string): Promise<void>
  queueGuide(sessionId: string, guideJson: string): Promise<void>
  openInBrowser(path: string): Promise<void>
}

export interface DeliveryEvents {
  onUploaded(cb: (e: UploadedEvt) => void): () => void
  onGuideCreated(cb: (e: GuideCreatedEvt) => void): () => void
}

/** المعرّف المحلّيّ للقطة بعد الالتقاط: ‏f-<أرقام> — ما عداها حقيقيٌّ أصلًا */
export function isLocalFileId(fileId: string): boolean {
  return /^f-\d+$/.test(fileId)
}

export interface Delivery {
  /** يُحلّ حين يُسلَّم جسمُ الدليل إلى ‏queue_guide */
  submitted: Promise<void>
  /** يُحلّ بمعرّف الدليل الحقيقيّ بعد فتح المتصفّح */
  delivered: Promise<string>
}

export function deliverGuide(
  sessionId: string,
  guide: Guide,
  commands: DeliveryCommands,
  events: DeliveryEvents,
): Delivery {
  // نسخة الدليل في الذاكرة — الأحداث تستبدل معرّفاتها ثم يُسلَّم معتِمًا
  const copy: Guide = structuredClone(guide)
  // ‏localId ← صاحبة اللقطة — البحث بالمفتاح يجعل ترتيب الأحداث غير مؤثّر
  const pending = new Map<string, Step>()
  for (const step of copy.steps) {
    const s = step.screenshot
    if (s && !isMissingScreenshot(s) && isLocalFileId(s.fileId)) {
      pending.set(s.fileId, step)
    }
  }

  let submittedResolve!: () => void
  let submittedReject!: (e: unknown) => void
  const submitted = new Promise<void>((res, rej) => {
    submittedResolve = res
    submittedReject = rej
  })
  let deliveredResolve!: (id: string) => void
  let deliveredReject!: (e: unknown) => void
  const delivered = new Promise<string>((res, rej) => {
    deliveredResolve = res
    deliveredReject = rej
  })

  let remaining = pending.size
  let submittedDone = false

  const offUploaded = events.onUploaded((e) => {
    if (e.sessionId !== sessionId) return // جلسة أخرى — تُتجاهل
    const step = pending.get(e.localId)
    if (!step) return // معرّف غير معروف — يُتجاهل صامتًا
    pending.delete(e.localId)
    const s = step.screenshot
    if (s && !isMissingScreenshot(s)) {
      s.fileId = e.fileId // الاستبدال: المحلّيّ يصير حقيقيًّا
      if (e.thumbFileId) s.thumbFileId = e.thumbFileId
    }
    remaining -= 1
    trySubmit()
  })

  function trySubmit(): void {
    if (submittedDone || remaining > 0) return
    submittedDone = true
    // الجسم معتِم ملفوفًا بعقد الإنشاء ‏{ guide } — يبنيه TS ولا يفكّه Rust
    commands
      .queueGuide(sessionId, JSON.stringify({ guide: copy }))
      .then(submittedResolve, submittedReject)
  }

  const offCreated = events.onGuideCreated((e) => {
    if (e.sessionId !== sessionId || !submittedDone) return
    offCreated()
    offUploaded()
    commands
      .openInBrowser(`/g/${e.guideId}`)
      .then(() => deliveredResolve(e.guideId), deliveredReject)
  })

  // فشلُ طابورِ لقطةٍ يُسقط التسليم صادقًا — لا دليلٌ بمعرّفات ناقصة
  submitted.catch(() => {
    offUploaded()
    offCreated()
  })

  // طلَب رفع اللقطات المحلّيّة كلّها — قد تسبق الأحداثُ انتهاءَ الطلبات
  for (const localId of [...pending.keys()]) {
    commands.queueFile(sessionId, localId).catch(submittedReject)
  }
  trySubmit() // بلا لقطات محلّيّة: تسليمٌ فوريّ

  return { submitted, delivered }
}
