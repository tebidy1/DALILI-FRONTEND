import React from 'react'
import { createRoot } from 'react-dom/client'
import { tokensCss } from '@dalili/core'
import { DaliliClient } from '@dalili/shared'
import { API_BASE } from '@/lib/config'
import { THEME_STORAGE_KEY, normalizeChoice, reconcileChoice, type ThemeTokensChoice } from '@/lib/theme-choice'
import './sidepanel.css'
import { App } from './App'

// مزامنة الثيم (2026-09-06): الكاش المحلي يحقن فورًا للعرض بلا وميض، ثم قيمة
// الخادم (من overview) هي الحقيقة — اختلفت أُعيد الحقن وحُفظت. فشل النداء
// (غير مسجل/شبكة) يبقي الكاش كما هو.
const tokenStyle = document.createElement('style')
tokenStyle.textContent = tokensCss(':root', 'classic')
document.head.appendChild(tokenStyle)

function inject(choice: ThemeTokensChoice) {
  tokenStyle.textContent = tokensCss(':root', choice)
}

async function boot() {
  const got = (await chrome.storage.local.get(THEME_STORAGE_KEY))[THEME_STORAGE_KEY]
  const cached = normalizeChoice(got)
  inject(cached)

  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )

  try {
    const ov = await new DaliliClient(API_BASE).libraryOverview()
    const r = reconcileChoice(cached, ov.myTheme)
    if (r.changed) {
      await chrome.storage.local.set({ [THEME_STORAGE_KEY]: r.choice })
      inject(r.choice)
    }
  } catch {
    // بلا جلسة أو بلا شبكة: الكاش المحلي يكفي — لا عطب ولا وميض
  }
}

void boot()
