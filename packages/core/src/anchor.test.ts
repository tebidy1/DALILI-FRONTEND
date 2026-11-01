import { describe, expect, it } from 'vitest'
import {
  anchorNormText,
  anchorToSelector,
  buildAnchorChain,
  cssAnchorFinder,
  isEphemeralId,
  resolveAnchor,
  TEXT_ANCHOR_SEL,
  type AnchorChain,
  type AnchorDom,
} from './anchor'

/** DOM زائف للفحص: خريطة محدِّد → عناصر، ودالة نص لكل عنصر — عبر محوّل CSS نفسه الذي يستعمله الامتداد */
function fakeDom(bySel: Record<string, string[]>, texts: Record<string, string> = {}): AnchorDom<string> {
  return cssAnchorFinder(
    (sel) => bySel[sel] ?? [],
    (el) => texts[el] ?? el,
  )
}

describe('buildAnchorChain — بطاقة تعريف الزر (AUTO-01)', () => {
  it('يبني السلسلة بترتيب الأولوية الملزم: id ثم testid ثم aria ثم name ثم نص ثم مسار', () => {
    const chain = buildAnchorChain({
      tag: 'button',
      id: 'save-btn',
      testid: 'submit',
      ariaLabel: 'حفظ',
      name: 'action',
      text: 'حفظ التغييرات',
      path: 'body > div:nth-of-type(2) > button:nth-of-type(1)',
    })
    expect(chain.map((c) => c.k)).toEqual(['id', 'testid', 'aria', 'name', 'text', 'path'])
    expect(chain[0]).toEqual({ k: 'id', v: 'save-btn' })
    expect(chain[4]).toEqual({ k: 'text', v: 'حفظ التغييرات' })
  })

  it('يتخطى الحقول الفارغة والمسافات فقط — لا مرشح بلا قيمة', () => {
    const chain = buildAnchorChain({ tag: 'div', id: '  ', ariaLabel: '', path: 'body > div:nth-of-type(3)' })
    expect(chain).toEqual([{ k: 'path', v: 'body > div:nth-of-type(3)' }])
  })

  it('يطبّع النص: يدمج المسافات ويقص عند ٨٠ حرفًا بعلامة قطع', () => {
    const long = 'كلمة '.repeat(30)
    const chain = buildAnchorChain({ tag: 'a', text: `  ${long} ` })
    expect(chain).toHaveLength(1)
    expect(chain[0]!.v.length).toBe(80)
    expect(chain[0]!.v.endsWith('…')).toBe(true)
  })

  it('نص أقصر من حرفين لا يصلح مرساة (أيقونات وحروف يتيمة كثيرة التكرار)', () => {
    expect(buildAnchorChain({ tag: 'span', text: ' × ' })).toEqual([])
  })

  it('بلا path ولا أي صفة = سلسلة فارغة (خطوات navigate مثلًا لا مرساة لها)', () => {
    expect(buildAnchorChain({ tag: 'html' })).toEqual([])
  })
})

describe('isEphemeralId — معرّفات أطر العمل المتطايرة (علة الزر الخاطئ في التدريب)', () => {
  it('يكشف معرّفات React useForId وBase UI المتولّدة (تتغيّر كل تحميل فتطابق عنصرًا آخر)', () => {
    // من دليل حقيقي: React useId وBase UI — سبب «نُفّذت الخطوة على زر خاطئ»
    expect(isEphemeralId('_r_6_')).toBe(true)
    expect(isEphemeralId('_r_u0_')).toBe(true)
    expect(isEphemeralId('_r_rr_')).toBe(true)
    expect(isEphemeralId('base-ui-_r_pu_')).toBe(true)
    expect(isEphemeralId('base-ui-_r_sr_')).toBe(true)
    expect(isEphemeralId(':r0:')).toBe(true) // شكل React الخام
    expect(isEphemeralId('radix-:r3:')).toBe(true)
    expect(isEphemeralId('radix-42')).toBe(true)
    expect(isEphemeralId('headlessui-menu-button-7')).toBe(true)
    expect(isEphemeralId('mui-1423')).toBe(true)
  })

  it('يقبل المعرّفات الدلالية المستقرّة — لا يُسقط زرًا حقيقيًا', () => {
    expect(isEphemeralId('save-btn')).toBe(false)
    expect(isEphemeralId('frame-peek-portal')).toBe(false)
    expect(isEphemeralId('user_profile_menu')).toBe(false)
    expect(isEphemeralId('email')).toBe(false)
    expect(isEphemeralId('')).toBe(false)
  })
})

