import { describe, expect, it } from 'vitest'
import { createRecorderSession, type Bridge, type FramePickResult } from './session'

/** ٣هـ-٢ — الإيقاف المؤقّت سياسة جلسة TS: عَلَم `paused` يبوّب معالج
 *  `sensor://input` فلا إيماءة تُبنى أثناء الإيقاف، وtick يظلّ يجري
 *  للساعة والمجدول. `recording_pause` (Rust) يبقى no-op موثَّقًا لا
 *  يُتّكأ عليه — لا نداء له من هنا إطلاقًا. */

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
): Promise<void> {
  down(emit, seq, q0)
  emit('sensor://facts', tabFacts(seq))
  tick(emit, q0 + 100)
  return session.whenIdle()
}

describe('٣هـ-٢ — الإيقاف المؤقّت بوّابة جلسة (لا إيماءات أثناءه)', () => {
  it('(أ) إيقاف قبل أيّ إيماءة: الضغط والكتابة يُتجاهَلان، والاستئناف يعيد الجمع', async () => {
    const { bridge, emit } = makeBridge()
    const session = createRecorderSession(bridge)

    session.pause()
    await gesture(emit, session, 1, 1000) // أثناء الإيقاف — يجب أن تُتجاهَل
    expect(session.stepCount()).toBe(0)

    session.resume()
    await gesture(emit, session, 2, 2000)
    expect(session.stepCount()).toBe(1)

    await session.stop()
  })

  it('(ب) إيقاف بين إيماءتين: ما قبل الإيقاف يُجمَع، ما أثناءه يُتجاهَل، وما بعده يُستأنف', async () => {
    const { bridge, emit } = makeBridge()
    const session = createRecorderSession(bridge)

    await gesture(emit, session, 11, 1000)
    expect(session.stepCount()).toBe(1)

    session.pause()
    await gesture(emit, session, 12, 2000)
    expect(session.stepCount()).toBe(1) // لا زيادة أثناء الإيقاف

    session.resume()
    await gesture(emit, session, 13, 3000)
    expect(session.stepCount()).toBe(2)

    // نبضات الساعة تظلّ تجري أثناء الإيقاف (لا تتجمد المجدولة)
    session.pause()
    tick(emit, 9000)
    session.resume()

    const guide = await session.stop()
    expect(guide.steps).toHaveLength(2)
  })
})
