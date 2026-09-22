/** اختبارات تسليم الدليل (٣د-٣) — بجسرٍ محقون: التسلسل رفع⇒استبدال⇒تسليم⇒فتح
 *  ينتج دليلًا بمعرّفات حقيقيّة لا محلّيّة، وترتيبُ الأحداث المعكوس/المتشابك
 *  لا يفسد الاستبدال، وأحداثُ جلسةٍ أخرى تُتجاهل. */
import { describe, expect, it } from 'vitest'
import type { Guide } from '@dalili/core'
import {
  deliverGuide,
  isLocalFileId,
  joinB64Webm,
  type DeliveryCommands,
  type DeliveryEvents,
  type GuideCreatedEvt,
  type UploadedEvt,
} from './deliver'

const SID = 's-itest'

function makeGuide(): Guide {
  return {
    id: '',
    schemaVersion: 2,
    title: 'دليل تجربة',
    locale: 'ar',
    dir: 'rtl',
    createdAt: '2026-09-17T00:00:00.000Z',
    updatedAt: '2026-09-17T00:00:00.000Z',
    steps: [
      {
        id: 'st1',
        kind: 'click',
        title: 'خطوة ١',
        target: {},
        sensitive: false,
        ts: 1,
        screenshot: { fileId: 'f-1', blurRects: [] },
      },
      {
        id: 'st2',
        kind: 'click',
        title: 'خطوة ٢',
        target: {},
        sensitive: false,
        ts: 2,
        screenshot: { fileId: 'f-2', blurRects: [], thumbFileId: 'f-2' },
      },
      {
        id: 'st3',
        kind: 'click',
        title: 'خطوة ساقطة',
        target: {},
        sensitive: false,
        ts: 3,
        screenshot: { missing: true, reason: 'غاب الإطار' },
      },
    ],
  } as unknown as Guide
}

function makeFakes() {
  const queueFileCalls: Array<[string, string]> = []
  const guideBodies: string[] = []
  const opened: string[] = []
  const uploadedCbs: Array<(e: UploadedEvt) => void> = []
  const createdCbs: Array<(e: GuideCreatedEvt) => void> = []
  const commands: DeliveryCommands = {
    queueFile: async (sessionId, localId) => {
      queueFileCalls.push([sessionId, localId])
    },
    queueAudio: async () => {
      throw new Error('queueAudio غير متوقع في هذه الحالة')
    },
    queueGuide: async (_sessionId, guideJson, _hasVoice) => {
      guideBodies.push(guideJson)
    },
    openInBrowser: async (path) => {
      opened.push(path)
    },
  }
  const events: DeliveryEvents = {
    onUploaded: (cb) => {
      uploadedCbs.push(cb)
      return () => {
        uploadedCbs.splice(uploadedCbs.indexOf(cb), 1)
      }
    },
    onGuideCreated: (cb) => {
      createdCbs.push(cb)
      return () => {
        createdCbs.splice(createdCbs.indexOf(cb), 1)
      }
    },
  }
  const fire = {
    uploaded: (e: UploadedEvt) => {
      for (const f of [...uploadedCbs]) f(e)
    },
    created: (e: GuideCreatedEvt) => {
      for (const f of [...createdCbs]) f(e)
    },
  }
  const queueAudioCalls: Array<[string, string, string]> = []
  const withAudio: DeliveryCommands = {
    ...commands,
    queueAudio: async (sessionId, localId, webmB64) => {
      queueAudioCalls.push([sessionId, localId, webmB64])
    },
  }
  return { commands, withAudio, events, fire, queueFileCalls, queueAudioCalls, guideBodies, opened }
}

