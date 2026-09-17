/**
 * جلسة التسجيل (٣ج-٢) — الطرف الذي *يفهم*: يصل أحداث المستشعرات (٣ب) بالنواة
 * (٣ت) ويصوّغ دليل v2 في الذاكرة. **بلا شبكة إطلاقًا** (النقل كلّه ٣د) و**بلا
 * `Date.now` ولا `setTimeout`** في منطق الجلسة: الساعة والمجدول من `TickEvt`
 * (qpcMs) حصرًا — مؤقّتات WebView المخفيّة تُخنَق فلا يُؤمَن عليها (خطّة ٣ج §٧).
 *
 * الحدود محقونة (`Bridge`) كي تُختبَر الجلسة بمزيّفات بلا Tauri؛ مغلّف الإنتاج
 * `bridge.ts` سطور توصيل بلا منطق. المبدأ الحاكم: لا تُعِد بناء ما بنته النواة —
 * التحويلات من `@dalili/core` (factsToElInfo/factsToStepSource/desktopStepKind/
 * desktopShotPolicy/buildAnchorChain/assembleGuide) والعلامة من mark-box.
 */
import {
  assembleGuide,
  buildAnchorChain,
  createGesturePacer,
  DEFAULT_MARK_COLOR,
  desktopShotPolicy,
  desktopStepKind,
  factsToElInfo,
  factsToStepSource,
  isSensitiveField,
  markBoxRect,
  type DesktopFacts,
  type Guide,
  type RawStep,
  type ScreenshotMeta,
  type TargetMark,
} from '@dalili/core'

// ───────────────── العقد: توأم TS لردّ frame_pick (events.rs §٣.٣) ─────────────────

export interface FramePicked {
  localId: string
  path: string
  qpcMs: number
  /** فرق ختم الإطار عن ختم النقرة (سالب = قبل) */
  deltaMs: number
  monitor: { x: number; y: number; w: number; h: number; dpi: number }
}

export type FramePickResult =
  | FramePicked
  | { missing: 'protected' | 'no_frame' | 'elevated' }

/** الحدود المحقونة — الإنتاج يمرّر listen/invoke الحقيقيّين (bridge.ts) */
export interface Bridge {
  listen(
    evt: 'sensor://input' | 'sensor://facts' | 'sensor://tick',
    cb: (p: unknown) => void,
  ): () => void
  invoke(cmd: 'frame_pick', args: { seq: number; which: 'before' | 'after' }): Promise<FramePickResult>
  /** القيمة النهائيّة للحقل بعد انتهاء الكتابة — الأمر `facts_refresh` من عقد
   *  §٣.٣ (‏BuildUpdatedCache في ٣ب-٤). بوّابة السرّ في Rust نفسه: حسّاس ⇐ بلا قيمة */
  factsRefresh(seq: number): Promise<DesktopFacts | { seq: number; error: string } | null>
  /** حرق التمويه على الجهاز (٣ج-٤) — الأمر `frame_blur`: مستطيلات ببكسل الصورة
   *  تُملأ بمتوسّطها الصندوقيّ في ملفّ الإطار المؤقّت. بكسلات الحقل الحسّاس
   *  لا تغادر الجهاز قطّ */
  frameBlur(
    localId: string,
    rects: Array<{ x: number; y: number; w: number; h: number }>,
  ): Promise<void>
}

export interface RecorderSession {
  /** تجميد التقاط الإيماءات (٣هـ-٢) — سياسة TS: ‏sensor://input يُتجاهَل حتى
   *  ‏resume (النقر/المفاتيح لا تبني خطوات)، وtick يظلّ يجري للساعة والمجدول.
   *  ‏recording_pause في Rust يبقى no-op موثَّقًا لا يُتّكأ عليه */
  pause(): void
  /** إلغاء التجميد — الجمع يعود */
  resume(): void
  /** إغلاق الإيماءة المعلّقة ثم تجميع الدليل من الذاكرة */
  stop(): Promise<Guide>
  /** عدد الخطوات المجمَّعة حتى الآن */
  stepCount(): number
  /** ينتظر خمول البناء — مساعد الانتظار للاختبارات وبثّ الإيقاف المنظّم */
  whenIdle(): Promise<void>
}

