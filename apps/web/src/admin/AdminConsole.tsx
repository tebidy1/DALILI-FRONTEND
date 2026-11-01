import { Navigate, Route, Routes } from 'react-router-dom'
import { t } from '../i18n'
import { ConsoleLayout } from '../console/ConsoleLayout'
import { OverviewProvider, useOverview } from '../shell/OverviewContext'
import { TeamPage } from '../team/TeamPage'
import { AuditPage } from '../audit/AuditPage'
import { AccountPage } from './AccountPage'
import { LibraryHealthPage } from './LibraryHealthPage'
import { OurSystemsPage } from './OurSystemsPage'
import { PartnerProfilePage } from './PartnerProfilePage'
import { PartnerClientsPage, PartnerReportsPage, PartnerSystemsPage } from './PartnerPages'
import type { LibraryOverviewDto } from '@dalili/shared'

/**
 * م٢ (الخطة §3.2): لوحة الشركة على /admin لمدير الحساب. تبدأ بالأقسام التي تعمل اليوم،
 * وتُضاف البقية في مراحلها (أنظمتنا في ج١، لحساب الشركة وحده) — لا قسم بلا محتوى.
 * الصفحات القائمة تُركّب كما هي، فلا تُعاد كتابتها.
 */
export function AdminConsole() {
  return (
    <OverviewProvider>
      <AdminSections />
    </OverviewProvider>
  )
}

/** /team: المدير يذهب للوحة الشركة، والموظف يبقى على صفحة الفريق كما هي */
export function TeamRoute() {
  const { overview } = useOverview()
  if (overview?.myRole === 'admin') return <Navigate to="/admin/members" replace />
  return <TeamPage />
}

/** أقسام اللوحة حسب نوع الحساب: الشريك شركة كاملة لفريقه + ملفه وعملاؤه وأنظمته (ش١)، و«أنظمتنا» للشركة وحدها (ج١) */
export function adminSections(overview: LibraryOverviewDto | null) {
  const kind = overview?.accountKind
  return [
    { to: '/admin/members', label: t('admin.navMembers') },
    ...(kind === 'company' ? [{ to: '/admin/systems', label: t('admin.navSystems') }] : []),
    ...(kind === 'partner'
      ? [
          { to: '/admin/profile', label: t('admin.navProfile') },
          { to: '/admin/clients', label: t('admin.navClients') },
          { to: '/admin/partner-systems', label: t('admin.navPartnerSystems') },
          { to: '/admin/reports', label: t('admin.navReports') },
        ]
      : []),
    { to: '/admin/account', label: t('admin.navAccount') },
    { to: '/admin/health', label: t('admin.navHealth') },
    { to: '/admin/audit', label: t('admin.navAudit') },
  ]
}

/** ش١: عنوان اللوحة باسم نوع الحساب */
export function adminTitle(overview: LibraryOverviewDto | null) {
  return t(overview?.accountKind === 'partner' ? 'admin.titlePartner' : 'admin.title')
}

function AdminSections() {
  const { overview } = useOverview()
  if (overview && overview.myRole !== 'admin') return <Navigate to="/team" replace />

  return (
    <ConsoleLayout
      title={adminTitle(overview)}
      sections={adminSections(overview)}
    >
      <Routes>
        <Route index element={<Navigate to="members" replace />} />
        <Route path="members" element={<TeamPage />} />
        <Route path="systems" element={<OurSystemsPage />} />
        <Route path="profile" element={<PartnerProfilePage />} />
        <Route path="clients" element={<PartnerClientsPage />} />
        <Route path="partner-systems" element={<PartnerSystemsPage />} />
        <Route path="reports" element={<PartnerReportsPage />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="health" element={<LibraryHealthPage />} />
        <Route path="audit" element={<AuditPage />} />
      </Routes>
    </ConsoleLayout>
  )
}
