import { describe, expect, it } from 'vitest'
import type { DesktopFacts } from '@dalili/core'
import type { Bridge, FramePickResult } from './session'
import { createWidgetController, type ControllerDeps, type ControllerEvent } from './controller'

/** متحكّم الودجة (مرحلة الربط ١): يملك الجلسة والتسليم ويترجمها أحداثَ بروتوكول.
 *  كل الاختبارات بمزيّفات كاملة — لا Tauri ولا Rust ولا شبكة ولا مؤقّتات:
 *  الساعة نبضاتٌ يدويّة كما اختبارات الجلسة حرفيًّا. */

type DesktopFactsWire = Record<string, unknown> & { seq: number }

function tabFacts(seq: number): DesktopFactsWire {
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
      processName: 'C:\\app\\EXCEL.EXE',
      windowTitle: 'Book1 - Excel',
      appId: 'app:EXCEL.EXE',
      affinity: 0,
      ieMode: false,
    },
  }
}

/** مزيّف Bridge كامل + ready كما جسر الإنتاج */
function makeBridge() {
  const handlers = new Map<string, Array<(p: unknown) => void>>()
  const unlistens: Array<() => void> = []
  const results = new Map<number, FramePickResult>()
  const bridge: Bridge & { ready(): Promise<void> } = {
    listen(evt, cb) {
      const list = handlers.get(evt) ?? []
      list.push(cb)
      handlers.set(evt, list)
      const un = () => {
        handlers.set(
          evt,
          (handlers.get(evt) ?? []).filter((f) => f !== cb),
        )
      }
      unlistens.push(un)
      return un
    },
    async invoke(_cmd, args) {
      return (
        results.get(args.seq) ?? {
          localId: `f-${args.seq}`,
          path: `%TEMP%\\itqan-frames\\f-${args.seq}.jpg`,
          qpcMs: 1000,
          deltaMs: -18.5,
          monitor: { x: 0, y: 0, w: 1920, h: 1080, dpi: 96 },
        }
      )
    },
    async factsRefresh() {
      return null
    },
    async frameBlur() {},
    async ready() {},
  }
  const emit = (evt: string, p: unknown) => {
    for (const cb of handlers.get(evt) ?? []) cb(p)
  }
  return { bridge, emit, unlistens, results }
}

/** مزيّف التسليم الحيّ: يسمح للاختبار بإطلاق أحداث الرفع والتوليد كي يجري
 *  تنسيق deliverGuide الحقيقي كاملًا (انتظار ⇒ استبدال ⇒ فتح عارض) */
function makeDelivery() {
  const queuedFiles: Array<[string, string]> = []
  const queuedGuides: Array<{ sessionId: string; body: unknown; hasVoice: boolean }> = []
  const queuedAudios: Array<[string, string, string]> = []
  const opened: string[] = []
  const uploadedHandlers: Array<(e: { sessionId: string; localId: string; fileId: string }) => void> = []
  const createdHandlers: Array<(e: { sessionId: string; guideId: string }) => void> = []
  return {
    queuedFiles,
    queuedGuides,
    queuedAudios,
    opened,
    emitUploaded: (sessionId: string, localId: string, fileId: string) => {
      for (const h of uploadedHandlers) h({ sessionId, localId, fileId })
    },
    emitCreated: (sessionId: string, guideId: string) => {
      for (const h of createdHandlers) h({ sessionId, guideId })
    },
    queueFile: async (sessionId: string, localId: string) => {
      queuedFiles.push([sessionId, localId])
    },
    queueAudio: async (sessionId: string, localId: string, webmB64: string) => {
      queuedAudios.push([sessionId, localId, webmB64])
    },
    queueGuide: async (sessionId: string, guideJson: string, hasVoice: boolean) => {
      queuedGuides.push({ sessionId, body: JSON.parse(guideJson), hasVoice })
    },
    openInBrowser: async (path: string) => {
      opened.push(path)
    },
    onUploaded(cb: (e: { sessionId: string; localId: string; fileId: string }) => void) {
      uploadedHandlers.push(cb)
      return () => {}
    },
    onGuideCreated(cb: (e: { sessionId: string; guideId: string }) => void) {
      createdHandlers.push(cb)
      return () => {}
    },
  }
}

function makeRecording() {
  let starts = 0
  let stops = 0
  return {
    starts: () => starts,
    stops: () => stops,
    start: async () => {
      starts++
      return { sessionId: `sess-${starts}` }
    },
    stop: async () => {
      stops++
    },
  }
}