describe('buildAnchorChain — يُسقط المعرّف المتطاير فيسقط لبديلٍ مستقرّ', () => {
  it('معرّف React المتطاير لا يُلتقط id — يبقى النص والمسار مرساةً صادقة', () => {
    const chain = buildAnchorChain({
      tag: 'button',
      id: '_r_6_',
      text: 'فعّل cowork',
      path: 'body > div:nth-of-type(2) > button:nth-of-type(1)',
    })
    expect(chain.some((c) => c.k === 'id')).toBe(false) // لا معرّف متطاير
    expect(chain.map((c) => c.k)).toEqual(['text', 'path'])
  })
})

describe('anchorToSelector', () => {
  it('مرشحو الصفات يصيرون محدّدات سمات آمنة، والمسار يمر كما هو', () => {
    expect(anchorToSelector({ k: 'id', v: 'save' })).toBe('[id="save"]')
    expect(anchorToSelector({ k: 'testid', v: 'submit' })).toBe('[data-testid="submit"]')
    expect(anchorToSelector({ k: 'aria', v: 'حفظ' })).toBe('[aria-label="حفظ"]')
    expect(anchorToSelector({ k: 'name', v: 'action' })).toBe('[name="action"]')
    expect(anchorToSelector({ k: 'path', v: 'body > button:nth-of-type(2)' })).toBe('body > button:nth-of-type(2)')
  })

  it('القيمة الحاوية لعلامة اقتباس تُهرَّب فلا ينهار المحدِّد', () => {
    expect(anchorToSelector({ k: 'aria', v: 'قال "نعم"' })).toBe('[aria-label="قال \\"نعم\\""]')
  })
})

describe('anchorNormText', () => {
  it('يدمج المسافات ويقص الطويل — الدالة نفسها تُستخدم وقت الالتقاط ووقت الحل فتتطابقان', () => {
    expect(anchorNormText('  فاتورة   جديدة ')).toBe('فاتورة جديدة')
    expect(anchorNormText('x'.repeat(100)).length).toBe(80)
  })
})

