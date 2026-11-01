import { useEffect, useState, useSyncExternalStore } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { getLocale, subscribeLocale } from './lib/locale'
import { LoginPage } from './auth/LoginPage'
import { AuthGate } from './auth/AuthGate'
import { HomePage } from './home/HomePage'
import { AppShell } from './shell/AppShell'
import { SettingsPage } from './settings/SettingsPage'
import { AssignedPage } from './assigned/AssignedPage'
import { EditorPage } from './editor/EditorPage'
import { CourseHome } from './course/player/CourseHome'
import { LessonPlayer } from './course/player/LessonPlayer'
import { VersionView } from './editor/VersionView'
import { ViewerPage } from './viewer/ViewerPage'
import { SearchPage } from './search/SearchPage'
import { DevicePage } from './devices/DevicePage'
import { SearchPalette } from './search/SearchPalette'
import { ShortcutsDialog } from './ui/ShortcutsDialog'
import { InvitePage } from './auth/InvitePage'
import { ForgotPage } from './auth/ForgotPage'
import { AdminConsole, TeamRoute } from './admin/AdminConsole'
import { PlatformConsole } from './platform/PlatformConsole'
import { ResetPage } from './auth/ResetPage'
import { BrandPage } from './brand/BrandPage'
import { ConfirmProvider } from './components/ConfirmProvider'

export function App() {
  const [showShortcuts, setShowShortcuts] = useState(false)
  // I18N-01: اشتراك اللغة — تبدّلها يعيد تركيب الشجرة (key) فتلتقط كل t() اللغة الجديدة.
  // التعادل مع تحديث الصفحة: الحفظ الآلي يغطي المحرر، والتبديل يجري من الإعدادات/الدخول.
  const locale = useSyncExternalStore(subscribeLocale, getLocale)

  // UX-04: «؟» تفتح قائمة الاختصارات من أي مكان — إلا أثناء الكتابة في حقل
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey) return
      const el = e.target
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el instanceof HTMLElement && el.isContentEditable)
      if (typing) return
      e.preventDefault()
      setShowShortcuts((v) => !v)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <ConfirmProvider>
      <div key={locale}>
        <SearchPalette />
        {showShortcuts && <ShortcutsDialog onClose={() => setShowShortcuts(false)} />}
        <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/invite/:token" element={<InvitePage />} />
        <Route path="/forgot" element={<ForgotPage />} />
        <Route path="/reset/:token" element={<ResetPage />} />
        {/* صفحة عرض الهوية البصرية — عامة كي يراها المالك بلا تسجيل */}
        <Route path="/brand" element={<BrandPage />} />
        {/* قشرة المساحة: شريط سكرايب للشاشات الرئيسية — المحرر والعارض والبحث مركّزة */}
        <Route element={<AuthGate><AppShell /></AuthGate>}>
          <Route path="/" element={<HomePage screen="home" />} />
          <Route path="/mine" element={<HomePage screen="mine" />} />
          <Route path="/saved" element={<HomePage screen="saved" />} />
          <Route path="/assigned" element={<AssignedPage />} />
          <Route path="/trash" element={<HomePage screen="trash" />} />
          <Route path="/team" element={<TeamRoute />} />
          <Route path="/audit" element={<Navigate to="/admin/audit" replace />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        {/* م٢: لوحتا الإدارة على هيكل واحد — الشركة لمديرها، والمنصة لنا */}
        <Route path="/admin/*" element={<AuthGate><AdminConsole /></AuthGate>} />
        <Route path="/platform/*" element={<AuthGate><PlatformConsole /></AuthGate>} />
        <Route path="/search" element={<AuthGate><SearchPage /></AuthGate>} />
        {/* DTOP-03: الموافقة على ربط جهاز — التطبيق يفتحها بـ/device?code=… */}
        <Route path="/device" element={<AuthGate><DevicePage /></AuthGate>} />
        {/* VER-01: عرض نسخة قديمة قراءةً فقط — لا استعادة في هذه المرحلة */}
        <Route path="/g/:id/v/:vid" element={<AuthGate><VersionView /></AuthGate>} />
        <Route path="/g/:id" element={<AuthGate><EditorPage /></AuthGate>} />
        {/* د١ب: الدورة بالدروس — صفحتها ومشغّل الدرس */}
        <Route path="/c/:id" element={<AuthGate><CourseHome /></AuthGate>} />
        <Route path="/c/:id/:lessonId" element={<AuthGate><LessonPlayer /></AuthGate>} />
        <Route path="/s/:token" element={<ViewerPage />} />
        <Route path="/embed/s/:token" element={<ViewerPage embed />} />
        <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </ConfirmProvider>
  )
}
