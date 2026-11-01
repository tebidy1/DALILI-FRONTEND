// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { anchorOf, anchorTextOf, ctxOf, labelOf } from './anchor-of'
import { cssAnchorFinder, resolveAnchor, type AnchorDom } from '@dalili/core'

/** DOM حقيقي (jsdom) لواجهة الحل — كما يستعملها وضع التدريب في الصفحة الهدف */
const realDom: AnchorDom<Element> = cssAnchorFinder(
  (sel) => Array.from(document.querySelectorAll(sel)),
  (el) => anchorTextOf(el),
)

describe('anchorOf — بطاقة تعريف العنصر من DOM (AUTO-01)', () => {
  it('زر بid: أول مرشح هو id ويحل فريدًا في صفحة أخرى', () => {
    document.body.innerHTML = '<button id="save-btn">حفظ</button>'
    const btn = document.querySelector('button')!
    const chain = anchorOf(btn)!
    expect(chain[0]).toEqual({ k: 'id', v: 'save-btn' })
    const hit = resolveAnchor(chain, realDom)
    expect(hit?.el).toBe(btn)
  })

  it('زر حديث بلا id: يمر عبر data-testid/aria/النص إلى مسار nth-of-type', () => {
    document.body.innerHTML = '<div><span data-testid="next">التالي</span><span>آخر</span></div>'
    const span = document.querySelector('span')!
    const chain = anchorOf(span)!
    expect(chain.map((c) => c.k)).toEqual(['testid', 'text', 'path'])
    const hit = resolveAnchor(chain, realDom)
    expect(hit?.el).toBe(span)
  })

  it('مسار nth-of-type يميّز الزر الثاني من نفس النوع داخل الأب', () => {
    document.body.innerHTML = '<div><button>إلغاء</button><button>حفظ</button></div>'
    const second = document.querySelectorAll('button')[1]!
    const chain = anchorOf(second)!
    const path = chain.find((c) => c.k === 'path')!
    expect(path.v).toContain('button:nth-of-type(2)')
    expect(resolveAnchor([path], realDom)?.el).toBe(second)
  })

  it('يقف عند أقرب سلف بid فيبنى المسار منه — لا نصعد للجذر عبثًا', () => {
    document.body.innerHTML = '<div id="toolbar"><div><button>حفظ</button></div></div>'
    const btn = document.querySelector('button')!
    const path = anchorOf(btn)!.find((c) => c.k === 'path')!
    expect(path.v.startsWith('[id="toolbar"]')).toBe(true)
    expect(path.v).not.toContain('body')
  })

  it('معرّف متطاير (React useId) لا يُلتقط id ولا يُثبَّت في المسار — يسقط لمرساةٍ مستقرّة', () => {
    // علة حقيقية: `_r_6_` كأقوى مرساة يطابق عنصرًا خاطئًا على صفحة التدريب الطازجة.
    document.body.innerHTML = '<div id="_r_5_"><div><button id="_r_6_">فعّل cowork</button></div></div>'
    const btn = document.querySelector('button')!
    const chain = anchorOf(btn)!
    // لا مرشّح id متطاير، والمسار بنيوي لا مثبّت على سلفٍ بمعرّف React
    expect(chain.some((c) => c.k === 'id')).toBe(false)
    const path = chain.find((c) => c.k === 'path')!
    expect(path.v).not.toContain('_r_')
    expect(path.v).toContain('body')
    expect(chain.some((c) => c.k === 'text' && c.v === 'فعّل cowork')).toBe(true)
  })

  it('نص زر الإدخال submit يؤخذ من value لا من innerText الفارغ', () => {
    document.body.innerHTML = '<input type="submit" value="اعتماد الفاتورة">'
    const input = document.querySelector('input')!
    expect(anchorTextOf(input)).toBe('اعتماد الفاتورة')
    expect(anchorOf(input)!.some((c) => c.k === 'text' && c.v === 'اعتماد الفاتورة')).toBe(true)
  })

  it('بلاغ أودو: حقل صفٍّ محرَّر بلا ملامح يرث اسم عموده — يُحل ولو تغيّر رقم الصف', () => {
    // وقت الالتقاط: الأمر فيه سطر واحد، فالسطر الجديد هو الصف الثاني
    const row = (n: number, edit: boolean) =>
      edit
        ? `<tr><td name="product_template_id"><div name="product_template_id" class="o_field_widget"><div><textarea></textarea></div></div></td></tr>`
        : `<tr><td name="product_template_id">منتج ${n}</td></tr>`
    document.body.innerHTML = `<table><tbody>${row(1, false)}${row(2, true)}</tbody></table>`
    const chain = anchorOf(document.querySelector('textarea')!)!
    expect(chain[0]).toEqual({ k: 'path', v: '[name="product_template_id"] textarea' })
    expect(chain.length).toBeLessThanOrEqual(6)
    // وقت التدريب: أمر بيع آخر فيه ثلاثة أسطر — السطر الجديد رابع، والمسار الموضعي يخطئه
    document.body.innerHTML = `<table><tbody>${row(1, false)}${row(2, false)}${row(3, false)}${row(4, true)}</tbody></table>`
    expect(resolveAnchor(chain, realDom)?.el).toBe(document.querySelector('textarea'))
  })

  it('العنصر ذو المرساة الدلالية الخاصة لا يُضاف له نطاق — السلسلة كما كانت', () => {
    document.body.innerHTML = '<div name="grp"><input name="qty"></div>'
    const chain = anchorOf(document.querySelector('input')!)!
    expect(chain.map((c) => c.k)).toEqual(['name', 'path'])
  })

  it('زر بلا أي ملامح: سلسلته تنحصر في المسار (الملاذ الأخير) وتظل صالحة', () => {
    document.body.innerHTML = '<div><div></div></div>'
    const inner = document.querySelector('div > div')!
    const chain = anchorOf(inner)!
    expect(chain.map((c) => c.k)).toEqual(['path'])
    expect(resolveAnchor(chain, realDom)?.el).toBe(inner)
  })
})

