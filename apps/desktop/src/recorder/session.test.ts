import { describe, expect, it } from 'vitest'
import type { DesktopFacts } from '@dalili/core'
import { createRecorderSession, type Bridge, type FramePickResult } from './session'

/** ٣ج-٢: جلسة التسجيل — الحدود محقونة (Bridge) والساعة من TickEvt حصرًا.
 *  الحمولات هنا مطابقة حرفيًّا لعقد السلك: events.rs مسطَّح العنصر (flatten)
 *  وframe_pick بعقد §٣.٣. لا Tauri ولا شبكة ولا مؤقّتات — كل شيء مبثوث يدويًّا. */

/** حقائق تبويب «إدراج» في Excel — مطابقة للسلك: `element` مفتاحٌ قيمته
 *  صفاتُ العقدة المسطَّحة (flatten) مع isPassword/value (حارس events.rs) */
function insertTabFacts(seq: number, overrides?: Partial<DesktopFactsWire>): DesktopFactsWire {
  return {
    seq,
    readMs: 21.4,
    element: {
      automationId: 'TabInsert',
      name: 'إدراج',
      controlType: 'TabItem',
      className: 'NetUI HWND',
      frameworkId: 'Win32',
      rect: { x: 600, y: 90, w: 80, h: 30 },
      isPassword: false,
      value: undefined,
    },
    ancestors: [],
    window: {
      hwnd: '0x10ac',
      processName: 'C:\\Program Files\\Microsoft Office\\root\\Office16\\EXCEL.EXE',
      windowTitle: 'Book1 - Excel',
      appId: 'app:EXCEL.EXE',
      affinity: 0,
      ieMode: false,
    },
    ...overrides,
  }
}

type DesktopFactsWire = Record<string, unknown> & { seq: number }

/** جسر مزيّف: يلتقط المستمعين ونداءات frame_pick/factsRefresh/frameBlur ويردّ نتائج مخزَّنة */
function makeBridge() {
  const handlers = new Map<string, Array<(p: unknown) => void>>()
  const picks: Array<{ seq: number; which: string }> = []
  const refreshCalls: number[] = []
  const blurCalls: Array<{ localId: string; rects: Array<{ x: number; y: number; w: number; h: number }> }> = []
  const results = new Map<number, FramePickResult>()
  const refreshResults = new Map<number, DesktopFacts | { seq: number; error: string }>()
  const pickedDefault = (seq: number): FramePickResult => ({
    localId: `f-${seq}`,
    path: `%TEMP%\\itqan-frames\\f-${seq}.jpg`,
    qpcMs: 1000,
    deltaMs: -18.5,
    monitor: { x: 0, y: 0, w: 1920, h: 1080, dpi: 96 },
  })
  const bridge: Bridge = {
    listen(evt, cb) {
      const list = handlers.get(evt) ?? []
      list.push(cb)
      handlers.set(evt, list)
      return () => {}
    },
    async invoke(_cmd, args) {
      picks.push({ seq: args.seq, which: args.which })
      return results.get(args.seq) ?? pickedDefault(args.seq)
    },
    async factsRefresh(seq) {
      refreshCalls.push(seq)
      return refreshResults.get(seq) ?? null
    },
    async frameBlur(localId, rects) {
      blurCalls.push({ localId, rects })
    },
  }
  const emit = (evt: string, p: unknown) => {
    for (const cb of handlers.get(evt) ?? []) cb(p)
  }
  return { bridge, emit, picks, results, refreshCalls, refreshResults, blurCalls }
}

const down = (seq: number, qpcMs: number) =>
  emit0('sensor://input', { seq, qpcMs, kind: 'down', button: 'left', x: 640, y: 105, keyClass: null })
const key = (seq: number, qpcMs: number, keyClass: string) =>
  emit0('sensor://input', { seq, qpcMs, kind: 'key', button: null, x: 0, y: 0, keyClass })
const tick = (qpcMs: number) => emit0('sensor://tick', { qpcMs })
let emit0: (evt: string, p: unknown) => void = () => {}