describe('resolveAnchor — أول مرشح فريد يفوز (GM-01 يقف عليه)', () => {
  it('المرشح الأول الفريد يحسم فورًا', () => {
    const chain: AnchorChain = [
      { k: 'id', v: 'save' },
      { k: 'path', v: 'body > button:nth-of-type(1)' },
    ]
    const dom = fakeDom({ '[id="save"]': ['btn-save'] })
    const hit = resolveAnchor(chain, dom)
    expect(hit).toMatchObject({ el: 'btn-save', via: 0 })
  })

  it('مرشح ملتبس (تطابقان) يُتجاوز ويسقط الترتيب إلى التالي الفريد', () => {
    const chain: AnchorChain = [
      { k: 'testid', v: 'row' },
      { k: 'aria', v: 'حفظ' },
    ]
    const dom = fakeDom({ '[data-testid="row"]': ['a', 'b'], '[aria-label="حفظ"]': ['btn'] })
    expect(resolveAnchor(chain, dom)).toMatchObject({ el: 'btn', via: 1 })
  })

  it('مرشح النص: يفلتر عناصر النص التفاعلية بالنص المطوَّع ويشترط الفرادة', () => {
    const chain: AnchorChain = [{ k: 'text', v: 'حفظ التغييرات' }]
    const dom = fakeDom(
      { [TEXT_ANCHOR_SEL]: ['btn-a', 'btn-b', 'btn-c'] },
      { 'btn-a': 'إلغاء', 'btn-b': '  حفظ   التغييرات ', 'btn-c': 'حفظ' },
    )
    expect(resolveAnchor(chain, dom)).toMatchObject({ el: 'btn-b', via: 0 })
  })

  it('نص ملتبس (زران بنفس الكلمة) لا يُحل — صدق لا تخمين', () => {
    const chain: AnchorChain = [{ k: 'text', v: 'حفظ' }]
    const dom = fakeDom({ [TEXT_ANCHOR_SEL]: ['x', 'y'] }, { x: 'حفظ', y: 'حفظ' })
    expect(resolveAnchor(chain, dom)).toBeNull()
  })

  it('سلسلة بلا فريد من أي مرشح = لا حل (الواجهة تغيّرت — يُعلن بصدق لا توهيم)', () => {
    const chain: AnchorChain = [{ k: 'id', v: 'gone' }, { k: 'path', v: 'body > x:nth-of-type(9)' }]
    const dom = fakeDom({})
    expect(resolveAnchor(chain, dom)).toBeNull()
  })

  it('يتجاوز مرشّح id المتطاير ولو طابق عنصرًا واحدًا — يحمي الأدلة القديمة من زرٍ خاطئ', () => {
    // علة حقيقية: `_r_6_` قد يُسنَد لعنصرٍ مختلف على الصفحة الطازجة فيطابق «فريدًا» خطأً.
    const chain: AnchorChain = [
      { k: 'id', v: '_r_6_' },
      { k: 'text', v: 'فعّل cowork' },
    ]
    const dom = fakeDom(
      { '[id="_r_6_"]': ['wrong-el'], [TEXT_ANCHOR_SEL]: ['right-el'] },
      { 'right-el': 'فعّل cowork' },
    )
    expect(resolveAnchor(chain, dom)).toMatchObject({ el: 'right-el', via: 1 }) // النص لا المعرّف المتطاير
  })

  it('نص عنصر menuitemradio يُحل (علة الخطوة الأخيرة: اختيار النموذج في قائمة حديثة)', () => {
    // TEXT_ANCHOR_SEL يشمل menuitemradio الآن — «Opus 4.8» في قائمة النماذج يُطابَق بنصه
    expect(TEXT_ANCHOR_SEL).toContain('[role="menuitemradio"]')
    const chain: AnchorChain = [
      { k: 'id', v: '_r_u0_' }, // معرّف متطاير يُتجاوز
      { k: 'text', v: 'Opus 4.8' },
    ]
    const dom = fakeDom({ [TEXT_ANCHOR_SEL]: ['radio-a', 'radio-b'] }, { 'radio-a': 'Opus 4.7', 'radio-b': 'Opus 4.8' })
    expect(resolveAnchor(chain, dom)).toMatchObject({ el: 'radio-b', via: 1 })
  })

  it('يتجاوز مرشّح مسار يحوي معرّفًا متطايرًا — سلف بمعرّف React لا يوثَّق به', () => {
    const chain: AnchorChain = [
      { k: 'path', v: '[id="_r_rr_"] > div:nth-of-type(2)' },
      { k: 'aria', v: 'إلغاء' },
    ]
    const dom = fakeDom({ '[id="_r_rr_"] > div:nth-of-type(2)': ['wrong'], '[aria-label="إلغاء"]': ['right'] })
    expect(resolveAnchor(chain, dom)).toMatchObject({ el: 'right', via: 1 })
  })
})

