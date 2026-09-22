import type { RichTextDto, StepDto } from '@dalili/shared'

/**
 * BKL-07: التنبيه/التحذير صار **جملةً منسّقة** بشعار في بدايتها (طلب المالك 2026-09-07)،
 * بعد أن كان حقلَي «عنوان» و«ملاحظة». الكتل القديمة لا تُهجَر ولا تُعدَّل في مكانها:
 * تُقرأ جملتُها من العنوان والملاحظة عند العرض، ولا يُكتب `rich` إلا حين يحرّرها صاحبها.
 */
export function calloutRich(step: Pick<StepDto, 'rich' | 'title' | 'note'>): RichTextDto {
  if (step.rich?.length) return step.rich
  const runs = []
  if (step.title.trim()) runs.push({ text: step.title.trim(), b: true })
  if (step.note?.trim()) runs.push({ text: (runs.length ? ' — ' : '') + step.note.trim() })
  return runs.length ? [{ para: 'p' as const, runs }] : [{ para: 'p' as const, runs: [{ text: '' }] }]
}

/** هل للكتلة محتوى مرئي أصلًا — كي لا نرسم بطاقة فارغة في وضع القراءة */
export function calloutHasText(step: Pick<StepDto, 'rich' | 'title' | 'note'>): boolean {
  return calloutRich(step).some((p) => p.runs.some((r) => r.text.trim().length > 0))
}