describe('labelOf / ctxOf — تسمية العنصر وسياقه (ث١ دربني الواثق)', () => {
  it('حقل داخل نافذة بتسمية = label وctx في السلسلة', () => {
    document.body.innerHTML = '<div role="dialog"><h4 class="modal-title">فاتورة جديدة</h4><label for="c">الزبون</label><input id="c"></div>'
    const chain = anchorOf(document.getElementById('c')!)!
    expect(chain).toContainEqual({ k: 'label', v: 'الزبون' })
    expect(chain).toContainEqual({ k: 'ctx', v: 'فاتورة جديدة' })
  })

  it('خلية جدول تأخذ رأس عمودها تسميةً', () => {
    document.body.innerHTML = '<table><thead><tr><th>المنتج</th><th>الكمية</th></tr></thead><tbody><tr><td>أ</td><td><input></td></tr></tbody></table>'
    expect(labelOf(document.querySelector('input')!)).toBe('الكمية')
  })

  it('aria-labelledby يسبق label المغلِّف', () => {
    document.body.innerHTML = '<span id="l">البريد</span><label>غيره <input aria-labelledby="l"></label>'
    expect(labelOf(document.querySelector('input')!)).toBe('البريد')
  })

  it('خارج النوافذ: لا سياق — مسار أودو اسم السجل (INV/2026/0003) يتغيّر بين السجلات (مراجعة C1)', () => {
    document.body.innerHTML = '<form class="o_form_view"><ol class="breadcrumb"><li class="breadcrumb-item active">INV/2026/0003</li></ol><h1>INV/2026/0003</h1><button>اعتمد</button></form>'
    expect(ctxOf(document.querySelector('button')!)).toBe('')
  })

  it('عنصر بلا تسمية ولا سياق = لا مرشّحين جديدين (لا ضجيج)', () => {
    document.body.innerHTML = '<button>حفظ</button>'
    expect(anchorOf(document.querySelector('button')!)!.some((c) => c.k === 'label' || c.k === 'ctx')).toBe(false)
  })
})
