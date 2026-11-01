import type { AccountStatus } from '@dalili/shared'
import { t } from '../i18n'

const LABEL = { active: 'platform.statusActive', suspended: 'platform.statusSuspended', ended: 'platform.statusEnded' } as const

/** م٢: حالة الحساب بلون ونص — الموقوف والمنتهي لا يُفهمان من اللون وحده */
export function StatusChip({ status }: { status: AccountStatus }) {
  return <span className={`chip status-${status}`}>{t(LABEL[status])}</span>
}