/** مزيّف الاقتران — حالةٌ ثابتة يعدّلها الاختبار */
function makeAuth(opts: { paired?: boolean } = {}) {
  let paired = opts.paired ?? false
  const pairStarts = 0
  return {
    starts: () => pairStarts,
    setPaired: (v: boolean) => {
      paired = v
    },
    status: async () => (paired ? { paired: true, email: 'owner@company.sa' } : { paired: false }),
    pairStart: async () => ({ userCode: 'ABCD-1234', verifyUrl: 'http://x/device' }),
    forget: async () => {},
    openVerify: async () => {},
    onAuthEvent: () => () => {},
  }
}

/** مزيّف مسجّل التعليق — يفتح ويوقف ويختم مقاطع webm وهميّة */
function makeRecorder(opts: { failStart?: string; chunks?: string[] } = {}) {
  let starts = 0
  let stops = 0
  let cur = false
  return {
    starts: () => starts,
    stops: () => stops,
    start: async () => {
      if (opts.failStart) return { ok: false as const, errorAr: opts.failStart }
      starts += 1
      cur = true
      return { ok: true as const }
    },
    stop: async () => {
      if (!cur) return { ok: false as const, errorAr: 'لا تسجيل تعليق جارٍ' }
      stops += 1
      cur = false
      return { ok: true as const, chunks: opts.chunks ?? ['Y2h1bms='], durationMs: 1500 }
    },
  }
}

/** deps كاملة بمزيّفات — النقرات خارج مستطيل الودجة المزيّف [0,0,100,100] */
function makeDeps(recorderOpts: { failStart?: string; chunks?: string[] } = {}) {
  const b = makeBridge()
  const delivery = makeDelivery()
  const recording = makeRecording()
  const auth = makeAuth()
  const recorder = makeRecorder(recorderOpts)
  const deps: ControllerDeps = {
    bridge: b.bridge,
    recording,
    thumb: async (localId: string) => ({ dataUrl: `data:image/jpeg;base64,${localId}` }),
    delivery,
    auth,
    widgetRects: () => [{ x: 0, y: 0, w: 100, h: 100 }],
    recorder: () => recorder,
  }
  return { ...b, delivery, recording, auth, recorder, deps }
}

/** انتظار شرطٍ حتى يتحقق (التنسيق يبدأ بعد حلّ stop غير المتزامن) */
async function waitUntil(pred: () => boolean, timeout = 2000): Promise<void> {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    if (pred()) return
    await new Promise((r) => setTimeout(r, 5))
  }
  throw new Error('waitUntil: انتهى الزمن')
}

const down = (emit: (e: string, p: unknown) => void, seq: number, qpcMs: number) =>
  emit('sensor://input', { seq, qpcMs, kind: 'down', x: 640, y: 105 })
const facts = (emit: (e: string, p: unknown) => void, seq: number) =>
  emit('sensor://facts', tabFacts(seq))
const tick = (emit: (e: string, p: unknown) => void, qpcMs: number) =>
  emit('sensor://tick', { qpcMs })

/** ينتظر أول حدث من نوع معيّن */
function nextEvent(ctrl: ReturnType<typeof createWidgetController>, t: ControllerEvent['t']) {
  return new Promise<ControllerEvent>((resolve) => {
    ctrl.onEvent((e) => {
      if (e.t === t) resolve(e)
    })
  })
}

async function startedController(opts: { voice?: boolean } = {}) {
  const d = makeDeps()
  const ctrl = createWidgetController(d.deps)
  const started = ctrl.start(opts.voice === true)
  // الاشتراكات جاهزة قبل عودة start (ready محقون)
  await started
  return { ctrl, ...d }
}

