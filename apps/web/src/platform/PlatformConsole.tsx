import { useEffect, useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import { client } from '../api'
import { t } from '../i18n'
import { ConsoleLayout } from '../console/ConsoleLayout'
import { MfaGate } from './MfaGate'
import { PlatformHome } from './PlatformHome'
import { AccountsPage } from './AccountsPage'
import { AccountDetail } from './AccountDetail'
import { UserLookup } from './UserLookup'
import { PlatformAudit } from './PlatformAudit'
import { SystemsPage } from './SystemsPage'

type Access = 'checking' | 'ok' | 'mfa' | 'denied'

/**
 * م٢ (الخطة §3.1): لوحة إدارة المنصة على /platform. الدخول يُحسم مرة واحدة هنا:
 * غير المدرج يرى الرفض، والمدرج بلا تحقق في هذه الجلسة يرى نموذج الرمز، ثم الأقسام.
 */
export function PlatformConsole() {
  const [access, setAccess] = useState<Access>('checking')

  useEffect(() => {
    const ac = new AbortController()
    client
      .platformSummary(ac.signal)
      .then(() => setAccess('ok'))
      .catch((err: { code?: string; name?: string }) => {
        if (err?.name === 'AbortError') return
        setAccess(err?.code === 'E-PLT-02' ? 'mfa' : 'denied')
      })
    return () => ac.abort()
  }, [])

  if (access === 'checking') return <div className="page-center">{t('auth.checking')}</div>
  if (access === 'denied') return <div className="page-center"><p className="card" role="alert">{t('platform.denied')}</p></div>
  if (access === 'mfa') return <MfaGate onVerified={() => setAccess('ok')} />

  return (
    <ConsoleLayout
      title={t('platform.title')}
      sections={[
        { to: '/platform', label: t('platform.navHome'), end: true },
        { to: '/platform/companies', label: t('platform.navCompanies') },
        { to: '/platform/partners', label: t('platform.navPartners') },
        { to: '/platform/systems', label: t('platform.navSystems') },
        { to: '/platform/users', label: t('platform.navUsers') },
        { to: '/platform/audit', label: t('platform.navAudit') },
      ]}
    >
      <Routes>
        <Route index element={<PlatformHome />} />
        <Route path="companies" element={<AccountsPage kind="company" />} />
        <Route path="partners" element={<AccountsPage kind="partner" />} />
        <Route path="systems" element={<SystemsPage />} />
        <Route path="accounts/:id" element={<AccountDetail />} />
        <Route path="users" element={<UserLookup />} />
        <Route path="audit" element={<PlatformAudit />} />
      </Routes>
    </ConsoleLayout>
  )
}