/** يقود جلسة حتى تهدأ: تقدّم ساعة الـtick يُغلق الإيماءة ثم ينتظر البناء */
async function settle(session: ReturnType<typeof createRecorderSession>) {
  await session.whenIdle()
}

describe('٣ج-٢ — جلسة التسجيل بساعة TickEvt (لا مؤقّتات)', () => {
  it('(أ) نقرة تبويب ⇐ خطوة click بمرساة automationId وframe_pick بـbefore', async () => {    const { bridge, emit } = makeBridge()
    emit0 = emit
    const session = createRecorderSession(bridge)
    down(7, 1000)
    emit('sensor://facts', insertTabFacts(7))
    tick(1100) // ‏100ms صمت ≥ collectMs=60 ⇐ تُغلق الإيماءة
    await settle(session)
    expect(session.stepCount()).toBe(1)

    const guide = await session.stop()
    expect(guide.steps).toHaveLength(1)
    const step = guide.steps[0]!
    expect(step.kind).toBe('click')
    expect(step.target.anchor?.[0]).toEqual({ k: 'automationId', v: 'TabInsert' })
    expect(step.title).toBe('انقر على «إدراج»')
    expect(step.source).toEqual({
      kind: 'desktop',
      processName: 'C:\\Program Files\\Microsoft Office\\root\\Office16\\EXCEL.EXE',
      windowTitle: 'Book1 - Excel',
      appId: 'app:EXCEL.EXE',
      uiaFramework: 'Win32',
    })
    expect(session.stepCount()).toBe(1)
  })

  it('(ب) حقل سرّ مع كتابة ⇐ input حسّاس بلا قيمة ولقطة after محروقة وبلا نداء refresh', async () => {
    const { bridge, emit, picks, refreshCalls, blurCalls } = makeBridge()
    emit0 = emit
    const session = createRecorderSession(bridge)
    down(8, 2000)
    emit(
      'sensor://facts',
      insertTabFacts(8, {
        element: {
          automationId: 'cellB2',
          name: 'B2',
          controlType: 'Edit',
          className: 'NetUI HWND',
          frameworkId: 'Win32',
          rect: { x: 600, y: 90, w: 80, h: 30 },
          isPassword: true,
          // القيمة غائبة عن السلك أصلًا (بوّابة ٣ب)
        },
      }),
    )
    key(9, 2050, 'char')
    key(10, 2100, 'char')
    tick(2300)
    await settle(session)

    expect(picks[0]?.which).toBe('after')
    expect(refreshCalls).toEqual([]) // بوّابة السرّ: حسّاس ⇐ لا قراءة قيمة ثانية أصلًا
    // ٣ج-٤: الحسّاس يحترق على الجهاز — مستطيل ببكسل الصورة وblurRects يسجّله
    expect(blurCalls).toEqual([{ localId: 'f-8', rects: [{ x: 600, y: 90, w: 80, h: 30 }] }])
    const guide = await session.stop()
    const step = guide.steps[0]!
    expect(step.kind).toBe('input')
    expect(step.sensitive).toBe(true)
    expect(step.value).toBeUndefined()
    expect(step.title).toBe('في حقل «B2» أدخل قيمة سرية')
    expect(step.screenshot).toMatchObject({
      blurRects: [{ x: 600, y: 90, w: 80, h: 30 }],
      autoBlurred: true,
    })
  })

  it('(ط) حقل يحمل اسمًا حسّاسًا بلا isPassword ⇐ يحرق ويصمت قيمته كذلك (كشف mask)', async () => {
    const { bridge, emit, blurCalls } = makeBridge()
    emit0 = emit
    const session = createRecorderSession(bridge)
    down(70, 6000)
    emit(
      'sensor://facts',
      insertTabFacts(70, {
        element: {
          automationId: 'pwdCustom',
          name: 'كلمة المرور',
          controlType: 'Edit',
          className: 'NetUI HWND',
          frameworkId: 'Win32',
          rect: { x: 300, y: 200, w: 200, h: 28 },
          isPassword: false,
          value: 'typed-secret',
        },
      }),
    )
    key(71, 6050, 'char')
    tick(6200)
    await settle(session)

    const guide = await session.stop()
    const step = guide.steps[0]!
    // كشف mask في النواة (اسم حسّاس) ⇐ المعاملة الحسّاسة كاملة: حرق + صمت قيمة
    expect(blurCalls).toHaveLength(1)
    expect(blurCalls[0]!.localId).toBe('f-70')
    expect(step.sensitive).toBe(true)
    expect(step.value).toBeUndefined()
    expect(step.screenshot).toMatchObject({ autoBlurred: true })
  })

  it('(ز) كتابة في حقل عادي ⇐ القيمة النهائيّة من facts_refresh لا قيمة ما قبل الكتابة', async () => {
    const { bridge, emit, picks, refreshCalls, refreshResults, blurCalls } = makeBridge()
    emit0 = emit
    // ردّ facts_refresh (شكل Rust: نافذة فارغة وبلا أسلاف، القيمة بعد الكتابة)
    refreshResults.set(60, {
      seq: 60,
      readMs: 0,
      element: {
        automationId: 'NameBox',
        name: 'مربع الاسم',
        controlType: 'Edit',
        className: 'NetUI HWND',
        frameworkId: 'Win32',
        rect: { x: 120, y: 90, w: 150, h: 30 },
        isPassword: false,
        value: 'B2',
      },
      ancestors: [],
      window: { hwnd: '', processName: '', windowTitle: '', appId: '', affinity: 0, ieMode: false },
    })
    const session = createRecorderSession(bridge)
    down(60, 5000)
    // الحقائق عند النقرة: الحقل فارغ (القيمة قبل الكتابة)
    emit(
      'sensor://facts',
      insertTabFacts(60, {
        element: {
          automationId: 'NameBox',
          name: 'مربع الاسم',
          controlType: 'Edit',
          className: 'NetUI HWND',
          frameworkId: 'Win32',
          rect: { x: 120, y: 90, w: 150, h: 30 },
          isPassword: false,
          value: '',
        },
      }),
    )
    key(61, 5050, 'char')
    key(62, 5100, 'char')
    key(63, 5150, 'char')
    tick(5300) // إغلاق الإيماءة
    await settle(session)

    expect(refreshCalls).toEqual([60]) // إيماءة إدخال غير حسّاسة ⇐ refresh واحد بـseq النقرة
    expect(blurCalls).toEqual([]) // غير الحسّاس: لا حرق إطلاقًا
    expect(picks[0]?.which).toBe('after') // سياسة Edit: اللقطة بعد
    const guide = await session.stop()
    const step = guide.steps[0]!
    expect(step.kind).toBe('input')
    expect(step.sensitive).toBe(false)
    expect(step.value).toBe('B2') // النهائيّة من refresh لا ''
    expect(step.title).toBe('في حقل «مربع الاسم» أدخل «B2»')
    expect(step.screenshot).toMatchObject({ blurRects: [] })
  })

  it('(ج) نافذة محميّة ⇐ MissingScreenshot بسبب عربيّ بلا انهيار', async () => {
    const { bridge, emit, results } = makeBridge()
    emit0 = emit
    results.set(11, { missing: 'protected' })
    const session = createRecorderSession(bridge)
    down(11, 3000)
    emit('sensor://facts', insertTabFacts(11))
    tick(3200)
    await settle(session)

    const guide = await session.stop()
    const shot = guide.steps[0]!.screenshot
    expect(shot).toEqual({ missing: true, reason: 'نافذة محميّة' })
  })

  it('(د) تبديل نافذة ⇐ خطوة navigate مُدرَجة قبل نقرة النافذة الجديدة', async () => {
    const { bridge, emit } = makeBridge()
    emit0 = emit
    const session = createRecorderSession(bridge)
    // نقرة في Excel
    down(20, 4000)
    emit('sensor://facts', insertTabFacts(20))
    tick(4200)
    await settle(session)
    // نقرة في نافذة أخرى (ورد)
    down(21, 5000)
    emit(
      'sensor://facts',
      insertTabFacts(21, {
        element: {
          automationId: 'TabInsertWord',
          name: 'إدراج',
          controlType: 'TabItem',
          className: 'NetUI HWND',
          frameworkId: 'Win32',
          rect: { x: 600, y: 90, w: 80, h: 30 },
          isPassword: false,
          value: undefined,
        },
        window: {
          hwnd: '0x20bd',
          processName: 'C:\\Program Files\\Microsoft Office\\root\\Office16\\WINWORD.EXE',
          windowTitle: 'Doc1 - Word',
          appId: 'app:WINWORD.EXE',
          affinity: 0,
          ieMode: false,
        },
      }),
    )
    tick(5200)
    await settle(session)

    const guide = await session.stop()
    expect(guide.steps.map((s) => s.kind)).toEqual(['click', 'navigate', 'click'])
    expect(guide.steps[1]!.source).toMatchObject({ kind: 'desktop', windowTitle: 'Doc1 - Word' })
    expect(guide.steps[2]!.target.anchor?.[0]).toEqual({ k: 'automationId', v: 'TabInsertWord' })
  })

  it('(هـ) الإيماءة لا تُغلَق إلا بتقدّم TickEvt — لا setTimeout يُغلقها خلسة', async () => {
    const { bridge, emit } = makeBridge()
    emit0 = emit
    const session = createRecorderSession(bridge)
    tick(1000) // مزامنة الساعة أوّلًا
    down(30, 1000)
    emit('sensor://facts', insertTabFacts(30))
    tick(1030) // ‏30ms صمت فقط < collectMs=60
    await settle(session)
    // الصمت دون الستّين لم يُغلق الإيماءة
    expect(session.stepCount()).toBe(0)

    tick(1070) // تجاوزت الساعة المهلة (1000+60)
    await settle(session)
    // تقدّم ساعة الـtick وحده أغلقها
    expect(session.stepCount()).toBe(1)

    const guide = await session.stop()
    expect(guide.steps).toHaveLength(1)
  })

  it('(و) سباق الحقائق المتأخّرة: تصل بعد إغلاق الإيماءة ⇐ تُبنى لا تُسقَط، والغائبة حتى مهلة ٣ب ⇐ تُسقَط', async () => {
    // ٣ب-٦: حقائق UIA وسيطها 62.6مث وp95 189مث — أي تصل غالبًا بعد نافذة الـ60مث.
    // إغلاق الإيماءة لا يجوز أن يُسقط الخطوة فورًا: تُنتظَر الحقائق حتى 250مث (مهلة ٣ب)
    const { bridge, emit } = makeBridge()
    emit0 = emit
    const session = createRecorderSession(bridge)
    tick(1000)
    down(50, 1000) // نافذتها تُغلق عند 1060
    tick(1060) // الإغلاق والحقائق لم تصل بعد ⇐ الجلسة تدخل انتظارًا عادلًا لا إسقاطًا فوريًّا
    // قراءة متزامنة أثناء الطيران: لم تُبنَ بعد (لا settle هنا — البناء ينتظر الحقائق)
    expect(session.stepCount()).toBe(0)

    emit('sensor://facts', insertTabFacts(50)) // تصل متأخّرة (قبل مهلة 1310)
    await settle(session)
    // المتأخّرة تُبنى — هذا ما يجعل قرار «قبول readMs بالسياق» فعّالًا
    expect(session.stepCount()).toBe(1)

    // النقرة اليتيمة: حقائق لا تصل أبدًا ⇐ إسقاط بعد مهلة 250مث على ساعة الـtick
    down(51, 2000)
    tick(2060) // يغلق نافذتها؛ البناء يبدأ مهمّةً دقيقة فتجدول مهلتها (2060+250)
    // استسلام لحلقة الأحداث (مؤقّت الاختبار وحده — لا علاقة له بساعة الجلسة):
    // سلسلة البناء تضيف دورات مهام دقيقة، فلنبضتك التالية يجب أن تجد البناء قد جدول مهلته
    await new Promise((r) => setTimeout(r, 0))
    tick(2400) // الساعة تجاوز 2250 ⇐ انقضى انتظار ٣ب ⇐ إسقاط صادق
    await settle(session)
    // بقي عدد الخطوات واحدًا: المهيمة أُسقِطت لا أُضيفت
    expect(session.stepCount()).toBe(1)

    const guide = await session.stop()
    expect(guide.steps).toHaveLength(1)
    expect(guide.steps[0]!.target.anchor?.[0]).toEqual({ k: 'automationId', v: 'TabInsert' })
  })

  it('سقوط آمن: نقرة بلا إحداثيّات (لا يُفترض) ⇐ علامة مستطيل العنصر كما كانت', async () => {
    const { bridge, emit, results } = makeBridge()
    emit0 = emit
    results.set(40, {
      localId: 'f-40',
      path: 'x.jpg',
      qpcMs: 1000,
      deltaMs: -10,
      monitor: { x: 1920, y: 0, w: 1920, h: 1080, dpi: 96 },
    })
    const session = createRecorderSession(bridge)
    // بلا x/y أصلًا — المسار الذي يحرسه السقوط (غيابهما لا يُفترض في down)
    emit('sensor://input', { seq: 40, qpcMs: 1000, kind: 'down', button: 'left', keyClass: null })
    // العنصر فوق الشاشة الثانية (أصلها x=1920) — في الصورة يصير 2500−1920=580
    emit(
      'sensor://facts',
      insertTabFacts(40, {
        element: {
          automationId: 'TabInsert',
          name: 'إدراج',
          controlType: 'TabItem',
          className: 'NetUI HWND',
          frameworkId: 'Win32',
          rect: { x: 2500, y: 90, w: 80, h: 30 },
          isPassword: false,
          value: undefined,
        },
      }),
    )
    tick(1200)
    await settle(session)

    const guide = await session.stop()
    const shot = guide.steps[0]!.screenshot
    expect(shot).toMatchObject({
      fileId: 'f-40',
      mark: { rect: { x: 580, y: 90, w: 80, h: 30 }, color: '#ea580c' },
    })
  })

  it('علامة نقطة الضغط: حلقة ellipse مركزها النقرة لا مستطيل العنصر (قرار المالك ٣و)', async () => {
    const { bridge, emit, results } = makeBridge()
    emit0 = emit
    results.set(41, {
      localId: 'f-41',
      path: 'y.jpg',
      qpcMs: 1000,
      deltaMs: -10,
      monitor: { x: 0, y: 0, w: 1920, h: 1080, dpi: 96 },
    })
    const session = createRecorderSession(bridge)
    // نقرة عند (300,200) بعيدةٍ عن مستطيل العنصر (600..680 × 90..120) —
    // المركز يجب أن يكون نقرةَ المالك لا صندوق العنصر (خيار أ)
    emit('sensor://input', {
      seq: 41,
      qpcMs: 1000,
      kind: 'down',
      button: 'left',
      x: 300,
      y: 200,
      keyClass: null,
    })
    emit(
      'sensor://facts',
      insertTabFacts(41, {
        element: {
          automationId: 'TabInsert',
          name: 'إدراج',
          controlType: 'TabItem',
          className: 'NetUI HWND',
          frameworkId: 'Win32',
          rect: { x: 600, y: 90, w: 80, h: 30 },
          isPassword: false,
          value: undefined,
        },
      }),
    )
    tick(1200)
    await settle(session)

    const guide = await session.stop()
    const shot = guide.steps[0]!.screenshot
    // نصف قطر 24px منطقيّ عند 96dpi ⇒ ضلع 48، والمركز نقطة الضغط حصرًا
    expect(shot).toMatchObject({
      fileId: 'f-41',
      mark: { rect: { x: 276, y: 176, w: 48, h: 48 }, color: '#ea580c', shape: 'ellipse' },
    })
  })

  it('خطوات حيّة للوحة الودجة (توصية UX): stepSummaries تعيد العناوين العربية قبل الإنهاء', async () => {
    const { bridge, emit } = makeBridge()
    emit0 = emit
    const session = createRecorderSession(bridge)
    expect(session.stepSummaries()).toEqual([])
    down(21, 3000)
    emit('sensor://facts', insertTabFacts(21))
    tick(3100)
    await settle(session)
    // القائمة الحيّة ترسم ما بناه المخزن فورًا — بلا انتظار stop/assembleGuide
    expect(session.stepSummaries()).toEqual([{ title: 'انقر على «إدراج»', kind: 'click' }])
  })
})

