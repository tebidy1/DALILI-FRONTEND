import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource/ibm-plex-sans-arabic/400.css'
import '@fontsource/ibm-plex-sans-arabic/500.css'
import '@fontsource/ibm-plex-sans-arabic/700.css'
import './index.css'
import { App } from './App'

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