// ───────────────── حرس الحمولات — بنية السلك لا أكثر ─────────────────

interface InputWire {
  seq: number
  qpcMs: number
  kind: 'down' | 'up' | 'key'
  keyClass?: string | null
  /** إحداثيّا الضغط الفيزيائيّان العالميّان (عقد ٣ب §٣.٢) — لبوّابة استثناء الودجة */
  x?: number
  y?: number
}

function asInput(p: unknown): InputWire | null {
  if (typeof p !== 'object' || p === null) return null
  const v = p as Record<string, unknown>
  if (typeof v.seq !== 'number' || typeof v.qpcMs !== 'number') return null
  if (v.kind !== 'down' && v.kind !== 'up' && v.kind !== 'key') return null
  return {
    seq: v.seq,
    qpcMs: v.qpcMs,
    kind: v.kind,
    keyClass: typeof v.keyClass === 'string' ? v.keyClass : null,
    x: typeof v.x === 'number' ? v.x : undefined,
    y: typeof v.y === 'number' ? v.y : undefined,
  }
}

function asTick(p: unknown): number | null {
  if (typeof p !== 'object' || p === null) return null
  const v = p as Record<string, unknown>
  return typeof v.qpcMs === 'number' ? v.qpcMs : null
}

function asFacts(p: unknown): DesktopFacts | { seq: number; error: string } | null {
  if (typeof p !== 'object' || p === null) return null
  const v = p as Record<string, unknown>
  if (typeof v.seq !== 'number') return null
  if (typeof v.error === 'string') return { seq: v.seq, error: v.error }
  if (typeof v.element === 'object' && v.element !== null && typeof v.window === 'object') {
    return v as unknown as DesktopFacts
  }
  return null
}

/** أسباب الغياب بالعربيّ — القيم من عقد ٣ب، والصياغة قرار ٣ج-٢ (تُراجَع في ٣و) */
const MISSING_REASONS: Record<string, string> = {
  protected: 'نافذة محميّة',
  elevated: 'نافذة مرفوعة الصلاحيّة',
  no_frame: 'تعذّر الالتقاط',
}

// ───────────────── الجلسة ─────────────────

interface GestureItem {
  t: 'click' | 'key'
  seq: number
  qpcMs: number
  keyClass?: string
}

/** خيارات الجلسة المحقونة */
export interface SessionOptions {
  /** استثناء نقرات الودجة نفسها (إصلاح برهان المالك): الخطّاف الشامل يرى نقرات
   *  الودجة ذاتها، وهي أحداثُ واجهةٍ لا عملَ مستخدم. down بإحداثيّين فيزيائيّين
   *  داخل نافذة الودجة ⇒ يُتجاهَل قبل فتح الإيماءة فلا خطوة ولا فتح نافذة.
   *  غيابه ⇒ السلوك القائم بلا فلتر (الاختبارات والجلسات الأخرى) */
  ignorePoint?: (x: number, y: number) => boolean
}

