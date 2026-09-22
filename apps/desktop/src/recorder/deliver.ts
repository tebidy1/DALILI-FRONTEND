/** تسليم الدليل (٣د-٣) — حدود محقونة كالجلسة: **كل الشبكة في Rust**، وهنا
 *  أوامرُ IPC واشتراكُ أحداث فحسب. التسلسل: طابورُ اللقطات ذات المعرّف
 *  المحلّيّ ‏⇐ استبدالُ ‏localId بـ‏fileId عند كلّ ‏uploaded (بأيّ ترتيب —
 *  المطابقة بالمفتاح لا بالموضع) ‏⇐ حين تكتمل يُسلَّم الدليل معتِمًا إلى
 *  ‏queue_guide ‏⇐ عند ‏guide-created يُفتح مسارُ الدليل في المتصفّح. */

import type { Guide, Step, StepVoice } from '@dalili/core'
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
  queueAudio(sessionId: string, localId: string, webmB64: string): Promise<void>
  queueGuide(sessionId: string, guideJson: string, hasVoice: boolean): Promise<void>
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

/**
 * دمج مقاطع ‏webm ملفًّا واحدًا — التسلسل البايتيّ للمقاطع كما يفعل Blob في
 * الإضافة: المقطع الأول يحمل ترويسة ‏EBML والبقية عُناقيد تتابعها سليمةً.
 * التعليق ≤ ٦٠ث ‏@32kbps فالحجم هين والبساطة أصدق من إعادة بناء الحاوية.
 */
export function joinB64Webm(chunks: string[]): string {
  let bin = ''
  for (const c of chunks) bin += atob(c)
  return btoa(bin)
}

/** مصدر مقاطع تعليق خطوة — الودجة تمرّر مخزن التعليقات ملفوفًا بهذا العقد */
export interface VoiceChunksSource {
  chunksOf(stepIndex: number): string[] | null
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
  audio?: VoiceChunksSource,
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

  let remaining = pending.size
  let submittedDone = false

  // تعليقات الخطوات (المرحلة ٢): كل voice منتظِر بمقاطعٍ متاحة يُسكَب ملفًّا
  // ‏webm واحدًا بمعرّف ‏v-<ترقيم>، وحدث رفعه يربط fileId ويُزيل pending.
  // بلا مقاطع ⇐ يبقى pending صادقًا في الدليل ولا يُعدّ في الانتظار إطلاقًا
  const audioPending = new Map<string, StepVoice>()
  let audioSeq = 0
  copy.steps.forEach((step, i) => {
    const v = step.voice
    if (!v || !v.pending) return
    const chunks = audio?.chunksOf(i)
    if (!chunks || chunks.length === 0) return
    audioSeq += 1
    const localId = `v-${audioSeq}`
    audioPending.set(localId, v)
    remaining += 1
    commands.queueAudio(sessionId, localId, joinB64Webm(chunks)).catch(() => {
      // فشلُ إدخال الصوت للطابور: يبقى pending صادقًا ولا يُسقَط الدليل —
      // لكنه لا يُحسب منتظِرًا وإلا تعذّر الختم للأبد
      if (audioPending.delete(localId)) {
        remaining -= 1
        trySubmit()
      }
    })
  })

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

  const offUploaded = events.onUploaded((e) => {
    if (e.sessionId !== sessionId) return // جلسة أخرى — تُتجاهل
    const step = pending.get(e.localId)
    if (step) {
      pending.delete(e.localId)
      const s = step.screenshot
      if (s && !isMissingScreenshot(s)) {
        s.fileId = e.fileId // الاستبدال: المحلّيّ يصير حقيقيًّا
        if (e.thumbFileId) s.thumbFileId = e.thumbFileId
      }
      remaining -= 1
      trySubmit()
      return
    }
    // تعليق صوتي رُفع: الرقم الحقيقيّ يحلّ محلّ pending ويعبّر الرابط
    const voice = audioPending.get(e.localId)
    if (voice) {
      audioPending.delete(e.localId)
      voice.fileId = e.fileId
      voice.fileUrl = `/files/${e.fileId}`
      delete voice.pending
      remaining -= 1
      trySubmit()
    }
    // معرّف غير معروف — يُتجاهل صامتًا
  })

  function trySubmit(): void {
    if (submittedDone || remaining > 0) return
    submittedDone = true
    // الجسم معتِم ملفوفًا بعقد الإنشاء ‏{ guide } — يبنيه TS ولا يفكّه Rust،
    // وعلم الصوت بسيط (أيّ تعليق موجود؟) يقود التفريغ الخادميّ بعد النجاح
    const hasVoice = copy.steps.some((s) => !!s.voice)
    commands
      .queueGuide(sessionId, JSON.stringify({ guide: copy }), hasVoice)
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
