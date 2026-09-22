// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { anchorOf, anchorTextOf } from './anchor-of'
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

  it('زر بلا أي ملامح: سلسلته تنحصر في المسار (الملاذ الأخير) وتظل صالحة', () => {
    document.body.innerHTML = '<div><div></div></div>'
    const inner = document.querySelector('div > div')!
    const chain = anchorOf(inner)!
    expect(chain.map((c) => c.k)).toEqual(['path'])
    expect(resolveAnchor(chain, realDom)?.el).toBe(inner)
  })
})