// latestShot — لقطة الخطوة الأحدث للودجة (المرحلة ١): مصغّرة البطاقة الأخيرة
// تقرأ الميتا من المخزن الحيّ قبل الإنهاء، والبكسلات يجلِبها عرض الودجة بـframe_thumb
describe('latestShot — لقطة الخطوة الأحدث (المرحلة ١)', () => {
  it('تعيد null قبل أيّ خطوة', () => {
    const { bridge, emit } = makeBridge()
    emit0 = emit
    const session = createRecorderSession(bridge)
    expect(session.latestShot()).toBeNull()
  })

  it('بعد نقرة ناجحة تعيد meta اللقطة بمعرّف الملفّ المحلّيّ والعلامة', async () => {
    const { bridge, emit } = makeBridge()
    emit0 = emit
    const session = createRecorderSession(bridge)
    down(31, 5000)
    emit('sensor://facts', insertTabFacts(31))
    tick(5100)
    await settle(session)
    const shot = session.latestShot()
    expect(shot).not.toBeNull()
    expect(shot).toMatchObject({ fileId: expect.stringMatching(/^f-\d+$/) })
    expect(shot).toMatchObject({ mark: { rect: expect.anything(), color: expect.anything() } })
  })

  it('خطوة لقطتها غائبة ⇐ الغياب الصادق نفسه ({missing,reason}) لا null', async () => {
    const { bridge, emit, results } = makeBridge()
    emit0 = emit
    const session = createRecorderSession(bridge)
    results.set(32, { missing: 'protected' })
    down(32, 6000)
    emit('sensor://facts', insertTabFacts(32))
    tick(6100)
    await settle(session)
    expect(session.latestShot()).toEqual({ missing: true, reason: 'نافذة محميّة' })
  })
})

