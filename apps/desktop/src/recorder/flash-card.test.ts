import { describe, expect, it } from 'vitest'
import { createFlashCard, FLASH_HOLD_MS, type FlashView } from './flash-card'

/**
 * آلة بطاقة اللقطة (2026-09-30) — كل صفٍّ في جدول انتقالات المواصفة اختبار.
 * بلا DOM ولا Tauri ولا مؤقّتات: الساعة والمجدول محقونان كما `gesture-pacer`،
 * فما يُقاس هنا هو السياسة نفسها لا تجسيدها.
 */

/** ساعة/مجدول يدويّان — نفس عقد الجلسة: المواعيد تُفحص عند كل نبضة */
function makeClock() {
  let now = 0
  let pending: Array<{ fn: () => void; at: number }> = []
  return {
    now: () => now,
    schedule: (fn: () => void, ms: number) => {
      const e = { fn, at: now + ms }
      pending.push(e)
      return () => {
        pending = pending.filter((p) => p !== e)
      }
    },
    /** يقدّم الساعة ويطلق ما استحقّ — كما مستمع sensor://tick */
    tick(to: number) {
      now = to
      const due = pending.filter((p) => now >= p.at)
      pending = pending.filter((p) => now < p.at)
      for (const d of due) d.fn()
    },
    armed: () => pending.length,
  }
}

function makeVoice() {
  const calls: string[] = []
  let failStart = false
  return {
    calls,
    setFailStart: (v: boolean) => {
      failStart = v
    },
    api: {
      async start() {
        calls.push('start')
        return !failStart
      },
      async stop() {
        calls.push('stop')
      },
      async cancel() {
        calls.push('cancel')
      },
    },
  }
}

function harness(opts: { holdMs?: number } = {}) {
  const clock = makeClock()
  const voice = makeVoice()
  const views: Array<FlashView | null> = []
  const card = createFlashCard({
    now: clock.now,
    schedule: clock.schedule,
    holdMs: opts.holdMs ?? FLASH_HOLD_MS,
    voice: voice.api,
    onView: (v) => views.push(v),
  })
  const last = () => views[views.length - 1]
  return { card, clock, voice, views, last }
}

const SHOT = { src: 'data:image/jpeg;base64,aaa' }

describe('آلة بطاقة اللقطة — الالتقاط', () => {
  it('idle + capturing ⇐ بطاقة انتظار بالرقم المتوقّع', () => {
    const { card, last } = harness()
    card.capturing(1)
    expect(last()).toMatchObject({ n: 1, pending: true, shot: null, recording: false })
  })

  it('pending + step ⇐ البكسلات تملأ البطاقة وتُسلَّح المهلة', () => {
    const { card, clock, last } = harness()
    card.capturing(1)
    card.step(1, SHOT)
    expect(last()).toMatchObject({ n: 1, pending: false, shot: SHOT, recording: false })
    expect(clock.armed()).toBe(1)
  })

  // رقم الخطوة قد يخالف المتوقَّع: خطوة navigate تُدرَج قبل الرئيسيّة
  it('step برقمٍ مخالفٍ للمتوقَّع ⇐ الحقيقة تفوز', () => {
    const { card, last } = harness()
    card.capturing(2)
    card.step(3, SHOT)
    expect(last()).toMatchObject({ n: 3, pending: false })
  })

  // ═══ العلّة المُبلَّغة (بلاغ المالك 2026-09-30) ═══
  it('shown + capturing ⇐ البطاقة تُستبدل فورًا ببطاقة انتظارٍ جديدة، لا تتجمّد', () => {
    const { card, last } = harness()
    card.capturing(1)
    card.step(1, SHOT)
    expect(last()).toMatchObject({ n: 1, pending: false })
    // نقرة ثانية قبل ذوبان الأولى — كانت تُهمَل تمامًا فتبدو اللقطة ضائعة
    card.capturing(2)
    expect(last()).toMatchObject({ n: 2, pending: true, shot: null })
  })

  it('shown + capturing ⇐ مهلة البطاقة القديمة تُلغى فلا تُخفي الجديدة', () => {
    const { card, clock, last } = harness({ holdMs: 8000 })
    card.capturing(1)
    card.step(1, SHOT)
    clock.tick(7000) // بقي ثانية على ذوبان الأولى
    card.capturing(2)
    clock.tick(9000) // تجاوزنا موعد الأولى — ولا يجوز أن تختفي الجديدة
    expect(last()).toMatchObject({ n: 2, pending: true })
  })

  it('pending + dropped ⇐ إخفاء صادق (لا خطوة وُلدت)', () => {
    const { card, last } = harness()
    card.capturing(1)
    card.dropped()
    expect(last()).toBeNull()
  })

  it('shown + dropped ⇐ بطاقةٌ حقيقيّة معروضة لا تُطوى بإسقاط إيماءةٍ أخرى', () => {
    const { card, last } = harness()
    card.capturing(1)
    card.step(1, SHOT)
    card.dropped()
    expect(last()).toMatchObject({ n: 1, pending: false })
  })
})