export function createRecorderSession(bridge: Bridge, opts: SessionOptions = {}): RecorderSession {
  // الساعة: آخر qpcMs وصل من TickEvt — مصدر الزمن الوحيد في الجلسة
  let lastTickQpcMs = 0
  // المجدول المدفوع بالـtick: مواعيد تُفحَص عند كل نبضة لا مؤقّت نظام
  let pending: Array<{ fn: () => void; deadline: number }> = []
  const schedule = (fn: () => void, ms: number): (() => void) => {
    const entry = { fn, deadline: lastTickQpcMs + ms }
    pending.push(entry)
    return () => {
      pending = pending.filter((e) => e !== entry)
    }
  }

  const buffer: RawStep[] = []
  /** سجلّ الحقائق القابل للانتظار — إصلاح سباق تدقيق ٣ج-٢: حقائق UIA تصل غالبًا
   *  **بعد** نافذة الـ٦٠مث (٣ب-٦: وسيط 62.6مث · p95 189مث) فقراءتها مرةً واحدة
   *  عند الإغلاق كانت تُسقط خطوات بصمت. الآن تُنتظَر بمهلة ٣ب (250مث) على ساعة
   *  TickEvt نفسها، ثم إسقاط صادق إن غابت */
  const FACTS_WAIT_MS = 250
  interface FactsWaiter {
    facts?: DesktopFacts
    error?: string
    resolvers: Array<(r: { facts?: DesktopFacts; error?: string } | null) => void>
  }
  const factsWaiters = new Map<number, FactsWaiter>()
  const waiterFor = (seq: number): FactsWaiter => {
    let w = factsWaiters.get(seq)
    if (!w) {
      w = { resolvers: [] }
      factsWaiters.set(seq, w)
    }
    return w
  }
  /** ينتظر حقائق الـseq حتى وصولها أو انقضاء مهلة ٣ب على ساعة Tickevt — null ⇐ مهلت */
  const waitForFacts = (seq: number): Promise<{ facts?: DesktopFacts; error?: string } | null> => {
    const w = waiterFor(seq)
    if (w.facts || w.error) return Promise.resolve(w)
    return new Promise((resolve) => {
      let settled = false
      const done = (r: { facts?: DesktopFacts; error?: string } | null) => {
        if (settled) return
        settled = true
        cancel()
        resolve(r)
      }
      const cancel = schedule(() => done(null), FACTS_WAIT_MS)
      w.resolvers.push((r) => done(r))
    })
  }
  let inflight = 0
  let idleResolvers: Array<() => void> = []
  let windowOpen = false
  // عَلَم الإيقاف المؤقّت (٣هـ-٢): يبوّب sensor://input حصرًا — الساعة/الحقائق تجريان
  let paused = false
  // هوية آخر نافذة بنت لها خطوة (hwnd+appId) — تغيّرها ⇐ خطوة navigate مُدرَجة
  let lastWindowKey: string | null = null

  const whenIdle = (): Promise<void> => {
    if (inflight === 0) return Promise.resolve()
    return new Promise((resolve) => idleResolvers.push(resolve))
  }

  // المِضخّة — نافذتا الصمت/السقف من النواة والساعة من TickEvt
  /** سلسلة بناء متسلسلة: الإيماءات تُبنى بترتيب إغلاقها لا بترتيب إتمام awaitsها.
   *  كشفه قبول ٣ج-٣: البناء المتوازي رتّب المخزن بإتمام الوعود (refresh أبطأ من
   *  pick قلبا الترتيب) وجعل خطوةٍ تقرأ lastWindowKey قبل أن يثبّتها بناء سابق
   *  ففقدت navigate — فالتسلسل شرط الترتيب وكشف تبديل النافذة معًا */
  let buildChain: Promise<void> = Promise.resolve()
  const pacer = createGesturePacer<GestureItem>({
    collectMs: 60,
    maxMs: 400,
    now: () => lastTickQpcMs,
    schedule,
    onFlush: (items) => {
      windowOpen = false
      inflight++
      buildChain = buildChain
        .then(() => buildStep(items))
        .catch((e: unknown) => console.error('[session] buildStep:', e))
        .finally(() => {
          inflight--
          if (inflight === 0) {
            const resolvers = idleResolvers
            idleResolvers = []
            for (const r of resolvers) r()
          }
        })
    },
  })

  /** بناء خطوة واحدة من إيماءة مُغلَقة — يُستدعى حصرًا عبر السلسلة المتسلسلة */
  async function buildStep(items: GestureItem[]): Promise<void> {
    const click = items.find((i) => i.t === 'click')
    if (!click) return // نوافذ تُفتح بضغطة حصرًا — نظريًّا لا يحدث
    // إصلاح السباق: انتظار عادل للحقائق المتأخّرة (حتى 250مث على ساعة TickEvt)
    // قبل أيّ إسقاط — القرار الموثَّق «إسقاط غير الناجح» يبقى لكن بعد الانتظار
    const waited = await waitForFacts(click.seq)
    factsWaiters.delete(click.seq) // تقليم السجل أيًّا كانت النتيجة
    // قرار موثَّق (يُراجَع في ٣و): حقائق خطأ أو غياب حتى المهلة ⇐ إسقاط صادق
    // بدل خطوة أعمى بلا مرساة ولا هويّة
    if (!waited || waited.error || !waited.facts) return
    const facts = waited.facts
    const keys = items.filter((i) => i.t === 'key').map((i) => i.keyClass ?? 'other')
    const gesture = { clicks: 1, keys }
    const ts = click.qpcMs
    const source = factsToStepSource(facts)

    const steps: RawStep[] = []
    // كشف تبديل النافذة: hwnd/appId مختلفان عن آخر خطوة ⇐ navigate مُدرَجة قبلها
    const wkey = `${facts.window.hwnd}|${facts.window.appId}`
    if (lastWindowKey !== null && lastWindowKey !== wkey) {
      steps.push({ kind: 'navigate', source, ts })
    }

      const elInfo = factsToElInfo(facts)
      // الحسّاسية بشرطَي النواة (٣ج-٤): بوّابة isPassword من ٣ب + كشف mask
      // الاسميّ (isSensitiveField على الاسم/automationId/className) — قرارُها
      // واحدٌ يشمل صمتَ القيمة وحرقَ اللقطة (توثيق mask نفسه: «قبل تخزين أي قيمة»)
      const sensitive =
        facts.element.isPassword ||
        isSensitiveField({
          name: facts.element.name,
          id: facts.element.automationId,
          placeholder: facts.element.className,
        })
      const which = desktopShotPolicy(facts.element.controlType)
      const pick = await bridge.invoke('frame_pick', { seq: click.seq, which })
      let screenshot: RawStep['screenshot']
      if ('missing' in pick) {
        screenshot = { missing: true, reason: MISSING_REASONS[pick.missing] ?? 'تعذّر الالتقاط' }
      } else {
        const meta = buildScreenshot(pick, facts)
        // حرق الحسّاس على الجهاز (٣ج-٤) — قبل أيّ تسليم لاحق للطابور (٣د):
        // مستطيل العنصر ببكسل الصورة يحرق في ملفّ الإطار المؤقّت ويسجَّل في
        // blurRects (إحداثيات الصورة الطبيعية بعقد ScreenshotMeta) مع autoBlurred.
        // فشل الحرق ⇐ اللقطة تُسقَط كليًّا: لا بكسل حسّاس يغادر ولا blurRects تكذب
        if (sensitive) {
          const r = imageRectOf(facts.element.rect, pick.monitor)
          try {
            await bridge.frameBlur(pick.localId, [r])
            screenshot = { ...meta, blurRects: [r], autoBlurred: true }
          } catch (e) {
            console.error('[session] frameBlur:', e)
            screenshot = {
              missing: true,
              reason: 'تعذّر حرق الحقل الحسّاس — أُسقِطت اللقطة حمايةً للسرّ',
            }
          }
        } else {
          screenshot = meta
        }
      }

    const kind = desktopStepKind(facts, gesture)
    // مُتابَعة تدقيق ٣ج-٢: قيمة الحقائق وقتَ النقرة سبقت الكتابة — إيماءة
    // إدخال غير حسّاسة ⇐ تُقرأ قيمتها النهائيّة عبر facts_refresh. بوّابة
    // السرّ باقية: حسّاس ⇐ لا نداء ولا قيمة مهما عادت (حارس مزدوج مع Rust)
    let value = sensitive ? undefined : facts.element.value
    if (kind === 'input' && !sensitive) {
      const fresh = await bridge.factsRefresh(click.seq)
      if (fresh && !('error' in fresh) && !fresh.element.isPassword && fresh.element.value !== undefined) {
        value = fresh.element.value
      }
    }

    steps.push({
      kind,
      target: {
        text: elInfo.text,
        role: facts.element.controlType,
        label: facts.element.name,
        anchor: buildAnchorChain(elInfo).slice(0, 6),
      },
      value,
      sensitive,
      source,
      ts,
      screenshot,
    })
    buffer.push(...steps)
    lastWindowKey = wkey
  }

  /** مستطيل العنصر الفيزيائي → بكسل الصورة (طرح أصل الشاشة) — مشترك بين
   *  علامة الإبراز وحرق التمويه */
  function imageRectOf(
    r: DesktopFacts['element']['rect'],
    m: FramePicked['monitor'],
  ): { x: number; y: number; w: number; h: number } {
    return {
      x: Math.round(r.x - m.x),
      y: Math.round(r.y - m.y),
      w: Math.round(r.w),
      h: Math.round(r.h),
    }
  }

  /** لقطة ناجحة ‏Picked ⇐ ‏ScreenshotMeta بعلامة إبراز محوَّلة من الفيزيائي إلى
   *  بكسل الصورة (طرح أصل الشاشة) وصلاحيّتها من mark-box. غيابُ الإطار يُعالَج
   *  عند النداء (Missing ⇐ سبب عربيّ) — وهنا الناجح وحده. الحرق نفسه (٣ج-٤). */
  function buildScreenshot(pick: FramePicked, facts: DesktopFacts): ScreenshotMeta {
    const r = imageRectOf(facts.element.rect, pick.monitor)
    // الصلاحيّة من النواة (mark-box): مستطيل منحلّ أو خارج الصورة ⇐ بلا علامة بصدق
    const valid = markBoxRect(r, pick.monitor.w, pick.monitor.h) !== null
    const mark: TargetMark | undefined = valid ? { rect: r, color: DEFAULT_MARK_COLOR } : undefined
    return {
      fileId: pick.localId,
      blurRects: [],
      ...(mark ? { mark } : {}),
    }
  }

  bridge.listen('sensor://tick', (p) => {
    const qpcMs = asTick(p)
    if (qpcMs === null) return
    lastTickQpcMs = qpcMs
    const due = pending.filter((e) => lastTickQpcMs >= e.deadline)
    pending = pending.filter((e) => lastTickQpcMs < e.deadline)
    for (const e of due) e.fn()
  })

  bridge.listen('sensor://input', (p) => {
    const evt = asInput(p)
    if (!evt) return
    // الإيقاف المؤقّت (٣هـ-٢): الضغط والمفاتيح لا يبنيان خطوات — الحقائق والنبض يجريان
    if (paused) return
    if (evt.kind === 'down') {
      // استثناء الودجة نفسها أولًا — نقرات أزرارها لا تفتح إيماءة
      if (
        opts.ignorePoint &&
        typeof evt.x === 'number' &&
        typeof evt.y === 'number' &&
        opts.ignorePoint(evt.x, evt.y)
      ) {
        return
      }
      // كل ضغطة نافذة جديدة (خطوة مستقلّة) — الكتابة اللاحقة تنضم لنافذتها
      pacer.open()
      windowOpen = true
      pacer.add({ t: 'click', seq: evt.seq, qpcMs: evt.qpcMs })
    } else if (evt.kind === 'key' && windowOpen) {
      // التصنيف من keyClass وحده — لا حرف يُخزَّن أبدًا
      pacer.add({ t: 'key', seq: evt.seq, qpcMs: evt.qpcMs, keyClass: evt.keyClass ?? 'other' })
    }
    // الإفلات (up) ضجيج بلا قيمة — قرار ٣ب-٢ نفسه
  })

  bridge.listen('sensor://facts', (p) => {
    const facts = asFacts(p)
    if (!facts) return
    // يقظ الحقائق: من في انتظار هذا الـseq يُوقَظ فورًا (إصلاح سباق ٣ج-٢).
    // ملاحظة إصلاح الودجة: حقائق النقرات المستثناة تُخزَّن هنا بلا قارئ —
    // خانتها تموت مع الجلسة (متغيّر إغلاق) فلا تراكم ولا تشويش لاحق.
    // يحرّم إنشاء الخانة هنا يكسر سباق الحقائق المتقدّمة كلّه (قياس فشل 16 اختبارًا)
    const w = waiterFor(facts.seq)
    if ('error' in facts) w.error = facts.error
    else w.facts = facts
    const resolvers = w.resolvers
    w.resolvers = []
    for (const r of resolvers) r({ facts: w.facts, error: w.error })
  })

  return {
    pause: () => {
      paused = true
    },
    resume: () => {
      paused = false
    },
    async stop(): Promise<Guide> {
      pacer.flush()
      await whenIdle()
      return assembleGuide(buffer)
    },
    stepCount: () => buffer.length,
    whenIdle,
  }
}
