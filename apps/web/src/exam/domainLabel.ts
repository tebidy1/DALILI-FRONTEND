import type { ExamDomain } from '@dalili/shared'
import { t } from '../i18n'

/** اسم المجال بالعربية (I18N-01) — المفاتيح في i18n/exam أسرة exam.domain.* */
export function domainLabel(domain: ExamDomain): string {
  return t(`exam.domain.${domain}` as const)
}
