import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Link, Outlet } from 'react-router-dom'
import { client } from '../api'
import { Button } from '../ui/Button'
import {
  IconBookmark,
  IconFolder,
  IconHome,
  IconSettings,
  IconTrash,
  IconUser,
  IconUsers,
} from '../ui/icons'
import { t } from '../i18n'
import { roleLabelAr } from '../lib/format'
import { PathMark } from '../brand/PathMark'
import { useOverview, OverviewProvider } from './OverviewContext'
import { FoldersSection } from './FoldersSection'

/**
 * قشرة المساحة على نمط المرجع (سكرايب معكوسًا RTL): الشريط يمينًا ببنود التنقل
 * (الرئيسية · أنشئ بواسطي · المحفوظات · الفرق · الإعداد)، ثم قسم المساحة
 * (كل المستندات · السلة · المجلدات بCrud)، وأسفله «دعوة زميل» وبطاقة المستخدم بدوره.
 * البحث انتقل لمتن الشاشات الأولى (طلب المالك 2026-09-03) — انظر HomePage.
 * المحرر والعارض والبحث الكامل صفحات مركّزة بلا شريط. المشاهد بلا أزرار كتابة.
 */

export function AppShell() {
  return (
    <OverviewProvider>
      <div className="shell">
        <Sidebar />
        <main className="shell-main">
          <Outlet />
        </main>
      </div>
    </OverviewProvider>
  )
}

function Sidebar() {
  const { overview } = useOverview()
  const navigate = useNavigate()
  const location = useLocation()
  const [sp] = useSearchParams()
  const folder = sp.get('folder')

  const isViewer = overview?.myRole === 'viewer'

  async function logout() {
    await client.logout().catch(() => {})
    navigate('/login')
  }

  const roleLabel = overview ? roleLabelAr(overview.myRole) : ''

  const navItems = [
    { to: '/', label: t('home.navHome'), icon: <IconHome size={17} />, exact: true },
    { to: '/mine', label: t('home.navMine'), icon: <IconUser size={17} /> },
    { to: '/saved', label: t('home.navSaved'), icon: <IconBookmark size={17} /> },
    { to: '/team', label: t('home.navTeam'), icon: <IconUsers size={17} /> },
    { to: '/settings', label: t('home.navSettings'), icon: <IconSettings size={17} /> },
  ]

  return (
    <aside className="sidebar" aria-label={t('app.name')}>
      <div className="side-brand">
        {/* هوية البراند: درج المسار بجانب الاسم — يرث لون الثيم من currentColor */}
        <div className="side-brand-row">
          <PathMark size={22} />
          <span className="brand">{t('app.name')}</span>
        </div>
        {overview && <span className="ws-name">{overview.workspaceName || t('home.workspaceFallback')}</span>}
      </div>

      <nav className="side-nav" aria-label={t('home.navNav')}>
        {navItems.map((item) => {
          const active = item.exact ? location.pathname === '/' : location.pathname === item.to
          return (
            <Link key={item.to} className={`side-item${active ? ' sel' : ''}`} aria-current={active ? 'page' : undefined} to={item.to}>
              {item.icon}
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="side-ws">
        <div className="side-sec">{overview?.workspaceName || t('home.workspaceFallback')}</div>
        <nav className="side-nav" aria-label={t('home.navLibrary')}>
          <Link className={`side-item${location.pathname === '/' && folder ? ' sel' : ''}`} to="/">
            <IconFolder size={16} />
            <span>{t('home.wsAllDocs')}</span>
          </Link>
          <Link className={`side-item${location.pathname === '/trash' ? ' sel' : ''}`} to="/trash">
            <IconTrash size={16} />
            <span>{t('home.viewTrash')}</span>
          </Link>
        </nav>

        {/* قسم المجلدات بنمط Team Directory — إنشاء/بحث/تسمية/حذف وإدارة الرابط */}
        <FoldersSection isViewer={isViewer} />
      </div>

      <div className="side-bottom">
        <button className="invite-btn" onClick={() => navigate('/team')}>
          <IconUsers size={16} />
          <span>{t('home.invite')}</span>
        </button>
        <div className="side-user">
          {overview && (
            <>
              <span className="muted side-email">{overview.myEmail}</span>
              <span className="chip role-chip">{roleLabel}</span>
            </>
          )}
          <Button size="sm" variant="ghost" onClick={logout}>
            {t('common.logout')}
          </Button>
        </div>
      </div>
    </aside>
  )
}
