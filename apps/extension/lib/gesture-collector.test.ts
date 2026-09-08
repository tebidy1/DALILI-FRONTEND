// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGestureCollector, type FoldedGesture } from './gesture'
import { buildClickEvent, buildValueEvent } from './events'
import { pickInteractive } from './pick'
import type { CaptureEvent } from './protocol'

/**
 * **حارس علة «الخطوة تُلتقط مرتين أو ثلاثًا»** (بلاغ المالك 2026-09-06).
 *
 * هذا الملف يعيد تشغيل **تسلسلات أحداث مقيسة في كروم حقيقي** (2026-09-06، ستة
 * أنماط تبديل على صفحة اختبار حيّة) عبر آلة الإيماءة نفسها التي يستعملها سكربت
 * المحتوى — لا نسخةً منها. لكل نمط: كم خطوة كانت تُنتَج قبل الإصلاح، وكم يجب أن
 * تُنتَج الآن، وعلى أي عنصر.
 *
 * التسلسلات كما قِيست حرفيًا (الفوارق الزمنية ١-٦ مليّثانية):
 *   A `+181 click(input#a)` → `+184 change(input#a)`
 *   B `+41159 click(label#bl)` → `+41161 click(input#b)` → `+41164 change(input#b)`
 *   C `+187 click(label#cl)` → `+187 click(input#c)` → `+188 change(input#c)`
 *   D `+26365 click(span#dspan[role=radio])` → `+26366 change(input#d)`
 *   E `+190 click(div#e[role=switch])`
 *   F `+41202 click(label#fl)` → `+41204 click(input#f)` → `+41205 change(input#f)`
 */

function rect(el: Element, x: number, y: number, w: number, h: number) {
  el.getBoundingClientRect = () =>
    ({ x, y, width: w, height: h, top: y, left: x, right: x + w, bottom: y + h, toJSON: () => ({}) }) as DOMRect
  return el
}

/** المستطيل الضامر كما قاسه كروم للحقول المُخفاة بصريًا */
const HIDDEN: [number, number, number, number] = [-2, -2, 2, 2]

const URL_ = 'https://x.test/a'

