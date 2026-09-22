// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { tokensCss } from '@dalili/core'
import { injectTheme, THEME_STYLE_ID } from './theme-apply'

/**
 * زر الإعدادات (2026-09-10): تبديل الثيم من اللوحة يُعاد حقنه حيًّا في عنصر
 * <style> واحد — لا تراكم أوراق أنماط، ولا وميض؛ main.tsx والإعدادات يستعملان نفس المسار.
 */

describe('injectTheme', () => {
  it('أول حقن ينشئ عنصر style واحدًا في head بمحتوى رموز الخيار', () => {
    document.head.innerHTML = ''
    injectTheme('brand')
    const els = document.head.querySelectorAll(`#${THEME_STYLE_ID}`)
    expect(els).toHaveLength(1)
    expect(els[0]!.textContent).toBe(tokensCss(':root', 'brand'))
  })

  it('الحقن التالي يعيد استعمال العنصر نفسه بمحتوى الخيار الجديد', () => {
    document.head.innerHTML = ''
    injectTheme('brand')
    injectTheme('classic')
    const els = document.head.querySelectorAll(`#${THEME_STYLE_ID}`)
    expect(els).toHaveLength(1)
    expect(els[0]!.textContent).toBe(tokensCss(':root', 'classic'))
  })
})
