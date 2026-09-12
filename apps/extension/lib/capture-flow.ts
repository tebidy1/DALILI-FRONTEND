import type { StoredPreShot, SessionMeta, StoredStep } from './protocol'
import { CaptureThrottle, captureFailReason, foldWithPrev, guardUrl, MAX_STEPS, preShotShareable, preShotUsable, shouldDropConsequentNav, shouldMarkStep, shouldReplacePrev, CAPTURE_DEBOUNCE_MS } from './session'
import { usableRect } from './gesture'
import { blurRegions, scaleRect } from './blurl'
import { BLUR_FAIL_NOTICE } from './blurpick'
import { renumberAfterDelete } from './steps-read'
import { shotKey, stepKey } from './protocol'

/**
 * خط أنابيب الالتقاط (CAP-*) — استُخلص من background.ts بلا أي تغيير سلوك:
 * أحداث الالتقاط وتخنيقها، اللقطات المسبقة، رسم الإطار والطمس، وحذف خطوة أثناء
 * الجلسة. القوانين هنا عهود مالك لا تُلمس: قانون الاستقرار (إحداثيات على تخطيط
 * اللقطة الفعلي) وكبت تنقّل ما بعد التفاعل وجمع الكتابة المتصلة.
 */

export interface CaptureFlowDeps {
  meta: () => SessionMeta
  saveMeta: (patch: Partial<SessionMeta>) => Promise<void>
  /** كتابة عدّاد بلا تغيير — بثّ غير ضروري (مسار الاستبدال في الالتقاط) */
  saveSilently: () => Promise<void>
  readStep: (sessionId: string, i: number) => Promise<StoredStep | undefined>
  writeStep: (sessionId: string, i: number, st: StoredStep) => Promise<void>
  patchStep: (sessionId: string, i: number, patch: Partial<StoredStep>) => Promise<void>
  /** VOX-09: حذف خطوة يعيد ترقيم تعليقاتها الصوتية كالخطوات نفسها */
  renumberMemos?: (sessionId: string, deletedIndex: number, count: number) => Promise<void>
  /** VOX-AUTO: بطاقة جديدة وُلدت فعلًا (لا الاستبدال) — سياسة التعليق توقف السابق وتبدأ الجديد */
  onNewStep?: (sessionId: string, idx: number) => Promise<void>
  /** زر الجرس: بلوغ حد الخطوات — مرة واحدة عند التعليم، كي لا يضيع مع اللافتة العابرة */
  onLimitReached?: () => Promise<void>
}

