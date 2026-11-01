import { describe, expect, it } from 'vitest'
import { safeAnchor, findByAnchor, type Anchored } from './help'
import type { AnchorDom } from './anchor'

/** هـ ج١ (HLP): المرساة الآمنة والمطابقة على الشاشة نفسها */

describe('safeAnchor', () => {
  it('يحذف مرشّح ctx (سياق قد يحمل اسم عميل) ويبقي الباقي بترتيبه', () => {
    expect(safeAnchor([{ k: 'id', v: 'confirm' }, { k: 'ctx', v: 'INV/2026/0001' }, { k: 'text', v: 'تأكيد' }]))
      .toEqual([{ k: 'id', v: 'confirm' }, { k: 'text', v: 'تأكيد' }])
  })

  it('سلسلة بلا ctx تعود كما هي', () => {
    const chain = [{ k: 'id', v: 'a' }, { k: 'text', v: 'b' }] as const
    expect(safeAnchor([...chain])).toEqual([...chain])
  })
})

/** عناصر الاختبار: كائنات بسيطة، والاحتواء يُعرَّف صريحًا في كل اختبار */
interface El {
  tag: string
}
const el = (tag: string): El => ({ tag })

/** منفذ حلّ زائف: فهرس «k:v» ← عناصر مطابقة */
function fakeDom(index: Record<string, El[]>): AnchorDom<El> {
  return { find: (c) => index[`${c.k}:${c.v}`] ?? [] }
}

interface Item extends Anchored {
  id: string
}

const KEY_INVOICE = 'account form web'
const KEY_PURCHASE = 'order purchase web'

describe('findByAnchor', () => {
  it('لا يطابق إلا على مفتاح الشاشة نفسه — عنصر على شاشة أخرى لا يُرى', () => {
    const confirm = el('button-confirm')
    const dom = fakeDom({ 'id:confirm': [confirm] })
    const item: Item = { id: 'n1', anchor: [{ k: 'id', v: 'confirm' }], screenKey: KEY_INVOICE }
    expect(findByAnchor([item], KEY_PURCHASE, confirm, dom, () => false)).toBeNull()
  })

  it('يطابق إن كان المحلول هو المضغوط نفسه، أو داخله، أو حاويًا له', () => {
    const picked = el('button-confirm')
    const iconInside = el('span-icon') // مرساة الزر حلّت إلى أيقونته داخله
    const wrapAround = el('div-toolbar') // مرساة حلّت إلى حاوية تضمّه
    const dom = fakeDom({ 'id:confirm': [picked], 'id:icon': [iconInside], 'id:wrap': [wrapAround] })
    const mk = (anchor: Item['anchor']): Item => ({ id: anchor[0]!.v, anchor, screenKey: KEY_INVOICE })
    const self = mk([{ k: 'id', v: 'confirm' }])
    const inner = mk([{ k: 'id', v: 'icon' }])
    const outer = mk([{ k: 'id', v: 'wrap' }])
    // احتواء صريح: الزر يحوي الأيقونة، والشريط يحوي الزر
    const contains = (outerEl: El, innerEl: El) =>
      (outerEl === picked && innerEl === iconInside) || (outerEl === wrapAround && innerEl === picked)
    expect(findByAnchor([self], KEY_INVOICE, picked, dom, contains)).toBe(self)
    expect(findByAnchor([inner], KEY_INVOICE, picked, dom, contains)).toBe(inner)
    expect(findByAnchor([outer], KEY_INVOICE, picked, dom, contains)).toBe(outer)
  })

  it('يعيد أول عنصر مطابق بترتيب القائمة', () => {
    const confirm = el('button-confirm')
    const dom = fakeDom({ 'id:confirm': [confirm] })
    const first: Item = { id: 'first', anchor: [{ k: 'id', v: 'confirm' }], screenKey: KEY_INVOICE }
    const second: Item = { id: 'second', anchor: [{ k: 'id', v: 'confirm' }], screenKey: KEY_INVOICE }
    expect(findByAnchor([first, second], KEY_INVOICE, confirm, dom, () => false)).toBe(first)
    expect(findByAnchor([second, first], KEY_INVOICE, confirm, dom, () => false)).toBe(second)
  })

  it('مرساة لا تحلّ إلى شيء → لا مطابقة', () => {
    const picked = el('button-confirm')
    const dom = fakeDom({ 'id:confirm': [] })
    const item: Item = { id: 'n1', anchor: [{ k: 'id', v: 'confirm' }], screenKey: KEY_INVOICE }
    expect(findByAnchor([item], KEY_INVOICE, picked, dom, () => false)).toBeNull()
  })
})
