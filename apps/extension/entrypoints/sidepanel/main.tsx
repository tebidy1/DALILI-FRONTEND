import React from 'react'
import { createRoot } from 'react-dom/client'
import { DaliliClient } from '@dalili/shared'
import { API_BASE } from '@/lib/config'
import { THEME_STORAGE_KEY, normalizeChoice, reconcileChoice } from '@/lib/theme-choice'
import { injectTheme } from '@/lib/theme-apply'
import { t } from '@/lib/i18n'
import { initI18nLocale, applyDocLocale, writeLocale, reconcileLocale } from '@/lib/locale-choice'
import { dismissSplash } from '@/lib/splash'
import '@fontsource/ibm-plex-sans-arabic/400.css'
import '@fontsource/ibm-plex-sans-arabic/500.css'
import '@fontsource/ibm-plex-sans-arabic/600.css'
import '@fontsource/ibm-plex-sans-arabic/700.css'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-sans/700.css'
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
  const got = (await chrome.storage.local.get([THEME_STORAGE_KEY, 'dalili:locale']))
  const cached = normalizeChoice(got[THEME_STORAGE_KEY])
  injectTheme(cached)
  // I18N-01: اللغة قبل أول رسم كي لا يقفز الاتجاه — ثم قيمة الخادم هي الحقيقة بعدها
  const locale = await initI18nLocale()
  applyDocLocale(locale, t('ext.title'))

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
    const rl = reconcileLocale(locale, ov.myLocale)
    if (rl.changed) {
      // الكتابة على التخزين تستيقظ usePrefs فتعيد اللوحة رسمها بالقاموس الجديد
      await writeLocale(rl.locale)
      applyDocLocale(rl.locale, t('ext.title'))
    }
  } catch {
    // بلا جلسة أو بلا شبكة: الكاش المحلي يكفي — لا عطب ولا وميض
  }
}

void boot()