describe('deliverGuide', () => {
  it('التسلسل الكامل بترتيب أحداث معكوس: استبدال صحيح بمعرّفات حقيقية وتسليم ملفوف بعقد الإنشاء', async () => {
    const f = makeFakes()
    const d = deliverGuide(SID, makeGuide(), f.commands, f.events)
    // طلَب رفع اللقطتين المحليّتين فقط (الساقطة بلا معرّف لا تُطابَر)
    expect([...f.queueFileCalls].sort()).toEqual(
      [
        [SID, 'f-1'],
        [SID, 'f-2'],
      ].sort(),
    )
    expect(d.submitted).toBeInstanceOf(Promise)
    // الأحداث بالترتيب **المعكوس**: الثانية أوّلًا — والمطابقة بالمفتاح تحمي الاستبدال
    f.fire.uploaded({ sessionId: SID, localId: 'f-2', fileId: 'fileREAL-2', thumbFileId: 'thumbREAL-2' })
    f.fire.uploaded({ sessionId: SID, localId: 'f-1', fileId: 'fileREAL-1' })
    await d.submitted
    // جسم التسليم ملفوف بعقد الإنشاء ‏{ guide }
    expect(f.guideBodies).toHaveLength(1)
    const sent = JSON.parse(f.guideBodies[0]!) as { guide: Guide }
    const steps = sent.guide.steps
    expect(steps[0]!.screenshot).toMatchObject({ fileId: 'fileREAL-1' })
    expect(steps[1]!.screenshot).toMatchObject({
      fileId: 'fileREAL-2',
      thumbFileId: 'thumbREAL-2',
    })
    // الساقطة لم تُمَسّ ولا اكتسب معرّفًا زائفًا
    expect(steps[2]!.screenshot).toEqual({ missing: true, reason: 'غاب الإطار' })
    // ثم الإنشاء ⇒ الفتح بمسار الدليل الحقيقيّ
    f.fire.created({ sessionId: SID, guideId: 'g9k2m1' })
    await expect(d.delivered).resolves.toBe('g9k2m1')
    expect(f.opened).toEqual(['/g/g9k2m1'])
  })

  it('أحداث جلسة أخرى ومعرّفات غير معروفة تُتجاهل ولا تُسرّع التسليم', async () => {
    const f = makeFakes()
    const d = deliverGuide(SID, makeGuide(), f.commands, f.events)
    f.fire.uploaded({ sessionId: 'other-session', localId: 'f-1', fileId: 'x1' })
    f.fire.uploaded({ sessionId: SID, localId: 'zz-9', fileId: 'x2' })
    let resolved = false
    void d.submitted.then(() => {
      resolved = true
    })
    await Promise.resolve()
    expect(resolved).toBe(false)
    expect(f.guideBodies).toHaveLength(0)
    // الحدثان الصحيحان يكملان
    f.fire.uploaded({ sessionId: SID, localId: 'f-1', fileId: 'ok1' })
    f.fire.uploaded({ sessionId: SID, localId: 'f-2', fileId: 'ok2' })
    await d.submitted
    expect(resolved).toBe(true)
  })

  it('دليل بلا لقطات محلية يُسلَّم فورًا بلا نداء رفع', async () => {
    const f = makeFakes()
    const guide = makeGuide()
    ;(guide as { steps: Array<{ screenshot?: unknown }> }).steps.forEach((s) => {
      s.screenshot = { missing: true }
    })
    const d = deliverGuide(SID, guide, f.commands, f.events)
    await d.submitted
    expect(f.queueFileCalls).toHaveLength(0)
    expect(f.guideBodies).toHaveLength(1)
    f.fire.created({ sessionId: SID, guideId: 'gOnly1' })
    await expect(d.delivered).resolves.toBe('gOnly1')
  })

  it('فشل طابور لقطة يرفض التسليم صادقا — لا دليل بمعرّفات ناقصة', async () => {
    const f = makeFakes()
    const failing: DeliveryCommands = {
      ...f.commands,
      queueFile: async (_s, localId) => {
        if (localId === 'f-1') throw new Error('الإطار المحروق غير موجود')
      },
    }
    const d = deliverGuide(SID, makeGuide(), failing, f.events)
    await expect(d.submitted).rejects.toThrow('غير موجود')
  })

  it('حارس المعرّف المحلي: أرقام بعد f- حصرا', () => {
    expect(isLocalFileId('f-42')).toBe(true)
    expect(isLocalFileId('f-0')).toBe(true)
    for (const bad of ['f-', 'f-1x', 'file-9', 'itq_x', 'F-1', 'f-1/2']) {
      expect(isLocalFileId(bad)).toBe(false)
    }
  })
})

