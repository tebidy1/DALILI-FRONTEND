// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { foldGesture, foldsIntoGesture, usableRect, visibleRepresentative, type GestureRecord } from './gesture'
import type { CaptureEvent } from './protocol'

/**
 * علة «الخطوة تُلتقط مرتين أو ثلاثًا» (بلاغ المالك 2026-09-06 على الدليل MtKW5SLkbdRs):
 * نقرة إنسان واحدة على زر تبديل يرسل لها المتصفح حتى ثلاثة أحداث خلال ١-٥ مليّثانية.
 * قياس حيّ في كروم (نفس اليوم) على ستة أنماط:
 *   A checkbox عارٍ                → click(input) → change
 *   B checkbox داخل label          → click(label) → click(input) → change
 *   C label[for]                   → click(label) → click(input) → change
 *   D حقل مخفيّ + span[role=radio] شقيق (claude.ai) → click(span) → change(input)
 *   E div[role=switch] بلا حقل     → click(div)
 *   F label + حقل مُخفى بصريًا      → click(label) → click(input) → change
 * الأنبوب كان يصنع خطوة لكل حدث لأنه لا يعرف مفهوم «إيماءة مستخدم واحدة».
 * هذه الوحدة هي ذلك المفهوم: إيماءة واحدة = خطوة واحدة، على العنصر **المرئي**.
 */

function rect(el: Element, x: number, y: number, w: number, h: number) {
  el.getBoundingClientRect = () =>
    ({ x, y, width: w, height: h, top: y, left: x, right: x + w, bottom: y + h, toJSON: () => ({}) }) as DOMRect
  return el
}

/** الحقل المخفيّ كما قاسته القاعدة الحية فعلًا: {-2,-2,2,2} */
function hidden(el: Element) {
  return rect(el, -2, -2, 2, 2)
}

function ev(kind: CaptureEvent['kind'], patch: Partial<CaptureEvent> = {}): CaptureEvent {
  return {
    kind,
    target: {},
    sensitive: false,
    url: 'https://x.test/a',
    pageTitle: 'ص',
    ts: 1000,
    dpr: 1,
    ...patch,
  }
}

describe('usableRect — المستطيل الضامر لا يصلح إطارًا ولا هدفًا', () => {
  it('مستطيل الحقل المخفيّ {-2,-2,2,2} مرفوض', () => {
    expect(usableRect({ x: -2, y: -2, w: 2, h: 2 })).toBe(false)
  })

  it('مستطيل ٢×٢ داخل الشاشة مرفوض أيضًا — الحجم وحده يكفي للحكم', () => {
    expect(usableRect({ x: 466, y: -2, w: 2, h: 2 })).toBe(false)
  })

  it('عنصر مدفوع بعيدًا يسار الشاشة (left:-9999px) مرفوض', () => {
    expect(usableRect({ x: -9999, y: 40, w: 120, h: 30 })).toBe(false)
  })

  it('عنصر أسفل الطيّة مقبول — التدريب يمرّر إليه، فليس مخفيًّا', () => {
    expect(usableRect({ x: 40, y: 4000, w: 120, h: 30 })).toBe(true)
  })

  it('مفتاح مرئي عادي مقبول', () => {
    expect(usableRect({ x: 40, y: 200, w: 90, h: 28 })).toBe(true)
  })
})