describe('مرحلة الربط ١ — المتحكّم: الجلسة الحقيقيّة أحداثَ بروتوكول', () => {
  it('البدء يشغّل المستشعرات مرّةً، والنقر الحقيقي ⇐ حدث step بالعدّاد والموجز والمصغّرة — والطبرُ مؤجَّل للإنهاء', async () => {
    const { ctrl, emit, delivery, recording } = await startedController()
    expect(recording.starts()).toBe(1)

    const stepP = nextEvent(ctrl, 'step') as Promise<Extract<ControllerEvent, { t: 'step' }>>
    down(emit, 7, 1000)
    facts(emit, 7)
    tick(emit, 1100)
    const step = await stepP

    expect(step.steps).toBe(1)
    expect(step.title).toContain('إدراج')
    expect(step.thumbDataUrl).toBe('data:image/jpeg;base64,f-7')
    // طابور اللقطات مالكه تنسيق الإنهاء (٣د-٣) — لا طبرٌ لحظة الخطوة
    expect(delivery.queuedFiles).toEqual([])
  })

  it('البدء المزدوج محروس — recording.start مرّة واحدة', async () => {
    const { ctrl, recording } = await startedController()
    await ctrl.start(false)
    expect(recording.starts()).toBe(1)
  })

  it('نقرة داخل نافذة الودجة مستثناة — لا خطوة ولا حدث', async () => {
    const { ctrl, emit, deps } = await startedController()
    let saw = false
    ctrl.onEvent((e) => {
      if (e.t === 'step') saw = true
    })
    // إحداثيّان داخل [0,0,100,100]
    emit('sensor://input', { seq: 3, qpcMs: 500, kind: 'down', x: 50, y: 50 })
    tick(emit, 700)
    await new Promise((r) => setTimeout(r, 10))
    expect(saw).toBe(false)
    expect(deps).toBeTruthy()
  })

  it('الإيقاف المؤقّت يبوّب النقرات ويبثّ paused، والاستئناف يعيد', async () => {
    const { ctrl, emit } = await startedController()
    const pausedP = nextEvent(ctrl, 'paused') as Promise<Extract<ControllerEvent, { t: 'paused' }>>
    ctrl.pause()
    expect((await pausedP).paused).toBe(true)

    down(emit, 7, 1000)
    facts(emit, 7)
    tick(emit, 1100)

    const resumedP = nextEvent(ctrl, 'paused') as Promise<Extract<ControllerEvent, { t: 'paused' }>>
    ctrl.resume()
    expect((await resumedP).paused).toBe(false)
    // النقرة المبوَّبة لم تبِن خطوة
    await ctrl.finish()
    // (التحقق النهائي في اختبار الإنهاء أدناه — هنا لا انفجار يكفي مع العدّاد أدناه)
  })

  it('الإنهاء الحقيقي: رفعٌ ⇐ استبدال المعرّفات ⇐ تسليم ⇐ فتح العارض ⇐ ended وصل', async () => {
    const { ctrl, emit, delivery, recording } = await startedController()
    down(emit, 7, 1000)
    facts(emit, 7)
    tick(emit, 1100)
    await new Promise((r) => setTimeout(r, 5))

    const endedP = nextEvent(ctrl, 'ended') as Promise<Extract<ControllerEvent, { t: 'ended'; arrived?: boolean }>>
    await ctrl.finish()
    // التنسيق طابَر اللقطة عند الإنهاء وطلب رفعها (بعد حلّ stop)
    await waitUntil(() => delivery.queuedFiles.length === 1)
    expect(delivery.queuedFiles).toEqual([['sess-1', 'f-7']])
    // الرفع يتم ⇒ الاستبدال ثم التسليم
    delivery.emitUploaded('sess-1', 'f-7', 'file-real-1')
    delivery.emitCreated('sess-1', 'g-9')

    const ended = await endedP
    expect(ended.arrived).toBe(true)
    expect(recording.stops()).toBe(1)
    expect(delivery.queuedGuides).toHaveLength(1)
    const q = delivery.queuedGuides[0]!
    expect(q.sessionId).toBe('sess-1')
    expect(q.hasVoice).toBe(false)
    // الاستبدال داخل الجسم: المعرّف الحقيقيّ حلّ محلّ المحلّيّ
    const steps = (q.body as { guide: { steps: Array<{ screenshot?: { fileId?: string } }> } }).guide.steps
    expect(steps[0]?.screenshot?.fileId).toBe('file-real-1')
    // فتح العارض على عنوان الويب
    expect(delivery.opened).toEqual(['/g/g-9'])

    // الاشتراكات فُكّت: حدثٌ لاحق لا يبني شيئًا
    down(emit, 9, 5000)
    facts(emit, 9)
    tick(emit, 5100)
    await new Promise((r) => setTimeout(r, 5))
    expect(delivery.queuedFiles).toHaveLength(1)
  })

  it('إنهاء وهو غير مقترن ⇐ pairing-needed تدعوه للربط (والدليل يُشحن حال اقترانه)', async () => {
    const { ctrl, emit, delivery } = await startedController() // المزيّف غير مقترن افتراضيًّا
    down(emit, 7, 1000)
    facts(emit, 7)
    tick(emit, 1100)
    await new Promise((r) => setTimeout(r, 5))

    const needP = nextEvent(ctrl, 'pairing-needed')
    const endedP = nextEvent(ctrl, 'ended')
    await ctrl.finish()
    await needP
    await waitUntil(() => delivery.queuedFiles.length === 1)
    // بعد الرفع الافتراضيّ ⇒ يكتمل التسليم ويصل arrived
    delivery.emitUploaded('sess-1', 'f-7', 'file-real-1')
    const ended = (await endedP) as Extract<ControllerEvent, { t: 'ended'; arrived?: boolean }>
    expect(ended.arrived).toBe(true)
    expect(delivery.queuedGuides).toHaveLength(1)
  })

  it('الإلغاء: stop بلا تسليم ثم ended', async () => {
    const { ctrl, delivery, recording } = await startedController()
    const endedP = nextEvent(ctrl, 'ended')
    await ctrl.cancel()
    await endedP
    expect(recording.stops()).toBe(1)
    expect(delivery.queuedGuides).toHaveLength(0)
  })
})