describe('مرحلة الربط ١ — onStepBuilt: لحظة بناء الخطوة للودجة الحيّة', () => {
  it('بناء خطوة ⇐ يُستدعى بموجزها ولقطتها (meta) فور دفعها للمخزن', async () => {
    const { bridge, emit } = makeBridge()
    emit0 = emit
    const built: Array<{ title: string; kind: string; shot: unknown }> = []
    const session = createRecorderSession(bridge, {
      onStepBuilt: (s) => built.push(s),
    })
    down(7, 1000)
    emit('sensor://facts', insertTabFacts(7))
    tick(1100)
    await settle(session)

    expect(built).toHaveLength(1)
    expect(built[0]!.title).toBe('انقر على «إدراج»')
    expect(built[0]!.kind).toBe('click')
    expect(built[0]!.shot).toMatchObject({ fileId: 'f-7' })
  })

  it('خطوتان متتاليتان ⇐ نداءان بالترتيب، وغياب الخيار ⇐ سلوكٌ قائم بلا نداءات', async () => {
    const { bridge, emit } = makeBridge()
    emit0 = emit
    const built: Array<{ title: string }> = []
    const session = createRecorderSession(bridge, {
      onStepBuilt: (s) => built.push({ title: s.title }),
    })
    down(7, 1000)
    emit('sensor://facts', insertTabFacts(7))
    tick(1100)
    down(9, 2000)
    emit('sensor://facts', insertTabFacts(9))
    tick(2100)
    await settle(session)

    expect(built).toHaveLength(2)
    expect(built.every((b) => b.title.length > 0)).toBe(true)

    const silent = createRecorderSession(bridge)
    down(11, 3000)
    emit('sensor://facts', insertTabFacts(11))
    tick(3100)
    await settle(silent)
    expect(silent.stepCount()).toBe(1)
  })
})

