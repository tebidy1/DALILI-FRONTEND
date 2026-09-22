import { describe, expect, it } from 'vitest'
import { foldWithPrev } from './session'
import type { CaptureEvent, StoredStep } from './protocol'

/**
 * شبكة أمان الخلفية لعلة «الخطوة مرتين» (بلاغ المالك 2026-09-06).
 * الحلّ الأول في سكربت المحتوى (نافذة الإيماءة)، وهذه حزامٌ ثانٍ: لو مات عامل
 * الخلفية بين حدثين، أو جاء الحدثان من إطارين مختلفين، فلا تُخزَّن خطوتان
 * لتفاعلٍ واحد. القاعدة **ضيّقة عمدًا**: نقرة + حدث قيمة على العنصر نفسه خلال
 * نافذة قصيرة. نقرتان متطابقتان لا تُدمجان أبدًا — تكرار النقر فعلٌ مشروع
 * (زر «+» للكمية مثلًا) ولا يجوز ابتلاعه.
 */

const anchor = [{ k: 'path' as const, v: 'div:nth-of-type(1) > input:nth-of-type(1)' }]

function ev(kind: CaptureEvent['kind'], patch: Partial<CaptureEvent> = {}): CaptureEvent {
  return {
    kind,
    target: { anchor },
    sensitive: false,
    url: 'https://x.test/a',
    pageTitle: 'ص',
    ts: 1000,
    dpr: 1,
    ...patch,
  }
}

const step = (e: CaptureEvent): StoredStep => ({ ev: e })

describe('foldWithPrev — تفاعل واحد لا يصير خطوتين', () => {
  it('نقرة ثم تبديل على نفس المرساة خلال النافذة → تحلّ محلّ النقرة (الأغنى يفوز)', () => {
    expect(foldWithPrev(step(ev('click', { ts: 1000 })), ev('toggle', { ts: 1006, value: 'on' }))).toBe('replace')
  })

  it('تبديل ثم نقرة متأخرة على نفس المرساة → النقرة تُهمل (انقلاب الترتيب القديم)', () => {
    // الدليل الحيّ MtKW5SLkbdRs: الخطوة ١ ختمها …290 والخطوة ٢ ختمها …227 —
    // لأن النقرة كانت تتأخّر ١٦٠مث بينما change يُرسل فورًا
    expect(foldWithPrev(step(ev('toggle', { ts: 1290 })), ev('click', { ts: 1227 }))).toBe('drop')
  })

  it('نقرة ثم اختيار من نفس القائمة → خطوة «اختر…» واحدة', () => {
    expect(foldWithPrev(step(ev('click', { ts: 1000 })), ev('select', { ts: 1004, value: 'واحد' }))).toBe('replace')
  })

  it('نقرتان متطابقتان → خطوتان (تكرار النقر فعل مشروع لا تكرارًا)', () => {
    expect(foldWithPrev(step(ev('click', { ts: 1000 })), ev('click', { ts: 1200 }))).toBe('append')
  })

  it('خارج النافذة الزمنية → خطوتان مستقلّتان', () => {
    expect(foldWithPrev(step(ev('click', { ts: 1000 })), ev('toggle', { ts: 3000 }))).toBe('append')
  })

  it('رابط مختلف → لا طيّ (تفاعلان على صفحتين)', () => {
    expect(foldWithPrev(step(ev('click', { ts: 1000 })), ev('toggle', { ts: 1005, url: 'https://x.test/b' }))).toBe('append')
  })

  it('مرساتان مختلفتان ومستطيلان مختلفان → لا طيّ', () => {
    const prev = step(ev('click', { ts: 1000, rect: { x: 10, y: 10, w: 80, h: 30 } }))
    const next = ev('toggle', {
      ts: 1005,
      target: { anchor: [{ k: 'text', v: 'شيء آخر' }] },
      rect: { x: 500, y: 400, w: 60, h: 20 },
    })
    expect(foldWithPrev(prev, next)).toBe('append')
  })

  it('مرساتان مختلفتان لكن المستطيل واحد → طيّ (نفس الزر بعينَي حدثين)', () => {
    // الحالة الحية: الخطوتان ١٠ و١١ في دليل المالك بمستطيل {717,713,82,43} واحد
    const rect = { x: 717, y: 713, w: 82, h: 43 }
    const prev = step(ev('click', { ts: 1000, rect, target: { anchor: [{ k: 'text', v: 'Chat' }] } }))
    const next = ev('toggle', { ts: 1006, rect, target: { anchor } })
    expect(foldWithPrev(prev, next)).toBe('replace')
  })

  it('بلا خطوة سابقة → إلحاق', () => {
    expect(foldWithPrev(undefined, ev('toggle'))).toBe('append')
  })

  it('كتابة بعد نقرة لا تُطوى أبدًا — خطوتان مقصودتان (فخ 45)', () => {
    expect(foldWithPrev(step(ev('click', { ts: 1000 })), ev('input', { ts: 1005, value: 'س' }))).toBe('append')
  })

  it('تنقّل لا يُطوى في نقرة — له كبته الخاص (shouldDropConsequentNav)', () => {
    expect(foldWithPrev(step(ev('click', { ts: 1000 })), ev('navigate', { ts: 1005 }))).toBe('append')
  })
})
