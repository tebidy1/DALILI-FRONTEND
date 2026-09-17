import { describe, expect, it } from 'vitest'
import { DaliliApiError, type GuideDetailsDto, type GuideDto, type StepDto } from '@dalili/shared'
import {
  canTrain,
  readerItems,
  readerLoadErrorAr,
  shareAction,
  shotSrc,
  EXTERNAL_MEDIA_AR,
  NO_SHOT_AR,
} from './reader'

const API = 'http://api'
const WEB = 'http://web'

function step(over: Partial<StepDto> = {}): StepDto {
  return {
    id: over.id ?? 's1',
    kind: 'click',
    title: 'انقر حفظ',
    target: {},
    sensitive: false,
    url: 'https://app.test/x',
    pageTitle: 'X',
    ts: 1,
    ...over,
  }
}

function guide(steps: StepDto[]): GuideDto {
  return {
    id: 'g1',
    schemaVersion: 1,
    title: 'دليل',
    locale: 'ar',
    dir: 'rtl',
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    steps,
  }
}

describe('shotSrc', () => {
  it('يأخذ المفتاح من آخر مقطع fileUrl ويبنيه على أصل الخادم الحالي', () => {
    expect(shotSrc({ fileId: 'f1', fileUrl: 'http://old-host/files/abc' }, API)).toBe('http://api/files/abc')
  })
  it('بلا fileUrl يستعمل fileId', () => {
    expect(shotSrc({ fileId: 'f1' }, API)).toBe('http://api/files/f1')
  })
  it('يحفظ استعلام التوقيع كما هو (خصوصيّة ٢ب)', () => {
    expect(shotSrc({ fileId: 'f1', fileUrl: '/files/abc?e=123&s=tok&c=sig' }, API)).toBe('http://api/files/abc?e=123&s=tok&c=sig')
  })
})

describe('readerItems', () => {
  it('الترقيم يتخطى الكتل (header لا يأخذ رقمًا)', () => {
    const items = readerItems(guide([step({ id: 'a' }), step({ id: 'h', block: 'header', title: 'قسم' }), step({ id: 'b' })]), API)
    expect(items.map((i) => i.type)).toEqual(['step', 'header', 'step'])
    expect(items[0]).toMatchObject({ type: 'step', n: 1 })
    expect(items[2]).toMatchObject({ type: 'step', n: 2 })
  })
  it('اللقطة: المصدر والإطار والقصّ والطمس تمرّ كما هي', () => {
    const [it0] = readerItems(
      guide([
        step({
          screenshot: {
            fileId: 'f1',
            blurRects: [{ x: 1, y: 2, w: 3, h: 4 }],
            crop: { x: 10, y: 10, w: 500, h: 300 },
            mark: { rect: { x: 50, y: 60, w: 70, h: 20 }, color: '#ea580c' },
          },
        }),
      ]),
      API,
    )
    expect(it0).toMatchObject({
      type: 'step',
      shot: {
        src: 'http://api/files/f1',
        mark: { x: 50, y: 60, w: 70, h: 20 },
        crop: { x: 10, y: 10, w: 500, h: 300 },
        blur: [{ x: 1, y: 2, w: 3, h: 4 }],
      },
    })
  })
  it('لقطة مفقودة تعرض سببها، وبلا سبب رسالة ثابتة', () => {
    const items = readerItems(
      guide([step({ id: 'a', screenshot: { missing: true, reason: 'صفحة محمية' } }), step({ id: 'b', screenshot: { missing: true } })]),
      API,
    )
    expect(items[0]).toMatchObject({ missing: 'صفحة محمية' })
    expect(items[1]).toMatchObject({ missing: NO_SHOT_AR })
  })
  it('tip بنص منسّق يُعرض نصًا خامًا، والفيديو سطر «في المتصفح»', () => {
    const items = readerItems(
      guide([
        step({ id: 't', block: 'tip', title: '', rich: [{ para: 'p', runs: [{ text: 'تلميح مهم' }] }] }),
        step({ id: 'v', block: 'video', title: '' }),
      ]),
      API,
    )
    expect(items[0]).toMatchObject({ type: 'callout', tone: 'tip', text: 'تلميح مهم' })
    expect(items[1]).toMatchObject({ type: 'external', label: EXTERNAL_MEDIA_AR })
  })
})

describe('shareAction — فخّ تجديد الرمز', () => {
  const base = { guide: guide([]) }
  it('مشاركة قائمة → نسخ رابطها على أصل الويب (بلا إنشاء)', () => {
    const d = { ...base, share: { token: 'tok', shareUrl: 'http://api/s/tok', views: 0 }, visibility: 'workspace' as const }
    expect(shareAction(d, WEB)).toEqual({ kind: 'copy', url: 'http://web/s/tok' })
  })
  it('منشور بلا مشاركة → إنشاء', () => {
    expect(shareAction({ ...base, share: null, visibility: 'workspace' }, WEB)).toEqual({ kind: 'create' })
  })
  it('خادم قديم بلا visibility → إنشاء', () => {
    expect(shareAction({ ...base, share: null }, WEB)).toEqual({ kind: 'create' })
  })
  it('خاص بلا مشاركة → انشر أولًا من المحرر', () => {
    expect(shareAction({ ...base, share: null, visibility: 'private' }, WEB)).toEqual({
      kind: 'publish-first',
      editorUrl: 'http://web/g/g1',
    })
  })
})

describe('canTrain', () => {
  it('خطوة واحدة بمرساة تكفي', () => {
    expect(canTrain(guide([step({ target: { anchor: [{ k: 'id', v: 'save' }] } })]))).toBe(true)
  })
  it('بلا مراسٍ → لا دربني', () => {
    expect(canTrain(guide([step()]))).toBe(false)
  })
})

describe('readerLoadErrorAr', () => {
  it('404 رسالة الحذف', () => {
    expect(readerLoadErrorAr(new DaliliApiError(404, 'x'))).toBe('الدليل غير موجود — ربما حُذف أو نُقل إلى السلة')
  })
  it('401 رسالة الجلسة', () => {
    expect(readerLoadErrorAr(new DaliliApiError(401, 'x'))).toBe('انتهت جلستك — سجّل الدخول من جديد لعرض الدليل')
  })
  it('فشل الشبكة يمرّر رسالة العميل الصادقة', () => {
    expect(readerLoadErrorAr(new DaliliApiError(0, 'تعذر الاتصال بالخادم'))).toBe('تعذر الاتصال بالخادم')
  })
  it('خطأ مجهول رسالة ثابتة محدّدة', () => {
    expect(readerLoadErrorAr(new Error('boom'))).toBe('تعذّر تحميل الدليل — أعد المحاولة')
  })
})