export function createCaptureFlow(deps: CaptureFlowDeps) {
  const throttle = new CaptureThrottle()
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  /**
   * CAP-STABLE: لقطات الضغط المسبقة بانتظار خطواتها، مفهرسة بالتبويب. تُلتقط لحظة
   * pointerdown/Enter قبل التنقّل، فتستعملها خطوة النقرة بدل التقاط حيّ يسبقه تبدّل
   * الصفحة. عابرة في ذاكرة العامل — موته يُسقطها فيعود المسار الحيّ (تدهور آمن).
   */
  const preShots = new Map<number, StoredPreShot>()

  async function handleCaptureEvent(ev: import('./protocol').CaptureEvent, tab?: chrome.tabs.Tab) {
    const meta = deps.meta()
    if (meta.state !== 'capturing') return
    if (meta.notice) await deps.saveMeta({ notice: undefined }) // أول حدث حيّ يثبت أن الأنبوب يعمل
    const prev = meta.stepCount > 0 ? await deps.readStep(meta.sessionId, meta.stepCount - 1) : undefined
    // تنقّل تبع لتفاعل خلال نافذة الكبت → ليس خطوة: النقرة الموثّقة أعلاه كافية،
    // ولقطتها لا تحمل تحديدًا فتشوّه الدليل بشاشاتٍ لم يخترها المالك.
    if (shouldDropConsequentNav(prev, ev)) return
    // شبكة أمان «تفاعل واحد = خطوة واحدة» (بلاغ المالك 2026-09-06): نقرة التبديل
    // الخام تُهمل إن سبقها حدث قيمتها، وتُستبدل به إن تلاها — فلا خطوتان لنقرة.
    const fold = foldWithPrev(prev, ev)
    if (fold === 'drop') return
    const replace = fold === 'replace' || shouldReplacePrev(prev, ev)
    if (!replace && meta.stepCount >= MAX_STEPS) {
      if (!meta.limited) {
        await deps.saveMeta({ limited: true })
        await deps.onLimitReached?.()
      }
      return
    }
    const idx = replace ? meta.stepCount - 1 : meta.stepCount
    await deps.writeStep(meta.sessionId, idx, { ev })
    if (!replace) await deps.saveMeta({ stepCount: idx + 1 })
    else await deps.saveSilently() // عداد بلا تغيير — بث غير ضروري
    scheduleCapture(idx, ev, tab)
    // VOX-AUTO: الانتقال الصوتي بعد جدولة اللقطة — فتح الميكروفون لا يؤجل لقطة البطاقة
    if (!replace) await deps.onNewStep?.(meta.sessionId, idx)
  }

  /** الخطوة المعلّقة على مؤقّت الخنق — إن وصلت خطوة أخرى نفّذناها قبل استبدالها */
  let pendingCapture: { idx: number; ev: import('./protocol').CaptureEvent; tab?: chrome.tabs.Tab } | null = null

  /** ينفّذ الخطوة المعلّقة (إن وُجدت) ويُلغي مؤقّتها */
  function flushPending() {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    const p = pendingCapture
    pendingCapture = null
    if (p) void captureStep(p.idx, p.ev, p.tab)
  }

  function scheduleCapture(idx: number, ev: import('./protocol').CaptureEvent, tab?: chrome.tabs.Tab) {
    // علة «الكتابة لا تُحسب خطوة بلقطة»: كان مؤقّت واحد يُستبدل بأي خطوة تالية فتسقط
    // لقطة الخطوة المعلّقة (نقرة المغادرة تلغي لقطة الكتابة). الآن: خطوة مختلفة عن
    // المعلّقة تُفرّغها فورًا قبل أن تحلّ محلّها؛ والخنق يظل يجمّع تكرار **نفس** الخطوة
    // (كتابة متصلة تحلّ محلّ نفسها) فلا لقطات زائدة.
    if (pendingCapture && pendingCapture.idx !== idx) flushPending()
    pendingCapture = { idx, ev, tab }
    if (throttle.tryAcquire() === 'now') {
      flushPending()
    } else {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(flushPending, CAPTURE_DEBOUNCE_MS)
    }
  }

  /**
   * CAP-STABLE: التقاط مسبق لحظة الضغط — يلتقط الصفحة الحالية المرسومة قبل أن يبدّلها
   * النقر. يخضع لخنق كروم نفسه (2/ثانية) المشترك مع لقطات الخطوات فلا يتجاوز الحد؛
   * إن رُفض بالخنق سقطت الخطوة للمسار الحيّ. الفشل يُبتلع بصمت — بديله الالتقاط الحيّ.
   */
  async function handlePreShot(pre: { ts: number; url: string; rect: { x: number; y: number; w: number; h: number }; dpr: number }, tab?: chrome.tabs.Tab) {
    const meta = deps.meta()
    if (meta.state !== 'capturing') return
    if (tab?.id === undefined || tab.windowId === undefined) return
    if (!guardUrl(pre.url).ok) return
    if (throttle.tryAcquire() !== 'now') return // الخنق سبق — النقرة ستلتقط حيًّا
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 80 })
      preShots.set(tab.id, { ts: pre.ts, url: pre.url, dataUrl, rect: pre.rect, dpr: pre.dpr })
    } catch {
      // فشل الالتقاط المسبق — لا ضير؛ خطوة النقرة تلتقط حيًّا
    }
  }

  /**
   * CAP-STABLE: هل تنقّل التبويب عن رابط الحدث؟ الإطار من مستطيل لحظة النقر يصلح
   * فقط ما دامت الصفحة الملتقَطة هي صفحة الحدث. تعذُّر التحقق يُبقي السلوك القديم
   * (لا نمنع إطارًا لعجزٍ في القراءة).
   */
  async function tabNavigatedAway(tab: chrome.tabs.Tab | undefined, eventUrl: string): Promise<boolean> {
    if (tab?.id === undefined) return false
    try {
      const cur = await chrome.tabs.get(tab.id)
      return typeof cur.url === 'string' && cur.url !== eventUrl
    } catch {
      return false
    }
  }

  /**
   * لقطة حيّة للتبويب مع **احترام حدّ كروم واحتساب المحاولة**. كان المسار
   * المؤجّل يلتقط بلا ختم فيخترق الحدّ (٢/ثانية) فترمي `captureVisibleTab`
   * ويصير `missingReason` — أي «خطوة بشاشة فارغة». الآن: الختم يتقدّم مع كل
   * لقطة، والرفض بالحصة يُعاد مرة واحدة بعد انتظار الفاصل المتبقّي (زائد هامش).
   */
  async function captureLive(tab: chrome.tabs.Tab | undefined): Promise<string> {
    const opts = { format: 'jpeg' as const, quality: 80 }
    const shoot = () =>
      tab?.windowId !== undefined
        ? chrome.tabs.captureVisibleTab(tab.windowId, opts)
        : chrome.tabs.captureVisibleTab(opts)
    try {
      throttle.stamp()
      return await shoot()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!/quota|MAX_CAPTURE/i.test(msg)) throw err
      // تباطؤ لحظي لا عطب: انتظر ما تبقّى من الفاصل ثم أعد المحاولة مرة واحدة
      await new Promise((r) => setTimeout(r, throttle.waitMs() + 60))
      throttle.stamp()
      return await shoot()
    }
  }

  async function captureStep(idx: number, ev: import('./protocol').CaptureEvent, tab?: chrome.tabs.Tab) {
    const sessionId = deps.meta().sessionId
    const guard = guardUrl(ev.url)
    if (!guard.ok) {
      await deps.patchStep(sessionId, idx, { missingReason: guard.reason })
      return
    }
    let markPx: { x: number; y: number; w: number; h: number } | undefined
    try {
      // CAP-STABLE: لقطة الضغط المسبقة — بكسلها من صفحة ما قبل التنقّل المرسومة.
      //  • primaryPre: تخصّ هذا الحدث بختمها (نقرة/Enter) → صورتها ومستطيلها.
      //  • sharePre: خطوة الكتابة تشارك لقطة نقرة المغادرة (نفس الإطار) فتظهر بلقطةٍ
      //    تُبرز النص المكتوب، وترسم إطارها بمستطيل حقلها هي (ev.rect وقت المغادرة).
      // لا نحذفها: قد تتشاركها خطوتان من تفاعلٍ واحد (كتابة + نقرة)؛ تُستبدل بأحدث،
      // أو تسقط بالعمر/ببدء الجلسة.
      const now = Date.now()
      const pre = tab?.id !== undefined ? preShots.get(tab.id) : undefined
      const primaryPre = !!pre && preShotUsable(pre, ev, now)
      const sharePre = !primaryPre && !!pre && preShotShareable(pre, ev, now)
      const usePre = primaryPre || sharePre

      // قانون الاستقرار — جولة واحدة لسكربت المحتوى تُعيد مستطيل العلامة الطازج (نفس
      // العنصر إن طابق ختم الحدث وما زال متصلًا) وdpr اللحظي ومستطيلات الطمس اليدوي،
      // فيُقاس على تخطيط اللقطة الحيّة لا تخطيط لحظة النقر.
      let freshMark: { rect: { x: number; y: number; w: number; h: number }; dpr: number } | undefined
      let manualRects: Array<{ x: number; y: number; w: number; h: number }> = []
      if (tab?.id !== undefined) {
        try {
          const res = (await chrome.tabs.sendMessage(tab.id, { t: 'get-blur-rects', markTs: ev.ts })) as
            | { rects?: Array<{ x: number; y: number; w: number; h: number }>; mark?: { x: number; y: number; w: number; h: number }; dpr?: number }
            | undefined
          if (res?.rects && res.rects.length > 0) manualRects = res.rects
          if (res?.mark) freshMark = { rect: res.mark, dpr: typeof res.dpr === 'number' ? res.dpr : ev.dpr }
        } catch {
          // تبويب يتيم بلا سكربت محتوى — المستطيل المخزّن يكفي، والطمس اليدوي يسقط فقط
        }
      }

      // اللقطة: المسبقة (صفحة ما قبل التنقّل، مضمونة الرسم) وإلا حيّة الآن.
      let dataUrl: string = usePre ? pre!.dataUrl : await captureLive(tab)
      let autoBlurred = false

      // القاعدة الصارمة للإطار (علة الإطار المنزاح/فوق شاشة فارغة، ~30%): لا يُرسم
      // إطار إلا من قياس يخصّ **الإطار الملتقَط فعلًا**:
      //  (١) اللقطة المسبقة: مستطيلها من نفس لحظة/صفحة بكسلها — الأدقّ.
      //  (٢) وإلا الطازج: العنصر ما يزال متصلًا على الصفحة الحيّة الملتقَطة.
      //  (٣) وإلا مستطيل لحظة النقر — لكن فقط إن **لم تتنقّل** الصفحة؛ رسمه فوق صفحة
      //      أخرى/بيضاء هو بعينه العلة، فالتنقّل يُسقط الإطار (صدق بلا إطار خاطئ).
      let markSrc: { rect: { x: number; y: number; w: number; h: number }; dpr: number } | undefined
      if (primaryPre) markSrc = { rect: pre!.rect, dpr: pre!.dpr }
      else if (sharePre) markSrc = ev.rect ? { rect: ev.rect, dpr: ev.dpr } : undefined
      else if (freshMark) markSrc = freshMark
      else if (ev.rect && !(await tabNavigatedAway(tab, ev.url))) markSrc = { rect: ev.rect, dpr: ev.dpr }
      // (٤) وأيًّا كان المصدر: مستطيل ضامر ليس إطارًا. الحقل المخفيّ يقاس {-2,-2,2,2}
      //     فكان يُخزَّن إطارًا ٢×٢ خارج اللقطة (١٢ حالة في قاعدة المالك) — والصدق
      //     بلا إطار خير من إطارٍ على العدم.
      if (markSrc && !usableRect(markSrc.rect)) markSrc = undefined

      if (ev.sensitive && markSrc) {
        try {
          dataUrl = await blurRegions(dataUrl, [scaleRect(markSrc.rect, markSrc.dpr)])
          autoBlurred = true
        } catch {
          // فشل التطمس: الخطوة تبقى حساسة وتراجع يدويًا في المحرر — فشل صادق
        }
      } else if (shouldMarkStep(ev) && markSrc) {
        // الكتابة والاختيار والتبديل وEnter تُعلَّم كالنقر — لم يعد النقر وحده
        // ANNO-02: لم نعد نحرق الإطار في البكسل (markRect) — نخزّن مستطيله بيانات
        // فيرسمه المحرر حيًّا ويقبل التحريك وتغيير اللون والتبؤير عليه.
        markPx = scaleRect(markSrc.rect, markSrc.dpr)
      }
      // CAP-13: طمس يدوي — مستطيلاته بCSS px من الصفحة الحيّة، تُقاس بدقّتها اللحظية
      if (manualRects.length > 0) {
        const manualDpr = freshMark?.dpr ?? ev.dpr
        try {
          dataUrl = await blurRegions(dataUrl, manualRects.map((r) => scaleRect(r, manualDpr)))
          autoBlurred = true
        } catch {
          if (!deps.meta().notice) await deps.saveMeta({ notice: BLUR_FAIL_NOTICE })
        }
      }
      await chrome.storage.local.set({ [shotKey(sessionId, idx)]: dataUrl })
      await deps.patchStep(sessionId, idx, { autoBlurred, mark: markPx })
    } catch (err) {
      await deps.patchStep(sessionId, idx, { missingReason: captureFailReason(err) })
    } finally {
      // نجاحًا أو فشلًا: حلقة التأشير تعود للصفحة فورًا — لا تنتظر مؤقّت أمانها
      if (tab?.id !== undefined) {
        await chrome.tabs.sendMessage(tab.id, { t: 'capture-done' }).catch(() => {})
      }
    }
  }

  /** حذف خطوة أثناء الالتقاط: تُزال ثم تُعاد ترقيم ما بعدها (خطوة + لقطتها + صوتها) */
  async function deleteStep(index: number) {
    const meta = deps.meta()
    if (meta.state !== 'capturing' && meta.state !== 'paused') return
    if (index < 0 || index >= meta.stepCount) return
    const sid = meta.sessionId
    const count = meta.stepCount
    const stepsMap = new Map<number, StoredStep>()
    const shotsMap = new Map<number, string>()
    for (let i = 0; i < count; i++) {
      const st = await deps.readStep(sid, i)
      if (st) stepsMap.set(i, st)
      const sk = shotKey(sid, i)
      const shot = (await chrome.storage.local.get(sk))[sk]
      if (typeof shot === 'string') shotsMap.set(i, shot)
    }
    const newSteps = renumberAfterDelete(stepsMap, index, count)
    const newShots = renumberAfterDelete(shotsMap, index, count)
    // VOX-09: صوت الخطوات يعيد ترقيمه كالخطوات نفسها
    await deps.renumberMemos?.(sid, index, count)
    const removeKeys: string[] = []
    for (let i = 0; i < count; i++) removeKeys.push(stepKey(sid, i), shotKey(sid, i))
    await chrome.storage.local.remove(removeKeys)
    const writes: Record<string, unknown> = {}
    newSteps.forEach((v, i) => (writes[stepKey(sid, i)] = v))
    newShots.forEach((v, i) => (writes[shotKey(sid, i)] = v))
    if (Object.keys(writes).length > 0) await chrome.storage.local.set(writes)
    await deps.saveMeta({ stepCount: count - 1, limited: false })
  }

  return { handleCaptureEvent, handlePreShot, deleteStep, resetPreShots: () => preShots.clear() }
}
