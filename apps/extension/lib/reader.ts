/**
 * PNL-01: قارئ الدليل داخل اللوحة الجانبية — المنطق النقي كله هنا.
 * التحويل من GuideDto إلى عناصر عرض، وقرار زر المشاركة (بلا تجديد رمز قائم)،
 * وأهلية «دربني». لا chrome.* ولا DOM.
 */
import { DaliliApiError, type GuideDetailsDto, type GuideDto, type StepDto } from '@dalili/shared'
import { richToPlain, stepNumbers, type MarkRect, type RichText, type ZoomLimits } from '@dalili/core'
import { buildTrainPlan } from './train'
import { t } from './i18n'

/** تكبير القارئ أهدأ من الالتقاط: السياق حول العنصر يسمح بمقارنة الصفحة الحقيقية */
export const READER_ZOOM: ZoomLimits = { min: 1.5, max: 2.5, fill: 0.4 }

/** الدليل المفتوح في القارئ — chrome.storage.session يعيده بعد إغلاق اللوحة وفتحها */
export const READER_KEY = 'dalili:reader-open'

/** I18N-01: النصوص المشتركة دوالّ لا ثوابت — تُقرأ باللغة الحية لا بلغة لحظة الاستيراد */
export const noShotAr = () => t('ext.noShotReader')
export const externalEmbedAr = () => t('ext.externalEmbed')
export const externalMediaAr = () => t('ext.externalMedia')
export const trainFailAr = () => t('ext.trainFailReload')
export const copyFailAr = () => t('ext.copyFail')
export const publishFirstAr = () => t('ext.publishFirst')
export const staleAr = () => t('ext.staleCopy')

export interface ReaderShot {
  src: string
  mark?: MarkRect
  crop?: MarkRect
  /** مناطق الطمس: الملف المخزَّن غير مطموس، فتُرسم معتمة فوقه إلزاميًا */
  blur: MarkRect[]
}

export type ReaderItem =
  | { type: 'step'; id: string; n: number; title: string; note?: string; shot?: ReaderShot; missing?: string }
  | { type: 'header'; id: string; title: string }
  | { type: 'callout'; id: string; tone: 'tip' | 'alert'; text: string }
  | { type: 'text'; id: string; text: string }
  | { type: 'divider'; id: string }
  | { type: 'external'; id: string; label: string }

/** مفتاح الملف كما يحسبه الويب — آخر مقطع من fileUrl وإلا fileId — على أصل الخادم الحالي */
export function shotSrc(shot: { fileId: string; fileUrl?: string }, apiBase: string): string {
  const key = shot.fileUrl ? shot.fileUrl.split('/').pop() || shot.fileId : shot.fileId
  return `${apiBase}/files/${key}`
}

function shotOf(s: StepDto, apiBase: string): { shot?: ReaderShot; missing?: string } {
  const sh = s.screenshot
  if (!sh) return {}
  if ('missing' in sh) return { missing: sh.reason || noShotAr() }
  return { shot: { src: shotSrc(sh, apiBase), mark: sh.mark?.rect, crop: sh.crop, blur: sh.blurRects ?? [] } }
}

export function readerItems(guide: GuideDto, apiBase: string): ReaderItem[] {
  const nums = stepNumbers(guide.steps)
  return guide.steps.map((s, i): ReaderItem => {
    switch (s.block) {
      case 'header':
        return { type: 'header', id: s.id, title: s.title }
      case 'tip':
      case 'alert':
        return {
          type: 'callout',
          id: s.id,
          tone: s.block,
          text: s.rich?.length ? richToPlain(s.rich as RichText) : [s.title, s.note].filter(Boolean).join(' — '),
        }
      case 'text':
        return { type: 'text', id: s.id, text: s.rich?.length ? richToPlain(s.rich as RichText) : s.title }
      case 'divider':
        return { type: 'divider', id: s.id }
      case 'embed':
        return { type: 'external', id: s.id, label: externalEmbedAr() }
      case 'link':
      case 'image':
      case 'video':
        return { type: 'external', id: s.id, label: externalMediaAr() }
      default:
        return { type: 'step', id: s.id, n: nums[i] ?? i + 1, title: s.title, note: s.note, ...shotOf(s, apiBase) }
    }
  })
}

export function shareUrlFor(token: string, webBase: string): string {
  return `${webBase}/s/${token}`
}

export type ShareAction = { kind: 'copy'; url: string } | { kind: 'create' } | { kind: 'publish-first'; editorUrl: string }

/**
 * قرار زر «نسخ الرابط». تحذير: POST /share يحذف الرمز القديم ويولّد جديدًا،
 * فالإنشاء فقط حين لا مشاركة إطلاقًا. والخاص لا رابط له قبل النشر (قرار المالك 2026-09-10).
 */
export function shareAction(d: Pick<GuideDetailsDto, 'guide' | 'share' | 'visibility'>, webBase: string): ShareAction {
  if (d.share) return { kind: 'copy', url: shareUrlFor(d.share.token, webBase) }
  if (d.visibility === 'private') return { kind: 'publish-first', editorUrl: `${webBase}/g/${d.guide.id}` }
  return { kind: 'create' }
}

/** نفس شرط العارض: «دربني» يظهر فقط حين تكون في الدليل خطوة لها مرساة */
export function canTrain(guide: GuideDto): boolean {
  return buildTrainPlan(guide).length > 0
}

export function readerLoadErrorAr(err: unknown): string {
  if (err instanceof DaliliApiError) {
    if (err.status === 404) return t('ext.guideNotFound')
    if (err.status === 401 || err.status === 403) return t('ext.sessionExpired')
    return err.message
  }
  return t('ext.guideLoadFail')
}
