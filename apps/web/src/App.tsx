import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { LoginPage } from './auth/LoginPage'
import { AuthGate } from './auth/AuthGate'
import { HomePage } from './home/HomePage'
import { AppShell } from './shell/AppShell'
import { SettingsPage } from './settings/SettingsPage'
import { EditorPage } from './editor/EditorPage'
import { ViewerPage } from './viewer/ViewerPage'
import { SearchPage } from './search/SearchPage'
import { SearchPalette } from './search/SearchPalette'
import { ShortcutsDialog } from './ui/ShortcutsDialog'
import { TeamPage } from './team/TeamPage'

export function App() {
  const [showShortcuts, setShowShortcuts] = useState(false)

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
    <>
      <SearchPalette />
      {showShortcuts && <ShortcutsDialog onClose={() => setShowShortcuts(false)} />}
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        {/* قشرة المساحة: شريط سكرايب للشاشات الرئيسية — المحرر والعارض والبحث مركّزة */}
        <Route element={<AuthGate><AppShell /></AuthGate>}>
          <Route path="/" element={<HomePage screen="home" />} />
          <Route path="/mine" element={<HomePage screen="mine" />} />
          <Route path="/saved" element={<HomePage screen="saved" />} />
          <Route path="/trash" element={<HomePage screen="trash" />} />
          <Route path="/team" element={<TeamPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="/search" element={<AuthGate><SearchPage /></AuthGate>} />
        <Route path="/g/:id" element={<AuthGate><EditorPage /></AuthGate>} />
        <Route path="/s/:token" element={<ViewerPage />} />
        <Route path="/embed/s/:token" element={<ViewerPage embed />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