describe('آلة بطاقة اللقطة — المهلة', () => {
  it('shown تذوب عند بلوغ المهلة', () => {
    const { card, clock, last } = harness({ holdMs: 8000 })
    card.capturing(1)
    card.step(1, SHOT)
    clock.tick(7999)
    expect(last()).toMatchObject({ n: 1 })
    clock.tick(8000)
    expect(last()).toBeNull()
  })

  it('المهلة المجمّدة: recording لا تُسلّح مهلةً إطلاقًا', async () => {
    const { card, clock, last } = harness({ holdMs: 8000 })
    card.capturing(1)
    card.step(1, SHOT)
    await card.mic()
    expect(clock.armed()).toBe(0)
    clock.tick(60_000) // دهرٌ كامل — البطاقة باقية لأنّ المستخدم يتكلّم
    expect(last()).toMatchObject({ recording: true })
  })

  it('إنهاء التسجيل ⇐ تُعاد المهلة من جديد كاملةً', async () => {
    const { card, clock, last } = harness({ holdMs: 8000 })
    card.capturing(1)
    card.step(1, SHOT)
    await card.mic()
    clock.tick(30_000)
    await card.mic() // إنهاء
    expect(clock.armed()).toBe(1)
    clock.tick(37_999)
    expect(last()).toMatchObject({ recording: false })
    clock.tick(38_000)
    expect(last()).toBeNull()
  })
})