describe('الإشارة الفوريّة (بلاغ المالك «المستخدم لا ينتظر») — onGestureAccepted/onGestureDropped', () => {
  it('ضغطة مقبولة ⇐ accepted فورًا بالرقم المتوقّع قبل وصول الحقائق، ثم step بلا dropped', async () => {
    const { bridge, emit } = makeBridge()
    emit0 = emit
    const accepted: number[] = []
    const dropped: number[] = []
    const session = createRecorderSession(bridge, {
      onGestureAccepted: (n) => accepted.push(n),
      onGestureDropped: () => dropped.push(1),
    })
    down(7, 1000)
    // الإشارة لحظة الضغطة حصرًا — قبل أن تصل الحقائق ولا قبل إغلاق الإيماءة
    expect(accepted).toEqual([1])
    expect(dropped).toHaveLength(0)
    emit('sensor://facts', insertTabFacts(7))
    tick(1100)
    await settle(session)
    expect(session.stepCount()).toBe(1)
    expect(dropped).toHaveLength(0)
  })

  it('حقائق غائبة حتى مهلة ٣ب ⇐ dropped يغلق البطاقة المؤقّتة بصدق', async () => {
    const { bridge, emit } = makeBridge()
    emit0 = emit
    const accepted: number[] = []
    const dropped: number[] = []
    const session = createRecorderSession(bridge, {
      onGestureAccepted: (n) => accepted.push(n),
      onGestureDropped: () => dropped.push(1),
    })
    down(51, 2000)
    expect(accepted).toEqual([1])
    tick(2060) // يغلق نافذة الإيماءة؛ البناء ينتظر الحقائق حتى 2250
    await new Promise((r) => setTimeout(r, 0))
    tick(2400) // انقضى انتظار ٣ب ⇐ إسقاط صادق
    await settle(session)
    expect(session.stepCount()).toBe(0)
    expect(dropped).toHaveLength(1)
  })

  it('حقائق خطأ ⇐ dropped كذلك، والإيقاف قبل الضغطة لا يقبل شيئًا', async () => {
    const { bridge, emit } = makeBridge()
    emit0 = emit
    const accepted: number[] = []
    const dropped: number[] = []
    const session = createRecorderSession(bridge, {
      onGestureAccepted: (n) => accepted.push(n),
      onGestureDropped: () => dropped.push(1),
    })
    session.pause()
    down(8, 1000)
    expect(accepted).toHaveLength(0) // الإيقاف يبوّب الإشارة أيضًا — لا بطاقة زائفة
    session.resume()
    down(9, 2000)
    emit('sensor://facts', { seq: 9, error: 'uia فشل' })
    tick(2100)
    await settle(session)
    expect(session.stepCount()).toBe(0)
    expect(dropped).toHaveLength(1)
  })

  it('نقرات الودجة (ignorePoint) لا تُقبل إطلاقًا — لا accepted ولا بطاقة زائفة', async () => {
    const { bridge, emit } = makeBridge()
    emit0 = emit
    const accepted: number[] = []
    const session = createRecorderSession(bridge, {
      ignorePoint: (x, y) => x < 100 && y < 100,
      onGestureAccepted: (n) => accepted.push(n),
    })
    emit('sensor://input', { seq: 3, qpcMs: 1000, kind: 'down', button: 'left', x: 30, y: 30, keyClass: null })
    tick(1100)
    await settle(session)
    expect(accepted).toHaveLength(0)
    expect(session.stepCount()).toBe(0)
  })

  it('الرقم المتوقّع يتقدّم مع المخزن: ثانية ⇐ ٢', async () => {
    const { bridge, emit } = makeBridge()
    emit0 = emit
    const accepted: number[] = []
    const session = createRecorderSession(bridge, { onGestureAccepted: (n) => accepted.push(n) })
    down(7, 1000)
    emit('sensor://facts', insertTabFacts(7))
    tick(1100)
    down(9, 2000)
    emit('sensor://facts', insertTabFacts(9))
    tick(2100)
    await settle(session)
    expect(accepted).toEqual([1, 2])
  })
})