// الصوت في التسليم (المرحلة ٢-م٤): تعليقات pending تُرفع بأوامر queueAudio
// بمعرّفات v-، وعند حدث الرفع يُربط fileId ويُزال pending قبل ختم جسم الدليل.
// صدقُ VOX: ما لم يُرفع يبقى pending في الدليل ولا يُسقَط أبدًا.
describe('deliverGuide — تعليقات الخطوات الصوتية', () => {
  function guideWithVoice(): Guide {
    const g = makeGuide()
    const steps = g.steps as unknown as Array<Record<string, unknown>>
    steps[0]!['voice'] = { durationMs: 4000, pending: true }
    return g
  }

  it('التعليق يُرفع بأمره بمعرّف v- وعند الرفع يُربط fileId ويُزال pending قبل التسليم', async () => {
    const f = makeFakes()
    const d = deliverGuide(SID, guideWithVoice(), f.withAudio, f.events, {
      chunksOf: (i) => (i === 0 ? ['QUJD'] : null),
    })
    // أمر الرفع الصوتي خرج فورًا بالمقاطع مدمجةً ملفًّا واحدًا
    await Promise.resolve()
    await Promise.resolve()
    expect(f.queueAudioCalls).toEqual([[SID, 'v-1', 'QUJD']])
    // لقطةٌ ثم صوت بأيّ ترتيب — العدّ لا يسرع قبل اكتمالهما معًا
    f.fire.uploaded({ sessionId: SID, localId: 'v-1', fileId: 'fidV1' })
    f.fire.uploaded({ sessionId: SID, localId: 'f-1', fileId: 'fidF1' })
    f.fire.uploaded({ sessionId: SID, localId: 'f-2', fileId: 'fidF2' })
    await d.submitted
    const body = JSON.parse(f.guideBodies[0]!) as { guide: { steps: Array<{ voice?: Record<string, unknown>; screenshot?: { fileId: string } }> } }
    expect(body.guide.steps[0]!.voice).toEqual({
      durationMs: 4000,
      fileId: 'fidV1',
      fileUrl: '/files/fidV1',
    })
    // اللقطات عُرّفت كالمعتاد
    expect((body.guide.steps[1]!.screenshot as { fileId: string }).fileId).toBe('fidF2')
    // والدليل فُتح بعد إنشائه على الخادم
    f.fire.created({ sessionId: SID, guideId: 'gV1' })
    await d.delivered
    expect(f.opened[0]).toContain('/g/')
  })

  it('تعليق بلا مقاطع متاحة يبقى pending في الدليل ولا يعلّق التسليم', async () => {
    const f = makeFakes()
    const g = makeGuide()
    ;((g.steps as unknown) as Array<Record<string, unknown>>)[0]!['voice'] = { durationMs: 4000, pending: true }
    const d = deliverGuide(SID, g, f.withAudio, f.events, { chunksOf: () => null })
    await Promise.resolve()
    await Promise.resolve()
    expect(f.queueAudioCalls).toHaveLength(0)
    // اللقطات وحدها في الانتظار: تُرفع فيُختم الدليل والصوت صادق pending
    f.fire.uploaded({ sessionId: SID, localId: 'f-1', fileId: 'fidF1' })
    f.fire.uploaded({ sessionId: SID, localId: 'f-2', fileId: 'fidF2' })
    await d.submitted
    const body = JSON.parse(f.guideBodies[0]!) as { guide: { steps: Array<{ voice?: Record<string, unknown> }> } }
    expect(body.guide.steps[0]!.voice).toEqual({ durationMs: 4000, pending: true })
    expect(body.guide.steps[0]!.voice).not.toHaveProperty('fileId')
  })

  it('تعليقُ رفعه معلّق يعلق ختم الدليل كاللقطات تمامًا', async () => {
    const f = makeFakes()
    let submittedSettled = false
    const d = deliverGuide(SID, guideWithVoice(), f.withAudio, f.events, {
      chunksOf: (i) => (i === 0 ? ['QUJD'] : null),
    })
    void d.submitted.then(() => {
      submittedSettled = true
    })
    // اللقطات اكتملت والصوت لم يُرفع بعد — لا ختم
    f.fire.uploaded({ sessionId: SID, localId: 'f-1', fileId: 'fidF1' })
    f.fire.uploaded({ sessionId: SID, localId: 'f-2', fileId: 'fidF2' })
    await Promise.resolve()
    expect(submittedSettled).toBe(false)
    expect(f.guideBodies).toHaveLength(0)
    // وحين يصل رفع الصوت يُختم
    f.fire.uploaded({ sessionId: SID, localId: 'v-1', fileId: 'fidLate' })
    await d.submitted
    expect(submittedSettled).toBe(true)
  })

  it('دمج مقاطع webm: التسلسل البايتي للمقاطع ملفٌّ واحد (نمط Blob في الإضافة)', async () => {
    expect(joinB64Webm(['QUJD', 'REVG'])).toBe('QUJDREVG')
    expect(joinB64Webm([])).toBe('')
  })
})
