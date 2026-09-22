/**
 * خيار الثيم (2026-09-06): الهوية الجديدة (حبر ليلي — الافتراضي) أو الجرافيت القديم.
 * الاختيار يُطبَّق فورًا كسمة على <html data-theme> ويُحفظ محليًا لهذا الجهاز —
 * والرموز في ui/tokens.css تقرأ السمة.
 */

export type ThemeChoice = 'brand' | 'classic'

export const THEME_KEY = 'dalili:theme'

const VALID: readonly ThemeChoice[] = ['brand', 'classic']

/** الثيم المحفوظ لهذا الجهاز — القيمة الغريبة أو غياب التخزين = الافتراضي (الهوية الجديدة) */
export function readTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(THEME_KEY)
    return VALID.includes(v as ThemeChoice) ? (v as ThemeChoice) : 'brand'
  } catch {
    return 'brand'
  }
}

/** تطبيق الثيم على <html> بلا كتابة — بلا سمة = الهوية الجديدة */
export function applyTheme(choice: ThemeChoice): void {
  if (choice === 'classic') document.documentElement.dataset.theme = 'classic'
  else delete document.documentElement.dataset.theme
}

/** حفظ الاختيار وتطبيقه في خطوة واحدة */
export function setTheme(choice: ThemeChoice): void {
  try {
    localStorage.setItem(THEME_KEY, choice)
  } catch {
    // التخزين مرفوض (وضع خاص) — التطبيق الفوري يكفي لهذه الجلسة
  }
  applyTheme(choice)
}

/**
 * مزامنة الثيم: قيمة الخادم (myTheme من overview) هي الحقيقة — إن اختلفت عن
 * المحفوظ المحلي طُبِّقت وحُفظت، والعودة تشير هل تغيّر شيء.
 */
export function applyServerTheme(server: ThemeChoice): boolean {
  if (server === readTheme()) return false
  setTheme(server)
  return true
}
