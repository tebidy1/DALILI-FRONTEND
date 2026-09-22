import { tokensCss } from '@dalili/core'
import type { ThemeTokensChoice } from './theme-choice'

/**
 * زر الإعدادات (2026-09-10): حقن رموز الثيم في عنصر <style> واحد ثابت بالمعرّف —
 * main.tsx يحقنه عند الإقلاع، والإعدادات تعيد الحقن حيًّا عند تبديل الخيار بلا تراكم.
 */

export const THEME_STYLE_ID = 'dalili-theme-tokens'

export function injectTheme(choice: ThemeTokensChoice, doc: Document = document): HTMLStyleElement {
  let el = doc.getElementById(THEME_STYLE_ID) as HTMLStyleElement | null
  if (!el) {
    el = doc.createElement('style')
    el.id = THEME_STYLE_ID
    doc.head.appendChild(el)
  }
  el.textContent = tokensCss(':root', choice)
  return el
}