describe('resolveAnchor — حلّ متين لصفوف الجداول والقوائم المتولّدة (بلاغ أودو 2026-10-31)', () => {
  it('معرّف موضعي فريد يناقض نص الخطوة يُرفض ويُحل بالنص (autocomplete_0_0 = أول خيار أيًّا كان)', () => {
    // أودو يرقّم خيارات الإكمال التلقائي بموضعها — على صفحة التدريب قد يكون «الأول» منتجًا آخر
    const chain: AnchorChain = [
      { k: 'id', v: 'autocomplete_0_0' },
      { k: 'text', v: 'Mechanical Keyboard' },
      { k: 'path', v: '[id="autocomplete_0_0"]' },
    ]
    const dom = fakeDom(
      { '[id="autocomplete_0_0"]': ['opt-mouse'], [TEXT_ANCHOR_SEL]: ['opt-mouse', 'opt-kb'] },
      { 'opt-mouse': 'Wireless Mouse', 'opt-kb': 'Mechanical Keyboard' },
    )
    expect(resolveAnchor(chain, dom)).toMatchObject({ el: 'opt-kb', via: 1 })
  })

  it('المعرّف الذي يوافق النص يبقى أقوى مرساة — لا تغيير لما يعمل', () => {
    const chain: AnchorChain = [{ k: 'id', v: 'save' }, { k: 'text', v: 'حفظ' }]
    const dom = fakeDom({ '[id="save"]': ['b'], [TEXT_ANCHOR_SEL]: ['b'] }, { b: 'حفظ' })
    expect(resolveAnchor(chain, dom)).toMatchObject({ el: 'b', via: 0 })
  })

  it('عنصر بلا نص (حقل) لا يُعدّ مناقضًا — الحقول لا نص لها', () => {
    const chain: AnchorChain = [{ k: 'name', v: 'qty' }, { k: 'text', v: 'الكمية' }]
    const dom = fakeDom({ '[name="qty"]': ['inp'] }, { inp: '' })
    expect(resolveAnchor(chain, dom)).toMatchObject({ el: 'inp', via: 0 })
  })

  it('مطابقات ملتبسة يضيّقها المنفذ (المرئي وحده) إلى واحد = حل', () => {
    const chain: AnchorChain = [{ k: 'path', v: '[name="product_id"] textarea' }]
    const dom: AnchorDom<string> = {
      ...fakeDom({ '[name="product_id"] textarea': ['hidden-tpl', 'row-edit'] }),
      narrow: (els) => els.filter((e) => e !== 'hidden-tpl'),
    }
    expect(resolveAnchor(chain, dom)).toMatchObject({ el: 'row-edit', via: 0 })
  })

  it('إجماع: مرشّحان ملتبسان يلتقيان في عنصر واحد = حل (اسم العمود ∩ المسار)', () => {
    const chain: AnchorChain = [
      { k: 'name', v: 'partner_id' },
      { k: 'path', v: 'tbody > tr:nth-of-type(1) > td:nth-of-type(4)' },
    ]
    const dom = fakeDom({
      '[name="partner_id"]': ['td1', 'td2', 'td3'],
      'tbody > tr:nth-of-type(1) > td:nth-of-type(4)': ['td1', 'other-table-td'],
    })
    expect(resolveAnchor(chain, dom)).toMatchObject({ el: 'td1', via: 0 })
  })

  it('إجماع بنص الخطوة: خلية الجدول ليست زرًا لكن نصها يحسم بين خلايا العمود', () => {
    const chain: AnchorChain = [
      { k: 'name', v: 'partner_id' },
      { k: 'text', v: 'Mohamed Tebidy' },
      { k: 'path', v: 'tbody > tr:nth-of-type(1) > td:nth-of-type(4)' },
    ]
    // الصف الأول صار عميلًا آخر — المسار يشير لخلية خاطئة، والنص يحسم
    const dom = fakeDom(
      { '[name="partner_id"]': ['td1', 'td2', 'td3'], 'tbody > tr:nth-of-type(1) > td:nth-of-type(4)': ['td1'] },
      { td1: 'Azure Interior', td2: 'Mohamed Tebidy', td3: 'Deco Addict' },
    )
    expect(resolveAnchor(chain, dom)?.el).toBe('td2')
  })

  it('إجماع متعادل بلا نص يحسم = لا حل — صدق لا تخمين', () => {
    const chain: AnchorChain = [
      { k: 'name', v: 'x' },
      { k: 'path', v: 'td' },
    ]
    const dom = fakeDom({ '[name="x"]': ['a', 'b'], td: ['a', 'b'] })
    expect(resolveAnchor(chain, dom)).toBeNull()
  })

  it('مرشّح واحد ملتبس لا يصنع إجماعًا وحده', () => {
    const dom = fakeDom({ '[name="x"]': ['a', 'b'] })
    expect(resolveAnchor([{ k: 'name', v: 'x' }], dom)).toBeNull()
  })
})

