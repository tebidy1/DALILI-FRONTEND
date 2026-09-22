// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { INTERACTIVE_SELECTOR, pickInteractive } from './pick'

/** علة: عناصر تفاعلية كثيرة (div/span بأدوار ARIA أو cursor:pointer) لا تُؤشَّر
 *  ولا يظهر الإطار على لقطتها — كاشف موحّد واحد يحكم الحلقة وإسناد النقرة معًا. */

const noCursor = () => 'auto'
const pointer = () => 'pointer'

function add(tag: string, attrs: Record<string, string> | '' = '', parent: Element = document.body): Element {
  const el = document.createElement(tag)
  if (attrs) for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  parent.appendChild(el)
  return el
}

describe('pickInteractive — الكاشف الموحّد للعناصر التفاعلية', () => {
  it('عناصر قوية أصيلة: button/a/input/select/textarea/summary/label', () => {
    for (const tag of ['button', 'a', 'input', 'select', 'textarea', 'summary', 'label']) {
      const el = add(tag, { href: tag === 'a' ? '#' : '' })
      expect(pickInteractive(el, noCursor), tag).toBe(el)
    }
  })

  it('أدوار ARIA التفاعلية: tab/menuitem/link/switch/option/checkbox/treeitem', () => {
    for (const role of ['tab', 'menuitem', 'link', 'switch', 'option', 'checkbox', 'radio', 'treeitem', 'combobox', 'textbox', 'slider']) {
      const el = add('div', { role })
      expect(pickInteractive(el, noCursor), role).toBe(el)
    }
  })

  it('contenteditable و tabindex=0 (لا −1) و aria-haspopup و onclick', () => {
    expect(pickInteractive(add('div', { contenteditable: 'true' }), noCursor)).toBeTruthy()
    expect(pickInteractive(add('div', { tabindex: '0' }), noCursor)).toBeTruthy()
    expect(pickInteractive(add('div', { tabindex: '-1' }), noCursor)).toBeNull()
    expect(pickInteractive(add('div', { 'aria-haspopup': 'menu' }), noCursor)).toBeTruthy()
    expect(pickInteractive(add('div', { onclick: 'x' }), noCursor)).toBeTruthy()
  })

  it('عنصر داخلي (أيقونة span) داخل زر → الزر نفسه (closest)', () => {
    const btn = add('button')
    const icon = add('span', '', btn)
    expect(pickInteractive(icon, noCursor)).toBe(btn)
  })

  it('div بcursor:pointer → هدف التأشير (زر مخصص بلا وسم button)', () => {
    const el = add('div', { class: 'menu-item' })
    expect(pickInteractive(el, pointer)).toBe(el)
  })

  it('أيقونة داخل div بcursor:pointer (الأيقونة نفسها auto) → الحاوية (أقرب سلف مؤشر)', () => {
    const wrap = add('div', { class: 'card' })
    const icon = add('span', '', wrap)
    const cursorOnCardOnly = (target: Element) => (target === wrap ? 'pointer' : 'auto')
    expect(pickInteractive(icon, cursorOnCardOnly)).toBe(wrap)
  })

  it('div عادي بلا مؤشر ولا دور → null (لا حلقة على النص العادي)', () => {
    expect(pickInteractive(add('div'), noCursor)).toBeNull()
    expect(pickInteractive(add('p'), noCursor)).toBeNull()
  })

  it('cursor:pointer على body فقط → null (لا حلقة على الصفحة كلها)', () => {
    const el = add('div')
    const cursorOnBodyOnly = (target: Element) => (target === document.body ? 'pointer' : 'auto')
    expect(pickInteractive(el, cursorOnBodyOnly)).toBeNull()
  })

  it('مضيف طبقة دليلي مستبعد حتى لو حمل صفة تفاعلية', () => {
    const host = add('dalili-overlay')
    const inner = add('div', { role: 'button' }, host)
    expect(pickInteractive(inner, noCursor)).toBeNull()
  })

  it('المنتقى النصي جاهز للاستعلام ويشمل الأدوار', () => {
    expect(INTERACTIVE_SELECTOR).toContain('[role="tab"]')
    expect(INTERACTIVE_SELECTOR).toContain('[contenteditable="true"]')
    expect(INTERACTIVE_SELECTOR).toContain('button')
  })
})