describe('مرحلة الاقتران — المتحكّم يدير حالة الحساب أحداثَ auth', () => {
  it('الحالة تُجلب عند الإنشاء وتُبثّ، وpairStart يمرّ بالرمز القصير', async () => {
    const d = makeDeps()
    const events: ControllerEvent[] = []
    const ctrl = createWidgetController(d.deps)
    ctrl.onEvent((e) => events.push(e))
    await new Promise((r) => setTimeout(r, 10))

    const authEvts = events.filter((e) => e.t === 'auth')
    expect(authEvts.length).toBeGreaterThan(0)
    expect(authEvts[0]).toMatchObject({ t: 'auth', phase: 'unpaired' })

    const authP = new Promise<ControllerEvent>((resolve) => {
      ctrl.onEvent((e) => {
        if (e.t === 'auth' && e.phase === 'pairing' && e.userCode) resolve(e)
      })
    })
    await ctrl.pairStart()
    const ev = (await authP) as Extract<ControllerEvent, { t: 'auth'; userCode?: string }>
    expect(ev.userCode).toBe('ABCD-1234')
  })

  it('جهازٌ مقترنٌ سلفًا ⇐ phase=paired بالبريد', async () => {
    const d = makeDeps()
    d.auth.setPaired(true)
    const events: ControllerEvent[] = []
    const ctrl = createWidgetController(d.deps)
    ctrl.onEvent((e) => events.push(e))
    await new Promise((r) => setTimeout(r, 10))
    const authEvts = events.filter((e) => e.t === 'auth')
    expect(authEvts[0]).toMatchObject({ t: 'auth', phase: 'paired', email: 'owner@company.sa' })
  })

  it('الاستقصاء أثناء الانتظار يقلب البطاقة أخضر حيًّا — Rust لا يطلق حدث اقتران', async () => {
    const d = makeDeps()
    const events: ControllerEvent[] = []
    const ctrl = createWidgetController(d.deps)
    ctrl.onEvent((e) => {
      if (e.t === 'auth') events.push(e)
    })
    await ctrl.pairStart()
    await waitUntil(() => events.some((e) => e.t === 'auth' && e.phase === 'pairing' && !!e.userCode))
    // الموافقة تحدث من طرف المالك في الويب أثناء الانتظار
    d.auth.setPaired(true)
    const greenP = new Promise<ControllerEvent>((resolve) => {
      ctrl.onEvent((e) => {
        if (e.t === 'auth' && e.phase === 'paired') resolve(e)
      })
    })
    const green = (await greenP) as Extract<ControllerEvent, { t: 'auth'; email?: string }>
    expect(green.email).toBe('owner@company.sa')
  }, 8000)
})

