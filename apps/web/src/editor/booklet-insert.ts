import type { StepDto } from '@dalili/shared'
import { t } from '../i18n'

/** BLK-01 + BKL-01: ما يمكن إدراجه ككتلة عميل (الالتقاط ليس منها — يذهب لتدفّق الامتداد) */
export type BlockInsertKind =
  | 'step'
  | 'tip'
  | 'alert'
  | 'header'
  | 'text'
  | 'embed'
  | 'divider'
  | 'link'
  | 'image'
  | 'video'

/** معرّف خطوة جديد — crypto إن توفّر وإلا بديل زمني */
export function newStepId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * BKL-01: بناء كتلة جديدة صالحة للعقد — نقي بلا DOM كي يُختبر وحده.
 * القيم الحيادية (`url:''`, `target:{}`) تجتاز zStep، فتعمل على الصورة كل أدوات الريشة.
 */
export function newBlockStep(
  kind: BlockInsertKind,
  opts: { guideId?: string; title?: string } = {},
): StepDto {
  const base: StepDto = {
    id: newStepId(),
    kind: 'navigate',
    title: opts.title ?? '',
    target: {},
    sensitive: false,
    url: '',
    pageTitle: '',
    ts: Date.now(),
  }
  switch (kind) {
    case 'step':
      // خطوة يدوية: بلا block فتُرقَّم كخطوة عادية
      return base
    // BKL-07 (طلب المالك 2026-09-07): التنبيه جملةٌ يكتبها صاحبها بشعار في بدايتها —
    // لا حقل عنوان ثم حقل ملاحظة. العنوان يبقى فارغًا فلا يُطبع سطرٌ لم يكتبه أحد.
    case 'tip':
      return { ...base, block: 'tip', rich: [{ para: 'p', runs: [{ text: '' }] }] }
    case 'alert':
      return { ...base, block: 'alert', rich: [{ para: 'p', runs: [{ text: '' }] }] }
    case 'header':
      return { ...base, block: 'header', title: opts.title ?? t('block.headerText') }
    case 'text':
      return { ...base, block: 'text', rich: [{ para: 'p', runs: [{ text: '' }] }] }
    case 'embed':
      return { ...base, block: 'embed', embed: { guideId: opts.guideId ?? '', expanded: false } }
    default:
      return { ...base, block: kind }
  }
}
