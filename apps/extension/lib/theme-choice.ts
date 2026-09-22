import type { ThemeTokensChoice } from '@dalili/core'

export type { ThemeTokensChoice }

/**
 * مزامنة الثيم (2026-09-06): الخيار المحلي (chrome.storage) للعرض الفوري عند
 * الإقلاع، وقيمة الخادم (myTheme في libraryOverview) هي الحقيقة إن وُصلنا —
 * هكذا يتبع الامتداد والموقع الاختيار نفسه المخزَّن لكل مستخدم.
 */

export const THEME_STORAGE_KEY = 'dalili:theme'

/** الامتداد وُلد جرافيتيًا — القيمة الغريبة أو الناقصة ترجع classic */
export function normalizeChoice(v: unknown): ThemeTokensChoice {
  return v === 'brand' ? 'brand' : 'classic'
}

/**
 * المفاضلة بين الكاش المحلي وقيمة الخادم — changed يخبر main.tsx هل يعيد
 * حقن الرموز ويكتب الكاش، أم أن كل شيء متطابق فلا لمسة.
 */
export function reconcileChoice(
  cached: ThemeTokensChoice,
  server: ThemeTokensChoice | undefined,
): { choice: ThemeTokensChoice; changed: boolean } {
  if (server !== 'brand' && server !== 'classic') return { choice: cached, changed: false }
  return server === cached ? { choice: cached, changed: false } : { choice: server, changed: true }
}