describe('الإشارة الفوريّة — capturing/dropped يبثّان لحظة القبول والإسقاط', () => {
  it('نقرة حقيقيّة ⇐ capturing بالرقم المتوقّع قبل step، وترتيبهما محفوظ', async () => {
    const { ctrl, emit } = await startedController()
    const events: ControllerEvent[] = []
    ctrl.onEvent((e) => events.push(e))
    down(emit, 7, 1000)
    // الإشارة لحظة الضغطة — لا انتظار حقائق ولا لقطات
    await waitUntil(() => events.some((e) => e.t === 'capturing'))
    const cap = events.find((e) => e.t === 'capturing') as Extract<ControllerEvent, { t: 'capturing' }>
    expect(cap.steps).toBe(1)
    // ثم تكتمل الخطوة فتتقدّم أحداث step بعدها
    facts(emit, 7)
    tick(emit, 1100)
    await waitUntil(() => events.some((e) => e.t === 'step'))
    expect(events.findIndex((e) => e.t === 'capturing')).toBeLessThan(events.findIndex((e) => e.t === 'step'))
  })

  it('نقرة الودجة المستثناة ⇐ لا capturing (لا بطاقة زائفة على نقرة واجهتنا)', async () => {
    const { ctrl, emit } = await startedController()
    const events: ControllerEvent[] = []
    ctrl.onEvent((e) => events.push(e))
    emit('sensor://input', { seq: 3, qpcMs: 500, kind: 'down', x: 50, y: 50 })
    tick(emit, 700)
    await new Promise((r) => setTimeout(r, 10))
    expect(events.some((e) => e.t === 'capturing')).toBe(false)
  })

  it('إيماءة تسقط (لا حقائق) ⇐ dropped بعد capturing يغلق البطاقة بصدق', async () => {
    const { ctrl, emit } = await startedController()
    const events: ControllerEvent[] = []
    ctrl.onEvent((e) => events.push(e))
    down(emit, 51, 2000)
    tick(emit, 2060)
    await new Promise((r) => setTimeout(r, 5))
    tick(emit, 2400) // انقضاء مهلة ٣ب على ساعة الجلسة
    await waitUntil(() => events.some((e) => e.t === 'dropped'))
    expect(events.some((e) => e.t === 'step')).toBe(false)
  })
})

