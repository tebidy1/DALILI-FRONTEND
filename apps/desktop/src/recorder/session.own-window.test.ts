import { describe, expect, it } from 'vitest'
import { createRecorderSession, type Bridge, type FramePickResult } from './session'

/** إصلاح برهان المالك (٣هـ): نقرات الودجة نفسها أحداثُ واجهةٍ لا عملَ مستخدم —
 *  الخطّاف الشامل (WH_MOUSE_LL) يراها فلا بدّ من بوّابة إحداثيّات: down داخل
 *  مستطيل الودجة يُتجاهَل قبل فتح الإيماءة، وما خارجه يجري كالمعتاد.
 *  الإحداثيّات فيزيائيّة عالميّة (عقد ٣ب §٣.٢: `x,y` مع كل حدث) ومستطيل
 *  الودجة من outerPosition/outerSize بالفضاء نفسه — فلتر TS محض بلا مساس
 *  بـRust ولا بالحقائق (التي قد تتأخّر أو تخطئ على WebView2). */

type DesktopFactsWire = Record<string, unknown> & { seq: number }

function tabFacts(seq: number): DesktopFactsWire {
  return {
    seq,
    readMs: 21.4,
    element: {
      automationId: `Tab${seq}`,
      name: 'تبويب',
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
      processName: 'EXCEL.EXE',
      windowTitle: 'Book1 - Excel',
      appId: 'app:EXCEL.EXE',
      affinity: 0,
      ieMode: false,
    },
  }
}

function makeBridge() {
  const handlers = new Map<string, Array<(p: unknown) => void>>()
  const results = new Map<number, FramePickResult>()
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
      return results.get(args.seq) ?? pickedDefault(args.seq)
    },
    async factsRefresh() {
      return null
    },
    async frameBlur() {},
  }
  const emit = (evt: string, p: unknown) => {
    for (const cb of handlers.get(evt) ?? []) cb(p)
  }
  return { bridge, emit }
}

const downAt = (
  emit: (e: string, p: unknown) => void,
  seq: number,
  qpcMs: number,
  x: number,
  y: number,
) => emit('sensor://input', { seq, qpcMs, kind: 'down', keyClass: null, x, y })
const tick = (emit: (e: string, p: unknown) => void, qpcMs: number) =>
  emit('sensor://tick', { qpcMs })

/** مستطيل ودجة افتراضي 320×72 عند أصل الشاشة (فيزيائي) */
const ignoreWidget = (x: number, y: number): boolean =>
  x >= 0 && x <= 320 && y >= 0 && y <= 72

describe('استثناء نقرات الودجة نفسها — بوّابة الإحداثيّات', () => {
  it('(أ) ضغطة داخل مستطيل الودجة تُتجاهَل مع مفاتيحها اللاحقة — لا إيماءة ولا خطوة', async () => {
    const { bridge, emit } = makeBridge()
    const session = createRecorderSession(bridge, { ignorePoint: ignoreWidget })

    downAt(emit, 1, 1000, 160, 36) // وسط الودجة
    emit('sensor://input', { seq: 2, qpcMs: 1050, kind: 'key', keyClass: 'char' })
    // حقائق نقرة الودجة تصل فعلًا (UIA لا يعلم بفلترنا) — وإن مُنِفت الإيماءة
    // لبنى سليمة لبُنيت خطوة، وهذا ما يكشف غياب الفلتر
    emit('sensor://facts', tabFacts(1))
    tick(emit, 1200)
    await session.whenIdle()
    expect(session.stepCount()).toBe(0)

    // والجلسة بعدها سليمة: نقرة حقيقيّة خارج الودجة تبني خطوة
    downAt(emit, 3, 2000, 500, 400)
    emit('sensor://facts', tabFacts(3))
    tick(emit, 2100)
    await session.whenIdle()
    expect(session.stepCount()).toBe(1)
    await session.stop()
  })

  it('(ب) ضغطة خارج المستطيل تبني خطوة كالمعتاد مع توفير ignorePoint', async () => {
    const { bridge, emit } = makeBridge()
    const session = createRecorderSession(bridge, { ignorePoint: ignoreWidget })

    downAt(emit, 11, 1000, 800, 600)
    emit('sensor://facts', tabFacts(11))
    tick(emit, 1100)
    await session.whenIdle()
    expect(session.stepCount()).toBe(1)
    await session.stop()
  })

  it('(ج) بلا خيار ignorePoint تعمل الجلسة كما كانت — نقر في أيّ مكان يبني', async () => {
    const { bridge, emit } = makeBridge()
    const session = createRecorderSession(bridge)

    downAt(emit, 21, 1000, 160, 36) // نقرة «داخل الودجة» بلا فلتر — تبني كالسابق
    emit('sensor://facts', tabFacts(21))
    tick(emit, 1100)
    await session.whenIdle()
    expect(session.stepCount()).toBe(1)
    await session.stop()
  })

  it('(د) حقائق خطأ لنقرة ودجة مستثناة تُهمَل ولا تُشوِّش الإيماءات التالية', async () => {
    const { bridge, emit } = makeBridge()
    const session = createRecorderSession(bridge, { ignorePoint: ignoreWidget })

    downAt(emit, 1, 1000, 160, 36)
    emit('sensor://facts', { seq: 1, error: 'timeout' })
    tick(emit, 1200)
    await session.whenIdle()
    expect(session.stepCount()).toBe(0)

    downAt(emit, 2, 2000, 500, 400)
    emit('sensor://facts', tabFacts(2))
    tick(emit, 2100)
    await session.whenIdle()
    expect(session.stepCount()).toBe(1)
    await session.stop()
  })
})