describe('آلة بطاقة اللقطة — الصوت', () => {
  it('mic على shown ⇐ يبدأ التسجيل والبطاقة تعلن التسجيل', async () => {
    const { card, voice, last } = harness()
    card.capturing(1)
    card.step(1, SHOT)
    await card.mic()
    expect(voice.calls).toEqual(['start'])
    expect(last()).toMatchObject({ n: 1, recording: true })
  })

  it('فشل الميكروفون ⇐ بقاءٌ في shown بمهلةٍ مسلَّحة — تدهور معلن لا حالةُ تسجيلٍ كاذبة', async () => {
    const { card, clock, voice, last } = harness()
    card.capturing(1)
    card.step(1, SHOT)
    voice.setFailStart(true)
    await card.mic()
    expect(last()).toMatchObject({ recording: false })
    expect(clock.armed()).toBe(1)
  })

  it('إلغاء ⇐ voice.cancel لا voice.stop (لا يُحفظ مقطعٌ ملغى)', async () => {
    const { card, voice, last } = harness()
    card.capturing(1)
    card.step(1, SHOT)
    await card.mic()
    await card.cancel()
    expect(voice.calls).toEqual(['start', 'cancel'])
    expect(last()).toMatchObject({ recording: false })
  })

  // ═══ قرار المالك: حفظ تلقائيّ صامت بلا حوار ═══
  it('recording + capturing ⇐ يُحفظ التعليق لخطوته ثم تُستبدل البطاقة فورًا', async () => {
    const { card, voice, last } = harness()
    card.capturing(1)
    card.step(1, SHOT)
    await card.mic()
    await card.capturing(2)
    // الحفظ أوّلًا (للخطوة ١) ثم الاستبدال — الترتيب هو ما يمنع ضياع المقطع
    expect(voice.calls).toEqual(['start', 'stop'])
    expect(last()).toMatchObject({ n: 2, pending: true, recording: false })
  })

  it('recording + step ⇐ البكسلات تصل ولا تقطع التسجيل', async () => {
    const { card, last } = harness()
    card.capturing(1)
    card.step(1, SHOT)
    await card.mic()
    card.step(1, { src: 'data:image/jpeg;base64,bbb' })
    expect(last()).toMatchObject({ recording: true })
  })

  it('mic بلا بطاقة معروضة ⇐ لا شيء (لا تسجيل على العدم)', async () => {
    const { card, voice } = harness()
    await card.mic()
    expect(voice.calls).toEqual([])
  })

  // الوضع التلقائي («ابدأ مع تعليق صوتي») يبدأ التعليق بلا ضغطِ زرّ — والبطاقة
  // يجب أن تعلن تسجيلًا يجري فعلًا وإلّا كذبت على المستخدم
  it('syncRecording يعكس تسجيلًا بدأه غيرُها — بلا نداء صوتٍ ثانٍ', () => {
    const { card, clock, voice, last } = harness()
    card.capturing(1)
    card.step(1, SHOT)
    card.syncRecording(true)
    expect(last()).toMatchObject({ recording: true })
    expect(voice.calls).toEqual([]) // لا تبدأ ما هو بادئ
    expect(clock.armed()).toBe(0) // ولا تذوب أثناءه
  })

  it('syncRecording(false) يعيد المهلة كأيّ انتهاء تسجيل', () => {
    const { card, clock, last } = harness()
    card.capturing(1)
    card.step(1, SHOT)
    card.syncRecording(true)
    card.syncRecording(false)
    expect(last()).toMatchObject({ recording: false })
    expect(clock.armed()).toBe(1)
  })

  it('syncRecording مكرَّرًا بالقيمة نفسها ⇐ بلا إعادة رسمٍ ولا تسليحٍ ثانٍ', () => {
    const { card, clock, views } = harness()
    card.capturing(1)
    card.step(1, SHOT)
    card.syncRecording(true)
    const n = views.length
    card.syncRecording(true)
    expect(views.length).toBe(n)
    expect(clock.armed()).toBe(0)
  })
})

describe('آلة بطاقة اللقطة — بطاقة المستخدم والإسقاط', () => {
  it('بطاقةُ مستخدمٍ تفتح ⇐ البطاقة تُسلّم مكانها ولا تُطويها لاحقًا', () => {
    const { card, clock, last, views } = harness()
    card.capturing(1)
    card.step(1, SHOT)
    card.userCard()
    expect(last()).toBeNull()
    const n = views.length
    clock.tick(60_000) // مهلةٌ ملغاة: لا إخفاءَ ثانٍ يطوي بطاقة المستخدم
    expect(views.length).toBe(n)
  })

  it('بطاقةُ مستخدمٍ أثناء التسجيل ⇐ التعليق يُحفظ ولا يُترك معلّقًا', async () => {
    const { card, voice } = harness()
    card.capturing(1)
    card.step(1, SHOT)
    await card.mic()
    await card.userCard()
    expect(voice.calls).toEqual(['start', 'stop'])
  })

  it('reset يُسكت الآلة تمامًا (إنهاء الجلسة)', () => {
    const { card, clock, last, views } = harness()
    card.capturing(1)
    card.step(1, SHOT)
    card.reset()
    expect(last()).toBeNull()
    const n = views.length
    clock.tick(60_000)
    expect(views.length).toBe(n)
  })
})
