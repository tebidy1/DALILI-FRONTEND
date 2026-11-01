import { describe, expect, it } from 'vitest'
import type { AnchorCandidate } from '@dalili/core'
import { isFieldEntryClick, scopeFromEntryClick, type EntryEnd } from './field-entry'

// مسارات حقيقية من دليل أودو lfTTuAZZZa9v (الخطوتان ١١ و١٢: نقر خلية الكمية ثم كتابة ٢)
const QTY_TD = 'div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(2) > table:nth-of-type(1) > tbody:nth-of-type(1) > tr:nth-of-type(3) > td:nth-of-type(3)'
const QTY_INPUT = 'div:nth-of-type(1) > div:nth-of-type(2) > table:nth-of-type(1) > tbody:nth-of-type(1) > tr:nth-of-type(3) > td:nth-of-type(3) > div:nth-of-type(1) > input:nth-of-type(1)'
const TEXTAREA = 'tbody:nth-of-type(1) > tr:nth-of-type(3) > td:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > textarea:nth-of-type(1)'

const end = (p: Partial<EntryEnd> & { kind: string }): EntryEnd => ({ url: 'https://o.test/odoo/sales/30', ...p })

describe('isFieldEntryClick — نقرةٌ للدخول إلى حقلٍ ثم الكتابة فيه = فعل واحد', () => {
  it('نقر الحقل نفسه ثم الكتابة فيه (المرساة ذاتها) — الخطوتان ٨→٩', () => {
    const a = [{ k: 'path', v: TEXTAREA }] as AnchorCandidate[]
    expect(isFieldEntryClick(end({ kind: 'click', role: 'textarea', anchor: a }), end({ kind: 'input', anchor: a }))).toBe(true)
  })

  it('نقر خلية جدول ثم الكتابة في حقلٍ داخلها (المسار يثبت البنوّة) — الخطوتان ١١→١٢', () => {
    expect(
      isFieldEntryClick(
        end({ kind: 'click', role: 'td', anchor: [{ k: 'name', v: 'product_uom_qty' }, { k: 'path', v: QTY_TD }] }),
        end({ kind: 'input', anchor: [{ k: 'path', v: QTY_INPUT }] }),
      ),
    ).toBe(true)
  })

  it('مستطيل النقرة يحتوي مستطيل الحقل ولا مرساة مشتركة — الحاوية ليست زرًا', () => {
    expect(
      isFieldEntryClick(
        end({ kind: 'click', role: 'div', rect: { x: 680, y: 830, w: 170, h: 70 } }),
        end({ kind: 'input', rect: { x: 694, y: 850, w: 153, h: 34 } }),
      ),
    ).toBe(true)
  })

  it('فخ ٤٥: نقر زرٍّ (حفظ/إضافة) ثم كتابة لا يُطوى أبدًا — النقرة فعلٌ له معنى', () => {
    const a = [{ k: 'path', v: TEXTAREA }] as AnchorCandidate[]
    expect(isFieldEntryClick(end({ kind: 'click', role: 'button', anchor: a }), end({ kind: 'input', anchor: a }))).toBe(false)
    expect(isFieldEntryClick(end({ kind: 'click', role: 'option', anchor: a }), end({ kind: 'input', anchor: a }))).toBe(false)
    expect(isFieldEntryClick(end({ kind: 'click', role: 'Button', anchor: a }), end({ kind: 'input', anchor: a }))).toBe(false)
  })

  it('صفحتان مختلفتان، أو ليست نقرة→كتابة، أو لا صلة = لا طيّ', () => {
    const a = [{ k: 'path', v: TEXTAREA }] as AnchorCandidate[]
    expect(isFieldEntryClick(end({ kind: 'click', role: 'textarea', anchor: a }), end({ kind: 'input', anchor: a, url: 'https://o.test/x' }))).toBe(false)
    expect(isFieldEntryClick(end({ kind: 'click', role: 'textarea', anchor: a }), end({ kind: 'click', anchor: a }))).toBe(false)
    expect(
      isFieldEntryClick(
        end({ kind: 'click', role: 'td', anchor: [{ k: 'path', v: 'tr:nth-of-type(1) > td:nth-of-type(9)' }], rect: { x: 0, y: 0, w: 10, h: 10 } }),
        end({ kind: 'input', anchor: [{ k: 'path', v: QTY_INPUT }], rect: { x: 694, y: 850, w: 153, h: 34 } }),
      ),
    ).toBe(false)
  })
})

describe('scopeFromEntryClick — اسم عمود الخلية المنقورة يصير مرساة دلالية للحقل', () => {
  it('يضيف `[name="…"] input` أولًا حين يفتقر الحقل لمرساة دلالية', () => {
    const out = scopeFromEntryClick([{ k: 'name', v: 'product_uom_qty' }, { k: 'path', v: QTY_TD }], [{ k: 'path', v: QTY_INPUT }])
    expect(out[0]).toEqual({ k: 'path', v: '[name="product_uom_qty"] input' })
    expect(out[1]).toEqual({ k: 'path', v: QTY_INPUT })
  })

  it('لا يغيّر مرساة الحقل إن كانت له مرساة دلالية أو لا اسم للنقرة', () => {
    const own: AnchorCandidate[] = [{ k: 'name', v: 'qty' }, { k: 'path', v: QTY_INPUT }]
    expect(scopeFromEntryClick([{ k: 'name', v: 'x' }], own)).toEqual(own)
    const bare: AnchorCandidate[] = [{ k: 'path', v: QTY_INPUT }]
    expect(scopeFromEntryClick([{ k: 'path', v: QTY_TD }], bare)).toEqual(bare)
  })
})