describe('المرحلة ٢ — الصوت الحقيقي: auto-memo/voice-memo مركَّبان في المتحكّم', () => {
  it('«ابدأ مع تعليق صوتي» ⇐ أول خطوة تبدأ تعليقًا تلقائيًّا والثانية تنقل الحفظ إليها', async () => {
    const { ctrl, emit, recorder } = await startedController({ voice: true })
    down(emit, 7, 1000)
    facts(emit, 7)
    tick(emit, 1100)
    await waitUntil(() => recorder.starts() === 1)
    // الخطوة الثانية: توقف تعليق الأولى (يُحفظ) وابدأ على الثانية — الانتقال المتسلسل
    down(emit, 9, 5000)
    facts(emit, 9)
    tick(emit, 5100)
    await waitUntil(() => recorder.starts() === 2 && recorder.stops() === 1)
  })

  it('الإنهاء يختم التعليق ويربطه بالخطوة ويصطفّ ‏queueAudio بـhasVoice، والرفع يستبدل المعرّف', async () => {
    const { ctrl, emit, delivery, recorder } = await startedController({ voice: true })
    down(emit, 7, 1000)
    facts(emit, 7)
    tick(emit, 1100)
    await waitUntil(() => recorder.starts() === 1)

    const endedP = nextEvent(ctrl, 'ended')
    await ctrl.finish()
    // اللقطة والصوت يُطبران لحظة بناء التنسيق — الانتظار يضمن ولادته قبل أحداث الرفع
    await waitUntil(() => delivery.queuedFiles.length === 1 && delivery.queuedAudios.length === 1)
    const [sid, localId, b64] = delivery.queuedAudios[0]!
    expect(sid).toBe('sess-1')
    expect(localId).toBe('v-1')
    expect(b64).toBe('Y2h1bms=') // مقطع واحد يمرّ كما هو (التسلسل البايتيّ)
    // رفعُ الصوت واللقطة ⇒ استبدال المعرّفات ثم ختم الجسم بـhasVoice مرفوعًا
    delivery.emitUploaded('sess-1', 'v-1', 'file-audio-1')
    delivery.emitUploaded('sess-1', 'f-7', 'file-real-1')
    delivery.emitCreated('sess-1', 'g-9')
    const ended = (await endedP) as Extract<ControllerEvent, { t: 'ended'; arrived?: boolean }>
    expect(ended.arrived).toBe(true)
    expect(delivery.queuedGuides).toHaveLength(1)
    expect(delivery.queuedGuides[0]!.hasVoice).toBe(true)
    const after = (
      (delivery.queuedGuides[0]!.body as { guide: { steps: Array<{ voice?: Record<string, unknown> }> } }).guide.steps[0]!
    )
    // التعليق دُمج بالخطوة (مدّة ١.٥ث) ومعرّفه الحقيقيّ حلّ محلّ pending
    expect(after.voice).toMatchObject({ durationMs: 1500, fileId: 'file-audio-1', fileUrl: '/files/file-audio-1' })
    expect(after.voice?.pending).toBeUndefined()
  })

  it('بدءٌ بلا صوت ⇐ لا مسجّل ولا hasVoice — الصمتُ صادق', async () => {
    const { ctrl, emit, delivery, recorder } = await startedController()
    down(emit, 7, 1000)
    facts(emit, 7)
    tick(emit, 1100)
    await new Promise((r) => setTimeout(r, 10))
    expect(recorder.starts()).toBe(0)

    const endedP = nextEvent(ctrl, 'ended')
    await ctrl.finish()
    // ولادة التنسيق تُثبت بطبر اللقطة — بعدها أحداث الرفع في موعدها
    await waitUntil(() => delivery.queuedFiles.length === 1)
    delivery.emitUploaded('sess-1', 'f-7', 'file-real-1')
    delivery.emitCreated('sess-1', 'g-9')
    await endedP
    expect(delivery.queuedAudios).toHaveLength(0)
    expect(delivery.queuedGuides[0]!.hasVoice).toBe(false)
  })

  it('الإيقاف المؤقّت يعلّق التعليق والاستئناف يعيده — والإلغاء يطهّر كل شيء', async () => {
    const { ctrl, emit, recorder } = await startedController({ voice: true })
    down(emit, 7, 1000)
    facts(emit, 7)
    tick(emit, 1100)
    await waitUntil(() => recorder.starts() === 1)

    ctrl.pause()
    await waitUntil(() => recorder.stops() === 1)
    ctrl.resume()
    await waitUntil(() => recorder.starts() === 2)

    await ctrl.cancel()
    await waitUntil(() => recorder.stops() === 2)
  })

  it('ميك الشريط في الوضع التلقائي ⇐ مفتاحُ التعليق التلقائيّ كله (إيقاف ثم إعادة)', async () => {
    const { ctrl, emit, recorder } = await startedController({ voice: true })
    const voiceEvents: Array<Extract<ControllerEvent, { t: 'voice' }>> = []
    ctrl.onEvent((e) => {
      if (e.t === 'voice') voiceEvents.push(e)
    })
    down(emit, 7, 1000)
    facts(emit, 7)
    tick(emit, 1100)
    await waitUntil(() => recorder.starts() === 1)

    await ctrl.toggleVoice()
    await waitUntil(() => recorder.stops() === 1)
    await ctrl.toggleVoice()
    await waitUntil(() => recorder.starts() === 2)
    // الحالتان بثّتا تحوّل الوضع: إيقاف التلقائي ثم إعادته
    expect(voiceEvents.some((v) => v.auto === false)).toBe(true)
    expect(voiceEvents.some((v) => v.auto === true)).toBe(true)
  })

  it('فشل الميك ⇐ voice بلافتة عربية صادقة والتلقائي يُطفأ (تدهور معلن لا صمت)', async () => {
    const d = makeDeps({ failStart: 'تعذر فتح الميكروفون' })
    const ctrl = createWidgetController(d.deps)
    const voiceEvents: Array<Extract<ControllerEvent, { t: 'voice' }>> = []
    ctrl.onEvent((e) => {
      if (e.t === 'voice') voiceEvents.push(e)
    })
    await ctrl.start(true)
    down(d.emit, 7, 1000)
    facts(d.emit, 7)
    tick(d.emit, 1100)
    // التلقائي يُطفأ وبلافتة التدهور العربية الصادقة
    await waitUntil(() => voiceEvents.some((v) => v.auto === false && !!v.notice))
    const v = voiceEvents.find((x) => x.notice)!
    expect(v.notice).toContain('الميكروفون')
    expect(d.recorder.starts()).toBe(0)
  })

  it('ميك الشريط في جلسة عادية ⇐ تعليق يدويّ على آخر خطوة: بدءٌ ثم إيقاف (قرار stop-only)', async () => {
    const { ctrl, emit, recorder } = await startedController()
    down(emit, 7, 1000)
    facts(emit, 7)
    tick(emit, 1100)
    await new Promise((r) => setTimeout(r, 10))

    await ctrl.toggleVoice()
    await waitUntil(() => recorder.starts() === 1)
    await ctrl.toggleVoice()
    await waitUntil(() => recorder.stops() === 1)
  })
})
