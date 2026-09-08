import type { MineReportDto } from '@dalili/shared'
import { t } from '../i18n'
import { arDigits } from '../lib/format'

/** المرحلة ج: التقرير المجمّع أعلى «أنشئ بواسطي» — أرقام من الخادم لا تخمين */
export function ReportStrip({ report }: { report: MineReportDto }) {
  return (
    <div className="report-strip" role="group" aria-label={t('home.reportA11y')}>
      <StatCard num={report.total} label={t('home.reportTotal')} />
      <StatCard num={report.published} label={t('home.reportPublished')} />
      <StatCard num={report.views} label={t('home.reportViews')} />
      <StatCard num={report.openIssues} label={t('home.reportWaiting')} />
    </div>
  )
}

/** بطاقة رقم في شريط التقرير المجمّع — الرقم بأرقام عربية والوحدة تحته */
function StatCard({ num, label }: { num: number; label: string }) {
  return (
    <div className="stat-card">
      <span className="stat-num">{arDigits(num)}</span>
      <span className="stat-label">{label}</span>
    </div>
  )
}
