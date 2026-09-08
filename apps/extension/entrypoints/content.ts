import { defineContentScript } from 'wxt/utils/define-content-script'
import { META_KEY, type CaptureEvent, type SessionMeta, type ToTabMsg } from '@/lib/protocol'
import {
  buildClickEvent,
  buildNavEvent,
  buildValueEvent,
  extractLabel,
  pathIncludesController,
  rectAfterSettle,
  retargetEvent,
  viewportRect,
  visualControl,
} from '@/lib/events'
import { createGestureCollector, type FoldedGesture } from '@/lib/gesture'
import { pickInteractive } from '@/lib/pick'
import { anchorOf } from '@/lib/anchor-of'
import { createTrainMode, type TrainMode } from '@/lib/train-mode'
import { shouldEmitNav } from '@/lib/session'
import { pickBlurTarget } from '@/lib/blurpick'
import { createOverlay } from '@/lib/overlay'
import { WEB_BASE } from '@/lib/config'

/** مهلة استقرار النقرة: إعادة ترتيب SPA تتم خلالها فتُقاس العلامة على التخطيط الذي ستلتقطه اللقطة فعلًا */
const CLICK_SETTLE_MS = 160

/** أصل الويب المسموح له طلب بدء إضافة خطوات (CAP-17) — محرر دليلي نفسه */
const WEB_ORIGIN = new URL(WEB_BASE).origin

/**
 * سكربت المحتوى: خامل حتى جلسة نشطة.
 * كل شيء بالأحداث — لا حلقات rAF ولا polling إطلاقًا (قانون لا تعليق أبدًا).
 * أزرار التحكم تعيش في اللوحة الجانبية؛ هذا السكربت يلتقط الأحداث ويعرض
 * طبقة داخل الصفحة (شريط الحالة + حلقة التأشير). مستمعو الأحداث أثناء الالتقاط فقط.
 */
