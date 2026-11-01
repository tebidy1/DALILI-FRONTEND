import type { HelpRequestDto } from '@dalili/shared'
import { toArabicDigits } from '@/lib/ar-digits'
import { t } from '@/lib/i18n'

/** هـ ج١ (HLP) قائمة «طلبات شرح» — الزر والشاشة واسم الشركة والعدد، بلا أسماء موظفين.
 *  الشريك يفتح الشاشة بنفسه ويشرح الزر (لا زر «افتح الشاشة» — لا نخزّن روابط العملاء). */

export function HelpRequests({ requests }: { requests: HelpRequestDto[] }) {
  return (
    <details className="help-requests">
      <summary>{t('ext.helpRequestsTitle')}</summary>
      {requests.length === 0 ? (
        <p className="muted small">{t('ext.helpNoRequests')}</p>
      ) : (
        <ul>
          {requests.map((r) => (
            <li key={r.id} title={r.screenKey}>
              {t('ext.helpRequestRow', { label: r.label, company: r.companyName, n: toArabicDigits(r.count) })}
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}
