import { describe, expect, it } from 'vitest'
import { createRecorderSession, type Bridge, type FramePickResult } from './session'

/** ساعة `step.ts` — عقد النواة (guide.ts: «step.ts − startedAt» وstartedAt قراءة
 *  Date.now) والإضافة (events.ts: `ts: Date.now()`) أنّ ختم الخطوة **epoch ms**.
 *  المستشعرات تختم بـqpcMs (مللي ثانية منذ إقلاع الجهاز)، فالجلسة تقرنهما مرّةً
 *  واحدة عند أوّل ختم يصل ثم تحوّل كل ختم بفرقه عن المرساة: ساعةٌ واحدة في
 *  الدليل، والفواصل بين الخطوات فواصلُ المستشعر حرفيًّا. */

type DesktopFactsWire = Record<string, unknown> & { seq: number }

function tabFacts(seq: number, hwnd = '0x10ac'): DesktopFactsWire {
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
      hwnd,
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
  const picked = (seq: number): FramePickResult => ({
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
      return picked(args.seq)
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

const down = (emit: (e: string, p: unknown) => void, seq: number, qpcMs: number) =>
  emit('sensor://input', { seq, qpcMs, kind: 'down', keyClass: null })
const tick = (emit: (e: string, p: unknown) => void, qpcMs: number) =>
  emit('sensor://tick', { qpcMs })

/** إيماءة كاملة: ضغطة + حقائق + صمت يغلق الإيماءة (≥ collectMs=60) */
function gesture(
  emit: (e: string, p: unknown) => void,
  session: ReturnType<typeof createRecorderSession>,
  seq: number,
  q0: number,
  hwnd?: string,
): Promise<void> {
  down(emit, seq, q0)
  emit('sensor://facts', tabFacts(seq, hwnd))
  tick(emit, q0 + 100)
  return session.whenIdle()
}

/** لحظة البدء المطلقة في الاختبارات — من حجم بلاغ المالك (1,790,366,370,082) */
const T0 = 1_790_366_000_000

describe('ساعة step.ts — epoch ms من ساعةٍ واحدة لا qpcMs منذ الإقلاع', () => {
  it('أوّل نبضة تقرن ساعة المستشعر بالساعة المطلقة: ts = لحظة المرساة + فرق qpcMs', async () => {
    const { bridge, emit } = makeBridge()
    // ساعة مطلقة تقفز ساعةً للوراء بعد أوّل قراءة (تصحيح NTP) — المرساة قراءةٌ
    // واحدة، فلا قفزةَ لاحقة تمسّ الخطوات
    const wall = [T0, T0 - 3_600_000]
    const session = createRecorderSession(bridge, { epochNow: () => wall.shift() ?? T0 - 7_200_000 })

    // أرقام البلاغ نفسها: ~66.4 مليون مث منذ الإقلاع وبكسرها العشريّ
    tick(emit, 66_453_000.25)
    await gesture(emit, session, 1, 66_453_623.9753)
    await gesture(emit, session, 2, 66_465_458.0107)

    const guide = await session.stop()
    expect(guide.steps.map((s) => s.ts)).toEqual([T0 + 624, T0 + 12_458])
  })

  it('خطوة navigate المُدرَجة لتبديل النافذة على الساعة نفسها وبختم نقرتها', async () => {
    const { bridge, emit } = makeBridge()
    const session = createRecorderSession(bridge, { epochNow: () => T0 })

    tick(emit, 5000)
    await gesture(emit, session, 1, 5200, '0xaaaa')
    await gesture(emit, session, 2, 9200, '0xbbbb') // نافذة أخرى ⇐ navigate قبلها

    const guide = await session.stop()
    expect(guide.steps.map((s) => [s.kind, s.ts])).toEqual([
      ['click', T0 + 200],
      ['navigate', T0 + 4200],
      ['click', T0 + 4200],
    ])
  })

  it('نقرة قبل أيّ نبضة: ختمها نفسه هو المرساة', async () => {
    const { bridge, emit } = makeBridge()
    const session = createRecorderSession(bridge, { epochNow: () => T0 })

    await gesture(emit, session, 1, 7000)

    const guide = await session.stop()
    expect(guide.steps[0]!.ts).toBe(T0)
  })

  it('بلا حقن: الساعة المطلقة هي Date.now كختم الإضافة', async () => {
    const { bridge, emit } = makeBridge()
    const session = createRecorderSession(bridge)

    const before = Date.now()
    tick(emit, 66_453_000)
    const after = Date.now()
    await gesture(emit, session, 1, 66_453_500)

    const guide = await session.stop()
    expect(guide.steps[0]!.ts).toBeGreaterThanOrEqual(before + 500)
    expect(guide.steps[0]!.ts).toBeLessThanOrEqual(after + 500)
  })
})