/** يحاكي مسار سكربت المحتوى حرفيًا: pointerdown يفتح، click يضيف، change يطوي أو يستقل */
function runSequence(
  steps: Array<{ t: 'down' } | { t: 'click'; el: Element } | { t: 'change'; el: HTMLInputElement | HTMLSelectElement }>,
): { emitted: FoldedGesture[]; standalone: CaptureEvent[] } {
  const emitted: FoldedGesture[] = []
  const standalone: CaptureEvent[] = []
  const g = createGestureCollector((f) => emitted.push(f))
  for (const s of steps) {
    if (s.t === 'down') {
      g.open()
      continue
    }
    if (s.t === 'click') {
      const interactive = pickInteractive(s.el) ?? s.el
      g.addClick(buildClickEvent(interactive, URL_, 'ص', 1), interactive)
      continue
    }
    const ev = buildValueEvent(s.el, URL_, 'ص', 1, g.seen())
    if (!ev) continue
    if (!g.addValue(ev, s.el)) standalone.push(ev)
  }
  vi.advanceTimersByTime(500)
  return { emitted, standalone }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('createGestureCollector — تسلسلات كروم الحقيقية: ضغطة واحدة = خطوة واحدة', () => {
  it('النمط A (checkbox عارٍ): كانت خطوتين → خطوة تبديل واحدة', () => {
    document.body.innerHTML = '<input type="checkbox" id="a">'
    const input = rect(document.querySelector('#a')!, 44, 65, 13, 13) as HTMLInputElement
    const { emitted, standalone } = runSequence([{ t: 'down' }, { t: 'click', el: input }, { t: 'change', el: input }])
    expect(emitted).toHaveLength(1)
    expect(standalone).toHaveLength(0)
    expect(emitted[0]!.ev.kind).toBe('toggle')
    expect(emitted[0]!.el).toBe(input)
  })

  it('النمط B (checkbox داخل label): كانت ثلاث خطوات → خطوة واحدة على الـlabel', () => {
    document.body.innerHTML = '<label id="bl"><input type="checkbox" id="b"> wrapped</label>'
    const label = rect(document.querySelector('#bl')!, 40, 126, 78, 19)
    const input = rect(document.querySelector('#b')!, 44, 128, 13, 13) as HTMLInputElement
    const { emitted, standalone } = runSequence([
      { t: 'down' },
      { t: 'click', el: label },
      { t: 'click', el: input },
      { t: 'change', el: input },
    ])
    expect(emitted).toHaveLength(1)
    expect(standalone).toHaveLength(0)
    expect(emitted[0]!.ev.kind).toBe('toggle')
  })

  it('النمط C (label[for]): كانت ثلاث خطوات → خطوة واحدة', () => {
    document.body.innerHTML = '<input type="checkbox" id="c"><label for="c" id="cl">for-label</label>'
    const input = rect(document.querySelector('#c')!, 44, 192, 13, 13) as HTMLInputElement
    const label = rect(document.querySelector('#cl')!, 60, 190, 53, 19)
    const { emitted } = runSequence([
      { t: 'down' },
      { t: 'click', el: label },
      { t: 'click', el: input },
      { t: 'change', el: input },
    ])
    expect(emitted).toHaveLength(1)
    expect(emitted[0]!.ev.kind).toBe('toggle')
  })

  it('النمط D (claude.ai — حقل مخفيّ وشقيقه المرئي): كانت خطوتين → خطوة واحدة على الشقيق المرئي', () => {
    document.body.innerHTML =
      '<div class="sw"><input type="radio" id="d"><span role="radio" id="dspan">Chat</span></div>'
    const input = rect(document.querySelector('#d')!, ...HIDDEN) as HTMLInputElement
    const span = rect(document.querySelector('#dspan')!, 717, 713, 82, 43)
    const { emitted, standalone } = runSequence([{ t: 'down' }, { t: 'click', el: span }, { t: 'change', el: input }])
    expect(emitted).toHaveLength(1)
    expect(standalone).toHaveLength(0)
    const out = emitted[0]!
    expect(out.ev.kind).toBe('toggle')
    expect(out.el).toBe(span) // لا الحقل الضامر — عليه تُبنى المرساة ويُرسم الإطار
    expect(out.ev.rect).not.toEqual({ x: -2, y: -2, w: 2, h: 2 })
  })

  it('النمط E (div[role=switch] بلا حقل): خطوة واحدة كما كانت — لا تشويه لما كان سليمًا', () => {
    document.body.innerHTML = '<div role="switch" id="e">Switch</div>'
    const div = rect(document.querySelector('#e')!, 40, 334, 73, 36)
    const { emitted } = runSequence([{ t: 'down' }, { t: 'click', el: div }])
    expect(emitted).toHaveLength(1)
    expect(emitted[0]!.ev.kind).toBe('click')
    expect(emitted[0]!.el).toBe(div)
  })

  it('النمط F (label + حقل مُخفى بصريًا): كانت ثلاث خطوات → خطوة واحدة بإطار صالح', () => {
    document.body.innerHTML = '<label id="fl"><input type="checkbox" id="f"><span>code</span></label>'
    const label = rect(document.querySelector('#fl')!, 40, 415, 63, 36)
    const input = rect(document.querySelector('#f')!, ...HIDDEN) as HTMLInputElement
    const { emitted } = runSequence([
      { t: 'down' },
      { t: 'click', el: label },
      { t: 'click', el: input },
      { t: 'change', el: input },
    ])
    expect(emitted).toHaveLength(1)
    expect(emitted[0]!.ev.kind).toBe('toggle')
    expect(emitted[0]!.el).toBe(label)
    expect(emitted[0]!.ev.rect).toEqual({ x: 40, y: 415, w: 63, h: 36 })
  })

  it('قائمة منسدلة: نقرة ثم اختيار → خطوة «اختر…» واحدة لا نقرة + اختيار', () => {
    document.body.innerHTML = '<select id="s"><option>واحد</option><option selected>اثنان</option></select>'
    const sel = rect(document.querySelector('#s')!, 10, 10, 120, 30) as HTMLSelectElement
    const { emitted } = runSequence([{ t: 'down' }, { t: 'click', el: sel }, { t: 'change', el: sel }])
    expect(emitted).toHaveLength(1)
    expect(emitted[0]!.ev.kind).toBe('select')
    expect(emitted[0]!.ev.value).toBe('اثنان')
  })
})

describe('createGestureCollector — ما يجب ألّا ينطوي', () => {
  it('ضغطتان متتاليتان على زرين → خطوتان (لا ابتلاع)', () => {
    document.body.innerHTML = '<button id="a">أ</button><button id="b">ب</button>'
    const a = rect(document.querySelector('#a')!, 10, 10, 60, 30)
    const b = rect(document.querySelector('#b')!, 80, 10, 60, 30)
    const { emitted } = runSequence([{ t: 'down' }, { t: 'click', el: a }, { t: 'down' }, { t: 'click', el: b }])
    expect(emitted).toHaveLength(2)
  })

  it('فخ 45: كتابةُ حقلٍ تُفرَّغ (blur) داخل ضغطة زر المغادرة → خطوتان، والزر يبقى زرًّا', () => {
    // القياس الحيّ الذي كذّب الافتراض المعاكس: pointerdown@158 → change@160 → click@163
    document.body.innerHTML = '<div><input id="name" type="text"><button id="save">حفظ</button></div>'
    const field = rect(document.querySelector('#name')!, 10, 10, 200, 30) as HTMLInputElement
    field.value = 'شركة النور'
    const save = rect(document.querySelector('#save')!, 220, 10, 80, 30)
    const { emitted, standalone } = runSequence([
      { t: 'down' },
      { t: 'change', el: field },
      { t: 'click', el: save },
    ])
    expect(standalone).toHaveLength(1) // الكتابة خطوتها المستقلة كما كانت دائمًا
    expect(standalone[0]!.kind).toBe('input')
    expect(emitted).toHaveLength(1)
    expect(emitted[0]!.ev.kind).toBe('click') // «انقر حفظ» لم تتحوّل إلى «اكتب في الاسم»
    expect(emitted[0]!.el).toBe(save)
  })

  it('سقف عمر الإيماءة: أحداث متتابعة بلا انقطاع تُصدَر ولا تُحتجز أبدًا (قانون لا تعليق)', () => {
    document.body.innerHTML = '<button id="a">أ</button>'
    const a = rect(document.querySelector('#a')!, 10, 10, 60, 30)
    const emitted: FoldedGesture[] = []
    let clock = 0
    const g = createGestureCollector((f) => emitted.push(f), { now: () => clock })
    g.open()
    for (let i = 0; i < 40; i++) {
      g.addClick(buildClickEvent(a, URL_, 'ص', 1), a)
      clock += 50
      vi.advanceTimersByTime(50)
    }
    expect(emitted.length).toBeGreaterThan(0) // لم تُحتجز الخطوة خلف تتابعٍ لا ينقطع
  })
})
