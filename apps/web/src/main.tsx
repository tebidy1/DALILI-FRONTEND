import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource/ibm-plex-sans-arabic/400.css'
import '@fontsource/ibm-plex-sans-arabic/500.css'
import '@fontsource/ibm-plex-sans-arabic/600.css'
import '@fontsource/ibm-plex-sans-arabic/700.css'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-sans/700.css'
import './index.css'
import { App } from './App'
import { applyTheme, readTheme } from './lib/theme'
import { applyLocale, readLocale } from './lib/locale'

// الثيم المحفوظ (الهوية الجديدة أو الجرافيت القديم) يُطبَّق قبل أول رسم كي لا يومض
applyTheme(readTheme())
// اللغة المحفوظة كذلك — قبل أول رسم كي لا يقفز اتجاه الصفحة (I18N-01)
applyLocale(readLocale())

// كنس التطوير: service worker عالق من تجربة قديمة على نفس المنفذ يتحكم في
// الصفحة، يغرق الكونسول، ويخزّن استجابات /api في Cache Storage — يُلغى
// تسجيله ومخازنه في التطوير فقط. الإنتاج لا يسجّل عاملًا أصلًا.
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.getRegistrations().then((regs) => {
    void Promise.all(regs.map((r) => r.unregister()))
    if (window.caches) {
      void window.caches.keys().then((keys) => Promise.all(keys.map((k) => window.caches.delete(k))))
    }
  })
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