describe('visibleRepresentative — الحقل المخفيّ لا يفوز أبدًا', () => {
  it('النمط D (claude.ai): المفتاح المرئي شقيقٌ لا سلف — يُلتقط من عناصر الإيماءة', () => {
    document.body.innerHTML = '<div class="sw"><input type="radio" id="d"><span role="radio" id="s">Chat</span></div>'
    const input = hidden(document.querySelector('#d')!)
    const span = rect(document.querySelector('#s')!, 717, 713, 82, 43)
    // العلة القديمة: visualControl يصعد للأسلاف فقط فيعود بالحقل الضامر
    expect(visibleRepresentative(input, [span])).toBe(span)
  })

  it('النمط F: حقل مُخفى داخل label مرئي — يُحل بلا مساعدة الإيماءة (labels)', () => {
    document.body.innerHTML = '<label id="l"><input type="checkbox" id="f"><span>code</span></label>'
    const input = hidden(document.querySelector('#f')!)
    const label = rect(document.querySelector('#l')!, 40, 415, 63, 36)
    expect(visibleRepresentative(input, [])).toBe(label)
  })

  it('النمط C: label[for] في مكان آخر من الشجرة', () => {
    document.body.innerHTML = '<input type="checkbox" id="c"><div><label for="c" id="cl">for-label</label></div>'
    const input = hidden(document.querySelector('#c')!)
    const label = rect(document.querySelector('#cl')!, 60, 190, 53, 19)
    expect(visibleRepresentative(input, [])).toBe(label)
  })

  it('بلا label ولا شقيق: يصعد لأقرب سلف مرئي يحويه', () => {
    document.body.innerHTML = '<div id="wrap"><span id="in"><input type="checkbox" id="x"></span></div>'
    const input = hidden(document.querySelector('#x')!)
    rect(document.querySelector('#in')!, 0, 0, 2, 2) // السلف الأقرب ضامر أيضًا
    const wrap = rect(document.querySelector('#wrap')!, 10, 10, 100, 40)
    expect(visibleRepresentative(input, [])).toBe(wrap)
  })

  it('عنصر مرئي أصلًا يعود كما هو — لا صعود بلا سبب', () => {
    document.body.innerHTML = '<label id="l"><input type="checkbox" id="v"></label>'
    const input = rect(document.querySelector('#v')!, 10, 10, 18, 18)
    rect(document.querySelector('#l')!, 5, 5, 200, 30)
    expect(visibleRepresentative(input, [])).toBe(input)
  })

  it('لا مرشّح مرئيًا إطلاقًا → العنصر نفسه (صدق لا اختراع)', () => {
    document.body.innerHTML = '<div id="w"><input type="checkbox" id="z"></div>'
    const input = hidden(document.querySelector('#z')!)
    hidden(document.querySelector('#w')!)
    expect(visibleRepresentative(input, [])).toBe(input)
  })
})

describe('foldsIntoGesture — أي حدث قيمة ينتمي لهذه الإيماءة', () => {
  it('تبديل على نفس عنصر الإيماءة ينطوي (النمط A)', () => {
    document.body.innerHTML = '<input type="checkbox" id="a">'
    const input = rect(document.querySelector('#a')!, 10, 10, 13, 13)
    expect(foldsIntoGesture(input, 'toggle', [input])).toBe(true)
  })

  it('تبديل على حقل يحويه عنصر الإيماءة ينطوي (النمطان B و F)', () => {
    document.body.innerHTML = '<label id="l"><input type="checkbox" id="b"></label>'
    const input = hidden(document.querySelector('#b')!)
    const label = rect(document.querySelector('#l')!, 40, 126, 78, 19)
    expect(foldsIntoGesture(input, 'toggle', [label, input])).toBe(true)
  })

  it('تبديل على حقل مخفيّ شقيق لعنصر الإيماءة ينطوي (النمط D)', () => {
    document.body.innerHTML = '<div><input type="radio" id="d"><span role="radio" id="s">Chat</span></div>'
    const input = hidden(document.querySelector('#d')!)
    const span = rect(document.querySelector('#s')!, 717, 713, 82, 43)
    expect(foldsIntoGesture(input, 'toggle', [span])).toBe(true)
  })

  it('فخ 45 محفوظًا: كتابة حقلٍ آخر تُفرَّغ (blur) داخل نافذة نقرة المغادرة — لا تنطوي أبدًا', () => {
    // pointerdown@158 → change@160 → click@163 (قياس المالك الحي): الكتابة تقع
    // داخل إيماءة نقرة الزر. طيّها يحوّل «انقر حفظ» إلى «اكتب في الاسم» — كارثة صامتة.
    document.body.innerHTML = '<div><input id="a" type="text"><button id="b">حفظ</button></div>'
    const field = rect(document.querySelector('#a')!, 10, 10, 200, 30)
    const btn = rect(document.querySelector('#b')!, 220, 10, 80, 30)
    expect(foldsIntoGesture(field, 'input', [btn])).toBe(false)
  })

  it('اختيار مرئي من قائمة مجاورة (لا مخفيّ) لا ينطوي في نقرة زرٍ آخر', () => {
    document.body.innerHTML = '<div><select id="s"><option>واحد</option></select><button id="b">حفظ</button></div>'
    const sel = rect(document.querySelector('#s')!, 10, 10, 120, 30)
    const btn = rect(document.querySelector('#b')!, 140, 10, 80, 30)
    expect(foldsIntoGesture(sel, 'select', [btn])).toBe(false)
  })

  it('نقر القائمة نفسها ثم اختيار منها ينطوي — خطوة واحدة «اختر…» لا خطوتان', () => {
    document.body.innerHTML = '<select id="s"><option>واحد</option></select>'
    const sel = rect(document.querySelector('#s')!, 10, 10, 120, 30)
    expect(foldsIntoGesture(sel, 'select', [sel])).toBe(true)
  })
})