describe('AnchorDom.find — منفذ بلا CSS (تمهيد محوّل UIA لتطبيق الديسكتوب)', () => {
  it('resolveAnchor يمرّر المرشّح نفسه للمحوّل ولا يطلب محدِّد CSS أبدًا', () => {
    const seen: unknown[] = []
    const dom: AnchorDom<string> = {
      find: (c) => {
        seen.push(c)
        return c.k === 'automationId' && c.v === 'btnSave' ? ['uia-save'] : []
      },
    }
    expect(resolveAnchor([{ k: 'automationId', v: 'btnSave' }], dom)).toMatchObject({ el: 'uia-save', via: 0 })
    expect(seen).toEqual([{ k: 'automationId', v: 'btnSave' }])
  })

  it('مرشّح controlType الملتبس يُتجاوز إلى الفريد التالي', () => {
    const dom: AnchorDom<string> = {
      find: (c) => (c.k === 'controlType' ? ['b1', 'b2'] : c.k === 'text' && c.v === 'موافق' ? ['ok'] : []),
    }
    const chain: AnchorChain = [
      { k: 'controlType', v: 'Button' },
      { k: 'text', v: 'موافق' },
    ]
    expect(resolveAnchor(chain, dom)).toMatchObject({ el: 'ok', via: 1 })
  })

  it('المرشّحات المتطايرة تُتجاوز قبل سؤال المحوّل أصلًا', () => {
    const seen: string[] = []
    const dom: AnchorDom<string> = { find: (c) => (seen.push(c.k), ['hit']) }
    resolveAnchor([{ k: 'id', v: '_r_6_' }, { k: 'path', v: '[id="_r_rr_"] > a' }, { k: 'aria', v: 'حفظ' }], dom)
    expect(seen).toEqual(['aria'])
  })

  it('cssAnchorFinder لا يطابق مرشّحات UIA على الويب — لا تخمين', () => {
    const f = cssAnchorFinder(() => ['any'], (el) => el)
    expect(f.find({ k: 'automationId', v: 'x' })).toEqual([])
    expect(f.find({ k: 'controlType', v: 'Button' })).toEqual([])
    expect(anchorToSelector({ k: 'automationId', v: 'x' })).toBeNull()
    expect(anchorToSelector({ k: 'controlType', v: 'Button' })).toBeNull()
  })

  it('buildAnchorChain: automationId بعد id وcontrolType قبل المسار — والويب بلا الحقلين لا يتغيّر', () => {
    const chain = buildAnchorChain({
      tag: 'Button',
      automationId: 'btnSave',
      controlType: 'Button',
      text: 'حفظ',
      path: 'Window/Pane[2]/Button[1]',
    })
    expect(chain.map((c) => c.k)).toEqual(['automationId', 'text', 'controlType', 'path'])
    const web = buildAnchorChain({ tag: 'button', id: 'save', text: 'حفظ' })
    expect(web.map((c) => c.k)).toEqual(['id', 'text'])
  })
})

/** درجة الثقة (ث١): محوّل زائف يضيف تسمية الحقل وسياقه */
function sightDom(bySel: Record<string, string[]>, texts: Record<string, string> = {}, ctxs: Record<string, string> = {}, labels: Record<string, string> = {}): AnchorDom<string> {
  return { ...fakeDom(bySel, texts), ctxOf: (el) => ctxs[el] ?? '', labelOf: (el) => labels[el] ?? '' }
}