export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    let listenersOn = false
    let historyWrapped = false
    let lastUrl = location.href
    let lastNavUrl = '' // آخر رابط بُث كتنقل من هذا التبويب — لإزالة التكرار
    const overlay = createOverlay()
    overlay.mount()

    /** آخر عنصر تفاعلي نُقر/كُتب فيه + ختم حدثه — تعاد مستطيلاته لحظة الالتقاط
     *  فيوضع الإطار على موضعه الصحيح حتى لو تمرّرت الصفحة أو انزاح تخطيطها بعد النقر. */
    let lastMark: { el: Element; ts: number } | null = null
    function rememberMark(el: Element, ts: number) {
      lastMark = { el, ts }
    }

    /** الهدف الحقيقي عبر حدود shadow DOM للصفحة — e.target يُعاد توجيهه لمضيف الجذر فيفقد الدقة */
    function composedTarget(e: Event): Element | null {
      const first = e.composedPath()[0]
      return first instanceof Element ? first : null
    }

    /** CAP-13: عناصر الطمس اليدوي — تُقاس مستطيلاتها لحظة كل لقطة (قانون الاستقرار) لا لحظة السحب */
    const blurEls: Element[] = []
    overlay.onBlurDraw((rect) => {
      // عناصر نقطة المركز خارج طبقتنا المعزولة (Shadow DOM) — لا نطمس ستارنا ourselves
      const candidates = document
        .elementsFromPoint(rect.x + rect.w / 2, rect.y + rect.h / 2)
        .filter((el) => !(el.getRootNode() instanceof ShadowRoot))
      const target = pickBlurTarget(candidates, rect)
      if (target) {
        blurEls.push(target)
        overlay.showBlurCount(blurEls.length)
        overlay.blurHint('أُضيفت منطقة الطمس — تُطبَّق على كل لقطة قادمة')
      } else {
        overlay.blurHint('اسحب فوق عنصر يحتوي البيانات الحساسة (وليس فراغًا)')
      }
    })

    const dpr = () => window.devicePixelRatio || 1

    function send(ev: CaptureEvent) {
      chrome.runtime.sendMessage({ t: 'capture-event', ev }).catch(() => {})
    }

    /** ختم آخر لقطة ضغطٍ طُلبت — يُلصَق بحدث النقرة/Enter التالي فيربطهما ١:١ */
    let lastPreShotTs: number | null = null

    /**
     * **الإيماءة المفتوحة** — علاج علة «الخطوة تُلتقط مرتين أو ثلاثًا» من جذرها
     * (بلاغ المالك 2026-09-06 على الدليل MtKW5SLkbdRs).
     *
     * كان `click` و`change` مستمعَين مستقلَّين، فكل حدث DOM يصير خطوة. لكن المتصفح
     * يرسل لضغطة إنسان **واحدة** على زر تبديل حتى ثلاثة أحداث خلال مليّثانيات
     * (قياس حيّ في كروم على ستة أنماط — التفصيل في `lib/gesture.ts`). الشاهد في
     * قاعدة المالك: الخطوتان ١ و٢ بمرساةٍ واحدة، والخطوات ٩ و١٠ و١١ من نقرة واحدة.
     *
     * الآن: كل أحداث الضغطة تُجمع هنا ثم تُطوى **خطوة واحدة** على المفتاح المرئي.
     * وهذا يغلق أيضًا انقلاب الترتيب: كانت النقرة تتأخّر ١٦٠مث بينما `change`
     * يُرسل فورًا، فتُخزَّن خطوة التبديل **قبل** نقرتها رغم أن ختمها أحدث.
     */
    const gesture = createGestureCollector(emitGestureStep)

    /**
     * خطوة الإيماءة الواحدة بعد طيّها. **قانون الاستقرار محفوظ:** المستطيل يُقاس بعد
     * مهلة الاستقرار على العنصر الناجي، لا لحظة الحدث. ومسار الالتقاط القديم يبقى
     * حرفيًا حين لا انزياح (`el === source`): المرساة المبنيّة لحظة الحدث كما هي،
     * ولا يُعاد بناؤها إلا إذا كان الحدث على حقلٍ مخفيّ ومفتاحه المرئي غيره.
     */
    function emitGestureStep(folded: FoldedGesture) {
      rememberMark(folded.el, folded.ev.ts)
      rectAfterSettle(folded.el, CLICK_SETTLE_MS, (settled) => {
        if (!settled) return send(folded.ev) // العنصر استُبدل (React أعاد بناءه) — مستطيل لحظة الحدث احتياطًا
        send(folded.el === folded.source ? { ...folded.ev, rect: settled } : retargetEvent(folded.ev, folded.el))
      })
    }

    /**
     * CAP-STABLE: يطلب لقطة مسبقة لعنصر ما زال حيًّا على الصفحة الحالية المرسومة.
     * تُرسل لحظة الضغط (قبل أي تنقّل) فتلتقط الخلفية البكسل الصحيح، ويُخزَّن مستطيله
     * ودقّته معه — فخطوة النقرة ترسم إطارها على الصفحة الصحيحة لا على ما تلاها.
     * يعيد ختم اللقطة (ts) ليربطها الحدث، أو null إن تعذّر (عنصر بلا أبعاد).
     */
    function requestPreShot(el: Element): number | null {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return null
      const ts = Date.now()
      const url = location.href
      // سباق الرسم (الثغرة الأخيرة في «المستطيلين»): إخفاء الحلقة تغييرُ أنماط
      // لا يظهر في البكسل قبل أن يُركَّب إطارٌ جديد ويُعرض. `captureVisibleTab`
      // ينسخ آخر إطار مُفعَّل، فقد ينسخ ما قبل الإخفاء. إطارا رسم = ضمانة أن
      // إطار «بلا حلقة» قد عُرض فعلًا. الكلفة ≈٣٢مث، ونقرة الإنسان أطول منها
      // بكثير (الضغط حتى الإفلات ≥٦٠مث)، ونتحقق أن الصفحة لم تتنقّل قبل الإرسال.
      afterPaint(() => {
        if (location.href !== url) return // تنقّلت قبل أن نلتقط — لا تُلصق صفحةً أخرى
        chrome.runtime
          .sendMessage({
            t: 'pre-shot',
            pre: { ts, url, rect: { x: r.x, y: r.y, w: r.width, h: r.height }, dpr: dpr() },
          })
          .catch(() => {})
      })
      return ts
    }

    /** ينفّذ بعد أن يُعرض إطارٌ يحمل آخر تغييرات الأنماط (إطارا rAF متتاليان) */
    function afterPaint(fn: () => void) {
      if (typeof requestAnimationFrame !== 'function') return fn()
      requestAnimationFrame(() => requestAnimationFrame(fn))
    }

    /** الضغط يسبق mouseup→click→التنقّل — أبكر لحظة موثوقة لالتقاط الصفحة قبل أن تتبدّل.
     *  يُصفّر الختم على ضغطٍ لا يطلب لقطة كي لا يُلصَق ختم قديم بنقرةٍ تالية. */
    function onPointerDown(e: Event) {
      lastPreShotTs = null
      if (pathIncludesController(e)) return
      gesture.open() // ضغطة = بداية إيماءة جديدة، مهما كان ما تحتها
      const el = composedTarget(e)
      if (!el) return
      const interactive = pickInteractive(el)
      if (!interactive) {
        // غير تفاعليّ ⇒ لا لقطة مسبقة، لكن `onClick` قد يعتمده هدفًا (`?? el`)
        // فيلتقط حيًّا بعد ٦٠٠مث — وتلك بالضبط النافذة التي تعود فيها الحلقة.
        overlay.suppressRing()
        return
      }
      // علة «مستطيلين»: حلقة التأشير ما تزال ظاهرة لحظة الضغط فتُخبز في اللقطة
      // المسبقة كإطارٍ ثانٍ. الكتم يُخفيها **ويمنع عودتها** حتى تنتهي اللقطة،
      // فلا يبقى في البكسل إلا إطار البيانات الذي يرسمه العارض حيًّا.
      overlay.suppressRing()
      lastPreShotTs = requestPreShot(interactive)
    }

    /**
     * بوابة التنقل: التبويبات الخفية لا ترسل شيئًا عند بدء الالتقاط (البث يصل
     * للجميع) — تنقلها يُبعث لحظة ظهورها. والرابط المُبث سابقًا لا يتكرر
     * (استئناف بعد إيقاف على نفس الصفحة ليس خطوة جديدة).
     */
    function emitNavIfNew() {
      if (!shouldEmitNav(lastNavUrl, location.href, document.visibilityState === 'visible')) return
      lastNavUrl = location.href
      send(buildNavEvent(location.href, document.title, dpr()))
    }

    function onSpaNav() {
      if (location.href !== lastUrl) {
        lastUrl = location.href
        emitNavIfNew()
      }
    }

    function onVisibility() {
      if (listenersOn) emitNavIfNew()
    }

    function onClick(e: Event) {
      if (pathIncludesController(e)) return
      const el = composedTarget(e)
      if (!el) return
      // كاشف موحّد: ما يُؤشَّر بالمرور هو ما يُعلَّم بالنقر — الأزرار المخصصة
      // (div/span بcursor:pointer أو أدوار ARIA) ليست استثناءً بعد اليوم
      const interactive = pickInteractive(el) ?? el
      overlay.suppressRing() // ممنوعة حتى تنتهي لقطة هذه الخطوة — لا إطار ثانٍ مخبوز
      // بناء الحدث فورًا (مستطيل لحظة النقر احتياطًا) ثم إعادة قياس المستطيل بعد
      // استقرار إعادة الترتيب — والقياس الطازج لحظة الالتقاط هو الحَكَم الأخير
      const base = buildClickEvent(interactive, location.href, document.title, dpr())
      // CAP-STABLE: اربط لقطة ضغط هذه النقرة (ضغطها سبق نقرها مباشرة) بختمها
      const ev = lastPreShotTs != null ? { ...base, preTs: lastPreShotTs } : base
      // النقرة لا تُرسل وحدها بعد اليوم: تنضم لإيماءتها. الضغطةُ الواحدة قد تولّد
      // نقرتين (label ثم الحقل المُوجَّه إليه) — وهما فعلٌ واحد لا خطوتان.
      gesture.addClick(ev, interactive)
    }

    // حلقة التأشير: تتبع العنصر التفاعلي تحت المؤشر — مرتبطة بالأحداث فقط
    function onMouseOver(e: Event) {
      if (pathIncludesController(e)) return overlay.hideRing() // لا نؤشّر عناصر شريطنا
      const el = composedTarget(e)
      if (!el) return overlay.hideRing()
      const interactive = pickInteractive(el)
      if (!interactive) return overlay.hideRing()
      const r = interactive.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return overlay.hideRing()
      overlay.showRing({ x: r.x, y: r.y, w: r.width, h: r.height })
    }

    function onScrollOrResize() {
      overlay.hideRing() // إحداثيات الحلقة تقادمت — تعود عند أول مرور تالٍ
    }

    function onChange(e: Event) {
      const el = e.target
      if (
        !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)
      ) {
        return
      }
      // عناصر الإيماءة تُمرَّر للبناء: المفتاح المرئي قد يكون **شقيقًا** للحقل المخفيّ
      // (نمط claude.ai) فلا يُدرَك بالصعود في الأسلاف وحده
      const ev = buildValueEvent(el, location.href, document.title, dpr(), gesture.seen())
      if (!ev) return
      overlay.suppressRing()
      // تبديل/اختيار داخل ضغطةٍ جارية = نفس الفعل الذي بدأته النقرة، لا خطوة ثانية.
      // والكتابة لا تنطوي أبدًا: تفريغ حقلٍ سابق (blur) يقع داخل نافذة نقرة المغادرة
      // (فخ 45: pointerdown@158 → change@160 → click@163) وطيّه يزوّر الخطوتين معًا.
      if (gesture.addValue(ev, el)) return
      // نتذكّر المفتاح المرئي (لا الحقل المخفيّ) فتُعاد قياساته لحظة اللقطة على موضعه الصحيح
      rememberMark(visualControl(el), ev.ts) // خطوات الكتابة/التبديل تُعلَّم — إطار على العنصر المرئي
      send(ev)
    }

    function onKeydown(e: KeyboardEvent) {
      if (e.key !== 'Enter') return
      // Enter فعلٌ مستقلّ بذاته — لا يُبتلع في إيماءة نقرةٍ مفتوحة ولا يبتلعها
      gesture.flush()
      const el = e.target
      if (el instanceof HTMLTextAreaElement && !e.ctrlKey) return // سطر جديد داخل نص طويل ليس تأكيدًا
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        const ts = Date.now()
        rememberMark(el, ts)
        overlay.suppressRing() // Enter خطوة كاملة بلقطة — الحلقة ممنوعة حتى تنتهي
        const preTs = requestPreShot(el) // Enter قد يُرسِل النموذج فيتنقّل — التقط حقله الآن قبل ذلك
        send({
          kind: 'keypress',
          target: { label: extractLabel(el), anchor: anchorOf(el) },
          value: 'Enter',
          sensitive: false,
          url: location.href,
          pageTitle: document.title,
          ts,
          dpr: dpr(),
          rect: viewportRect(el), // تأكيد Enter يُعلَّم على حقله كالكتابة
          ...(preTs != null ? { preTs } : {}),
        })
      }
    }

    function wrapHistory() {
      if (historyWrapped) return
      historyWrapped = true
      for (const name of ['pushState', 'replaceState'] as const) {
        const orig = history[name].bind(history)
        const wrapped: typeof history[typeof name] = (...args) => {
          const r = orig(...args)
          onSpaNav()
          return r
        }
        history[name] = wrapped
      }
    }

    function attachListeners() {
      if (listenersOn) return
      listenersOn = true
      lastUrl = location.href
      document.addEventListener('pointerdown', onPointerDown, true)
      document.addEventListener('click', onClick, true)
      document.addEventListener('change', onChange, true)
      document.addEventListener('keydown', onKeydown, true)
      document.addEventListener('visibilitychange', onVisibility)
      document.addEventListener('mouseover', onMouseOver, true)
      window.addEventListener('scroll', onScrollOrResize, true)
      window.addEventListener('resize', onScrollOrResize)
      window.addEventListener('popstate', onSpaNav)
      // مغادرة الصفحة تقتل مؤقّت الإيماءة — نرسل خطوتها الآن بدل أن تضيع
      window.addEventListener('pagehide', gesture.flush)
      wrapHistory()
      emitNavIfNew() // خطوة التنقل الافتتاحية — من التبويب المرئي فقط
    }

    function detachListeners() {
      if (!listenersOn) return
      listenersOn = false
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('change', onChange, true)
      document.removeEventListener('keydown', onKeydown, true)
      document.removeEventListener('visibilitychange', onVisibility)
      document.removeEventListener('mouseover', onMouseOver, true)
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
      window.removeEventListener('popstate', onSpaNav)
      window.removeEventListener('pagehide', gesture.flush)
      gesture.flush() // إيقاف التسجيل لا يبتلع خطوةً مكتملة بانتظار مؤقّتها
      overlay.hideRing()
    }

    function syncState(m: SessionMeta) {
      overlay.sync(m) // الشريط يعكس الحالة والعدّاد في كل الحالات
      if (m.state === 'capturing') attachListeners()
      else detachListeners() // الحلقة فقط أثناء التسجيل الفعلي، لا عند الإيقاف المؤقت
    }

    /** دربني: وضع التدريب يُنشأ كسولًا عند أول خطوة — النتيجة تعلن للخلفية التي تدير الفهرس */
    let trainMode: TrainMode | null = null
    function ensureTrainMode(): TrainMode {
      if (!trainMode) {
        trainMode = createTrainMode((result) => {
          chrome.runtime.sendMessage({ t: 'train-progress', result }).catch(() => {})
        })
      }
      return trainMode
    }

    chrome.runtime.onMessage.addListener((msg: ToTabMsg, _sender, sendResponse) => {
      if (msg.t === 'meta') {
        syncState(msg.meta)
        return
      }
      if (msg.t === 'train-step' || msg.t === 'train-stop') {
        ensureTrainMode().handle(msg)
        return
      }
      // CAP-13: الخلفية التقطت اللقطة الآن — مستطيلات طمس طازجة على التخطيط الحالي.
      // علة الإطار المنزاح: معها مستطيل العلامة الطازج (نفس العنصر الذي نُقر/كُتب فيه
      // إن طابق ختم الحدث) + dpr اللحظي — فيُقاس على تخطيط اللقطة لا تخطيط لحظة النقر.
      if (msg.t === 'get-blur-rects') {
        // هذه الجولة تسبق `captureVisibleTab` الحيّة مباشرةً: نكتم الحلقة هنا
        // أيضًا (حزام وحمّالة — لو مات العامل وفُكّ الكتم بمؤقّت الأمان)، ولا
        // نردّ إلا **بعد عرض إطارٍ بلا حلقة** فيستحيل خبزها في اللقطة التالية.
        overlay.suppressRing()
        afterPaint(() => {
          const rects = blurEls
            .filter((el) => el.isConnected)
            .map((el) => {
              const r = el.getBoundingClientRect()
              return { x: r.x, y: r.y, w: r.width, h: r.height }
            })
            .filter((r) => r.w > 0 && r.h > 0)
          const res: { rects: typeof rects; mark?: { x: number; y: number; w: number; h: number }; dpr?: number } = { rects }
          if (
            typeof msg.markTs === 'number' &&
            lastMark &&
            lastMark.ts === msg.markTs &&
            lastMark.el.isConnected
          ) {
            const r = lastMark.el.getBoundingClientRect()
            if (r.width > 0 && r.height > 0) {
              res.mark = { x: r.x, y: r.y, w: r.width, h: r.height }
              res.dpr = window.devicePixelRatio || 1
            }
          }
          sendResponse(res)
        })
        return true // ردّ غير متزامن — بلا هذه يُغلق القناة فيسقط الطمس والإطار
      }
      // انتهت لقطة الخطوة: الحلقة تعود فورًا فلا ينتظر المستخدم مؤقّت الأمان
      if (msg.t === 'capture-done') overlay.releaseRing()
      // CAP-15: اختصار الإخفاء وصل من الخلفية
      if (msg.t === 'toggle-bar') overlay.toggleHidden()
      // CAP-13: زر «طمس» في اللوحة فعّل/أطفأ وضع سحب الطمس على هذه الصفحة
      if (msg.t === 'blur-mode') overlay.setBlurMode(msg.on)
    })

    /** ترحيل موثوق عبر chrome.runtime ثم ردّ الصفحة بإشعار — الفشل رسالة صادقة لا صمت */
    const relay = (msg: Record<string, unknown>, ackTag: string) => {
      void chrome.runtime
        .sendMessage(msg)
        .then((res: { ok?: boolean; errorAr?: string } | undefined) => {
          window.postMessage({ source: 'dalili-ext', t: ackTag, ok: !!res?.ok, errorAr: res?.errorAr }, '*')
        })
        .catch(() => {
          window.postMessage(
            { source: 'dalili-ext', t: ackTag, ok: false, errorAr: 'الامتداد لا يستجيب — أعد تحميله (↻)' },
            '*',
          )
        })
    }

    /** CAP-17: محرر الويب يطلب بدء جلسة إضافة خطوات — ترحيل موثوق عبر postMessage ثم ردّ بإشعار */
    window.addEventListener('message', (e) => {
      if (e.source !== window) return
      const data = e.data as { source?: string; t?: string; guideId?: string; insertAt?: number; token?: string; guide?: unknown }
      if (data?.source !== 'dalili-web' || location.origin !== WEB_ORIGIN) return // لا نقبل طلب بدء إلا من موقع دليلي نفسه
      if (data.t === 'append-capture') {
        relay({ t: 'append-capture', guideId: data.guideId, insertAt: data.insertAt }, 'append-ack')
        return
      }
      // دربني: العارض يطلب بالرمز العام، والمحرر بالدليل الحالي نفسه (بلا مشاركة) — الرد يرحَّل للصفحة
      if (data.t === 'train-start' && (data.token || data.guide)) {
        relay({ t: 'train-start', token: data.token, guide: data.guide }, 'train-ack')
      }
    })

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[META_KEY]) return
      const m = changes[META_KEY]!.newValue as SessionMeta | undefined
      if (m) syncState(m)
    })

    // صفحة حُمّلت داخل جلسة نشطة
    chrome.runtime
      .sendMessage({ t: 'whoami' })
      .then((res: { meta?: SessionMeta } | undefined) => {
        const m = res?.meta
        if (m) syncState(m)
      })
      .catch(() => {})
  },
})