describe('foldGesture — إيماءة واحدة = خطوة واحدة', () => {
  it('النمط B/C/F: نقرتان (label ثم input) → خطوة واحدة على المرئي', () => {
    document.body.innerHTML = '<label id="l"><input type="checkbox" id="b"></label>'
    const label = rect(document.querySelector('#l')!, 40, 126, 78, 19)
    const input = hidden(document.querySelector('#b')!)
    const records: GestureRecord[] = [
      { ev: ev('click', { ts: 100 }), el: label },
      { ev: ev('click', { ts: 102 }), el: input },
    ]
    const out = foldGesture(records)!
    expect(out.ev.kind).toBe('click')
    expect(out.el).toBe(label)
  })

  it('النمط D: نقرة على span + تبديل على الحقل المخفيّ → خطوة تبديل واحدة على الـspan', () => {
    document.body.innerHTML = '<div><input type="radio" id="d"><span role="radio" id="s">Chat</span></div>'
    const input = hidden(document.querySelector('#d')!)
    const span = rect(document.querySelector('#s')!, 717, 713, 82, 43)
    const out = foldGesture([
      { ev: ev('click', { ts: 200, preTs: 190 }), el: span },
      { ev: ev('toggle', { ts: 206, value: 'on' }), el: input },
    ])!
    expect(out.ev.kind).toBe('toggle')
    expect(out.ev.value).toBe('on')
    expect(out.el).toBe(span) // الإطار والمرساة على المفتاح المرئي لا على {-2,-2,2,2}
    expect(out.ev.preTs).toBe(190) // لقطة الضغط تبقى مربوطة بالخطوة الناجية
    expect(out.ev.ts).toBe(200) // أبكر ختم — لا انقلاب ترتيب بعد اليوم
  })

  it('ثلاثة أحداث (النمط B مع تبديل) → خطوة واحدة', () => {
    document.body.innerHTML = '<label id="l"><input type="checkbox" id="b"></label>'
    const label = rect(document.querySelector('#l')!, 40, 126, 78, 19)
    const input = hidden(document.querySelector('#b')!)
    const out = foldGesture([
      { ev: ev('click', { ts: 300 }), el: label },
      { ev: ev('click', { ts: 302 }), el: input },
      { ev: ev('toggle', { ts: 304, value: 'off' }), el: input },
    ])!
    expect(out.ev.kind).toBe('toggle')
    expect(out.ev.value).toBe('off')
    expect(out.el).toBe(label)
  })

  it('الاختيار يتقدّم على التبديل ويتقدّمان على النقرة — الأغنى بالمعنى يفوز', () => {
    document.body.innerHTML = '<select id="s"><option>واحد</option></select>'
    const sel = rect(document.querySelector('#s')!, 10, 10, 120, 30)
    const out = foldGesture([
      { ev: ev('click', { ts: 400 }), el: sel },
      { ev: ev('select', { ts: 402, value: 'واحد' }), el: sel },
    ])!
    expect(out.ev.kind).toBe('select')
  })

  it('النمط E (زر تبديل بلا حقل): حدث واحد يبقى حدثًا واحدًا بلا تشويه', () => {
    document.body.innerHTML = '<div role="switch" id="e">مفتاح</div>'
    const div = rect(document.querySelector('#e')!, 40, 334, 73, 36)
    const out = foldGesture([{ ev: ev('click', { ts: 500 }), el: div }])!
    expect(out.ev.kind).toBe('click')
    expect(out.el).toBe(div)
  })

  it('إيماءة فارغة → لا خطوة', () => {
    expect(foldGesture([])).toBeNull()
  })
})