describe('resolveAnchor — درجة الثقة (ث١ دربني الواثق)', () => {
  it('معرّف ثابت فريد + نص موافق = عالية', () => {
    expect(resolveAnchor([{ k: 'id', v: 'save' }, { k: 'text', v: 'حفظ' }], sightDom({ '[id="save"]': ['A'], [TEXT_ANCHOR_SEL]: ['A'] }, { A: 'حفظ' }))?.confidence).toBe('high')
  })

  it('مسار وحده = متوسطة — الأدلة القديمة لا تُرسم بثقة كاملة', () => {
    expect(resolveAnchor([{ k: 'path', v: 'div > button' }], sightDom({ 'div > button': ['A'] }))?.confidence).toBe('medium')
  })

  it('معرّف وحده بلا إشارة ثانية = متوسطة', () => {
    expect(resolveAnchor([{ k: 'id', v: 'save' }], sightDom({ '[id="save"]': ['A'] }, { A: '' }))?.confidence).toBe('medium')
  })

  it('مسار + تسمية موافقة = عالية (الحقول بلا نص)', () => {
    const chain: AnchorChain = [{ k: 'label', v: 'الزبون' }, { k: 'path', v: 'form > input' }, { k: 'name', v: 'partner_id' }]
    expect(resolveAnchor(chain, sightDom({ 'form > input': ['A'], '[name="partner_id"]': ['A'] }, { A: '' }, {}, { A: 'الزبون' }))?.confidence).toBe('high')
  })

  it('سياق يناقض = متوسطة لا منخفضة — اسم السجل أو لغة الواجهة تتغيّر والزر صحيح (مراجعة C1)', () => {
    const chain: AnchorChain = [{ k: 'id', v: 'save' }, { k: 'text', v: 'حفظ' }, { k: 'ctx', v: 'فاتورة' }]
    expect(resolveAnchor(chain, sightDom({ '[id="save"]': ['A'], [TEXT_ANCHOR_SEL]: ['A'] }, { A: 'حفظ' }, { A: 'أمر شراء' }))?.confidence).toBe('medium')
  })

  it('صف بالموضع: name يطابق كل الصفوف + مسار فريد + تسمية العمود توافق = متوسطة لا عالية (مراجعة I7، علة GM-08)', () => {
    const chain: AnchorChain = [{ k: 'name', v: 'qty' }, { k: 'label', v: 'الكمية' }, { k: 'path', v: 'tr:nth-of-type(3) input' }]
    const dom = sightDom({ '[name="qty"]': ['R1', 'R2', 'R3'], 'tr:nth-of-type(3) input': ['R3'] }, { R1: '', R2: '', R3: '' }, {}, { R1: 'الكمية', R2: 'الكمية', R3: 'الكمية' })
    expect(resolveAnchor(chain, dom)).toMatchObject({ el: 'R3', confidence: 'medium' })
  })

  it('حقل أودو قديم: name فريد + مسار = عالية (مراجعة I8)', () => {
    const chain: AnchorChain = [{ k: 'name', v: 'partner_id' }, { k: 'path', v: 'form > div > input' }]
    expect(resolveAnchor(chain, sightDom({ '[name="partner_id"]': ['A'], 'form > div > input': ['A'] }, { A: '' }))?.confidence).toBe('high')
  })

  it('الحسم بالإجماع وحده = متوسطة على الأكثر', () => {
    const chain: AnchorChain = [{ k: 'name', v: 'qty' }, { k: 'path', v: 'td input' }]
    const dom = sightDom({ '[name="qty"]': ['R1', 'R2'], 'td input': ['R2', 'R3'] }, { R1: '', R2: '', R3: '' })
    expect(resolveAnchor(chain, dom)).toMatchObject({ el: 'R2', confidence: 'medium' })
  })

  it('label وctx متحقِّقان لا باحثان: سلسلة منهما وحدهما = لا حل', () => {
    expect(resolveAnchor([{ k: 'label', v: 'الزبون' }, { k: 'ctx', v: 'فاتورة' }], sightDom({}))).toBeNull()
    expect(anchorToSelector({ k: 'label', v: 'x' })).toBeNull()
    expect(anchorToSelector({ k: 'ctx', v: 'x' })).toBeNull()
  })
})

describe('buildAnchorChain — التسمية والسياق (ث١)', () => {
  it('يلحق label وctx بعد النص وقبل المسار، مطبّعين', () => {
    const chain = buildAnchorChain({ tag: 'input', name: 'partner_id', label: ' الزبون ', ctx: 'فاتورة   جديدة', path: 'form > input' })
    expect(chain.map((c) => c.k)).toEqual(['name', 'label', 'ctx', 'path'])
    expect(chain[2]).toEqual({ k: 'ctx', v: 'فاتورة جديدة' })
  })
})
