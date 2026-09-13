import React from 'react'
import { createRoot } from 'react-dom/client'
import { DaliliClient } from '@dalili/shared'
import { API_BASE } from '@/lib/config'
import { THEME_STORAGE_KEY, normalizeChoice, reconcileChoice } from '@/lib/theme-choice'
import { injectTheme } from '@/lib/theme-apply'
import { dismissSplash } from '@/lib/splash'
import './sidepanel.css'
import { App } from './App'

// لحظة بدء الرسمة في index.html — منها يُحسب ما تبقّى من حدّها الأدنى
const bootAt = Date.now()

// مزامنة الثيم (2026-09-06): الكاش المحلي يحقن فورًا للعرض بلا وميض، ثم قيمة
// الخادم (من overview) هي الحقيقة — اختلفت أُعيد الحقن وحُفظت. فشل النداء
// (غير مسجل/شبكة) يبقي الكاش كما هو. الحقن عبر theme-apply كي تعيد الإعدادات
// استعماله حيًّا عند تبديل الخيار من اللوحة.
injectTheme('classic')

async function boot() {
  const got = (await chrome.storage.local.get(THEME_STORAGE_KEY))[THEME_STORAGE_KEY]
  const cached = normalizeChoice(got)
  injectTheme(cached)

  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )

  // الشاشة تُرفع بعد أن يُركَّب React — ولا تؤخّره: إن طال الإقلاع صار الباقي صفرًا
  void dismissSplash(document, Date.now() - bootAt)

  try {
    const ov = await new DaliliClient(API_BASE).libraryOverview()
    const r = reconcileChoice(cached, ov.myTheme)
    if (r.changed) {
      await chrome.storage.local.set({ [THEME_STORAGE_KEY]: r.choice })
      injectTheme(r.choice)
    }
  } catch {
    // بلا جلسة أو بلا شبكة: الكاش المحلي يكفي — لا عطب ولا وميض
  }
}

void boot()
