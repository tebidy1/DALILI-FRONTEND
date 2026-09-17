/** اختبارات تسليم الدليل (٣د-٣) — بجسرٍ محقون: التسلسل رفع⇒استبدال⇒تسليم⇒فتح
 *  ينتج دليلًا بمعرّفات حقيقيّة لا محلّيّة، وترتيبُ الأحداث المعكوس/المتشابك
 *  لا يفسد الاستبدال، وأحداثُ جلسةٍ أخرى تُتجاهل. */
import { describe, expect, it } from 'vitest'
import type { Guide } from '@dalili/core'
import {
  deliverGuide,
  isLocalFileId,
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
    queueGuide: async (_sessionId, guideJson) => {
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
  return { commands, events, fire, queueFileCalls, guideBodies, opened }
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
