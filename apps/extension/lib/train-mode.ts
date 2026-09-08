import { resolveAnchor, type AnchorDom } from '@dalili/core'
import type { ToTabMsg, TrainResult, TrainStep } from './protocol'
import { createTrainCard } from './train-card'
import { onTargetScreen } from './train'
import { pickInteractive } from './pick'
import { anchorTextOf } from './anchor-of'
import { isVisibleControl, visibleRepresentative } from './gesture'

/** وضع التدريب داخل الصفحة الهدف — سكربت المحتوى يستقبل الخطوة الجارية من الخلفية:
 *  يحلّ المرساة، يحتاط الزر بدائرة مرسومة (GM-01)، يكشف النقر الخاطئ بلطف (GM-02)،
 *  ويعلن التقدم للخلفية. الخلفية مصدر الحقيقة للفهرس — هذا الملف يعرض خطوة وينتظر التالية.
 *
 *  علة «لا يتوهج الزر أبدًا»: حل المرساة كان لمرة واحدة لحظة وصول الخطوة، بينما
 *  صفحات SPA كـGmail تركّب عناصرها بعد «اكتمال التحميل» بثوانٍ — فأعلنا الفشل قبل
 *  أن يظهر الزر أصلًا. الحل: بحث صبور بمحاولات محدودة (RC1) — إن ظهر الزر خلال
 *  المهلة حُيط بدائرته، وإلا فرسالة عدم وجود صادقة. لا حلقات أبدية (قانون لا تعليق). */

const RESOLVE_TICK_MS = 350
const RESOLVE_ATTEMPTS = 23 // ≈ ٨ ثوانٍ قصوى للبحث عن الزر قبل رسالة الصدق

const realDom: AnchorDom<Element> = {
  queryAll: (sel) => Array.from(document.querySelectorAll(sel)),
  textOf: (el) => anchorTextOf(el),
}

/** خطوات الكتابة والاختيار والتبديل تكتمل بأي إدخال صحيح في العنصر — GM-06 خطوة مرنة */
const VALUE_KINDS = new Set(['input', 'select', 'toggle', 'keypress'])

export interface TrainMode {
  handle(msg: ToTabMsg): void
  dispose(): void
}

export function createTrainMode(
  send: (result: TrainResult) => void,
  dom: AnchorDom<Element> = realDom,
  here: () => string = () => location.href,
): TrainMode {
  const card = createTrainCard()
  let step: TrainStep | null = null
  let target: Element | null = null
  let total = 0 // لبطاقة الإنجاز النهائية
  let done = false // الخطوة الحالية بلّغت نتيجتها — لا تكرار قبل وصول التالية
  let gen = 0 // جيل الخطوة الحالي — يُبطل مؤقتات الخطوات السابقة فورًا
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let waitObserver: MutationObserver | null = null // LX-01: مراقب أحداث ينتظر وصول الشاشة الهدف
  let ctx: { idx: number; guideTitle: string } | null = null

  function cancelRetry() {
    gen++
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
    if (waitObserver) {
      waitObserver.disconnect()
      waitObserver = null
    }
  }

  card.onSkip(() => report('skip'))
  card.onStop(() => report('stop'))

  function report(result: TrainResult) {
    if (!step || done) return
    done = true
    send(result)
  }

  function composedEl(e: Event): Element | null {
    const first = e.composedPath()[0]
    return first instanceof Element ? first : null
  }

  /** نقرات بطاقتنا نفسها ليست نقرة خاطئة — تمرير صامت */
  function fromOurCard(e: Event): boolean {
    for (const node of e.composedPath()) {
      if (node instanceof Element && node.tagName === 'DALILI-TRAIN') return true
    }
    return false
  }

  /**
   * هل ما نقره المتدرّب هو هدف الخطوة نفسه؟
   *
   * كانت المطابقة **بالاحتواء فقط**، وهي كافية ما دام الهدف مرئيًا. لكن أدلة
   * التبديل الملتقَطة قبل 2026-09-06 مرساتها على حقلٍ **مخفيّ** ومفتاحه المرئي
   * **شقيق** لا سلف ولا ابن — فلا يطابق أبدًا، فتُقابَل نقرة المتدرّب الصحيحة
   * بـ«ليس هذا الزر» إلى الأبد. التشديد: نقارن المفتاحين المرئيَّين للطرفين،
   * فيلتقيان عند الشقيق. ونقرة زرٍّ آخر تبقى خاطئة — العنصر المرئي يمثّل نفسه.
   */
  function sameControl(picked: Element, tgt: Element): boolean {
    if (picked === tgt || tgt.contains(picked) || picked.contains(tgt)) return true
    return visibleRepresentative(tgt, [picked]) === picked
  }

  function onClick(e: Event) {
    if (!step || done || fromOurCard(e)) return
    // أثناء البحث لا هدف بعد — النقر ليس صحيحًا ولا خاطئًا؛ صمت حتى يعرف التدريب هدفه
    if (!target) return
    const el = composedEl(e)
    if (!el) return
    const picked = pickInteractive(el) ?? el
    if (sameControl(picked, target)) {
      report('done')
      return
    }
    // GM-02: توجيه لطيف بلا تقديم — التدريب لا يعاقب
    card.wrongHint(step.title)
  }

  function onValue(e: Event) {
    if (!step || done || !VALUE_KINDS.has(step.kind)) return
    const el = e.target instanceof Element ? e.target : null
    if (!el || !target) return
    if (el === target || target.contains(el) || el.contains(target)) report('done')
  }

  function attach() {
    document.addEventListener('click', onClick, true)
    document.addEventListener('input', onValue, true)
    document.addEventListener('change', onValue, true)
  }

  function detach() {
    document.removeEventListener('click', onClick, true)
    document.removeEventListener('input', onValue, true)
    document.removeEventListener('change', onValue, true)
  }

  /**
   * حلّ مرساة الخطوة الحالية — العنصر المخفيّ لا يُعتدّ به: RC2.
   *
   * كان الشرط `> 0` فحسب، فيمرّ الحقل المخفيّ الذي يقاس {-2,-2,2,2} (وهو ما تحمله
   * مراسي أدلة التبديل الملتقَطة قبل 2026-09-06). النتيجة: حلقة حول ٢×٢ في زاوية
   * الشاشة و`scrollIntoView` يقفز لموضعٍ عشوائي — «الأزرار في غير مكانها». الحكم
   * الآن بالحجم والموضع المعقول (`usableRect`): ما تحت الطيّة يبقى هدفًا مشروعًا
   * (التدريب يمرّر إليه)، والضامر أو المدفوع خارج الشاشة ليس هدفًا.
   *
   * وإن كان المحلول ضامرًا فله مفتاحٌ مرئي غالبًا (سلفٌ أو شقيق) — نأخذه بدل أن
   * نعلن الفقد، فتصحّ الأدلة القديمة أيضًا لا الجديدة وحدها.
   */
  function visibleTarget(): Element | null {
    if (!step) return null
    const el = resolveAnchor(step.anchor, dom)?.el ?? null
    if (!el) return null
    if (isVisibleControl(el)) return el
    const rep = visibleRepresentative(el)
    return rep !== el && isVisibleControl(rep) ? rep : null
  }

  function show(el: Element | null) {
    if (!step || !ctx) return
    card.showStep({ step, idx: ctx.idx, total, guideTitle: ctx.guideTitle, target: el })
  }

  /** LX-01: أول خطوة ولسنا على الشاشة الهدف = تحويل لتسجيل الدخول/شاشة أخرى، لا زر مفقود */
  function offTargetFirstStep(): boolean {
    return !!step && !!ctx && ctx.idx === 0 && !onTargetScreen(here(), step.url)
  }

  /** بطاقة «استعد» + مراقب أحداث: حين يُركّب الزر (بعد الدخول/التنقّل) نعرض الخطوة تلقائيًا.
   *  مدفوع بالطفرات لا بالدوران — لا حلقة أبدية؛ يُفكّ عند تغيّر الخطوة أو الإيقاف. */
  function enterWaiting() {
    card.markWaiting()
    target = null
    if (waitObserver) return
    waitObserver = new MutationObserver(() => {
      const el = visibleTarget()
      if (!el) return
      target = el
      show(el)
      if (waitObserver) {
        waitObserver.disconnect()
        waitObserver = null
      }
    })
    waitObserver.observe(document.documentElement, { childList: true, subtree: true, attributes: true })
  }

  /** RC1: البحث الصبور — محاولة فورية ثم محاولات محدودة حتى المهلة ثم رسالة صادقة */
  function resolvePatiently(attemptsLeft: number) {
    if (!step || !ctx) return
    const el = visibleTarget()
    if (el) {
      target = el
      show(el)
      return
    }
    if (attemptsLeft <= 0) {
      // على الشاشة الصحيحة وغاب الزر = عطب حقيقي؛ خارجها في أول خطوة = انتظار دخول
      if (offTargetFirstStep()) enterWaiting()
      else card.markMissing()
      return
    }
    const myGen = gen
    retryTimer = setTimeout(() => {
      if (myGen !== gen) return // خطوة جديدة أو إيقاف — هذا البحث ملغى
      resolvePatiently(attemptsLeft - 1)
    }, RESOLVE_TICK_MS)
  }

  function start(msg: Extract<ToTabMsg, { t: 'train-step' }>) {
    cancelRetry()
    step = msg.step
    total = msg.total
    done = false
    ctx = { idx: msg.idx, guideTitle: msg.guideTitle }
    const el = visibleTarget()
    target = el
    show(el)
    if (el) return
    // خارج الشاشة الهدف في أول خطوة → «استعد» فورًا بلا ٨ث بحث عبثي على صفحة الدخول
    if (offTargetFirstStep()) enterWaiting()
    else resolvePatiently(RESOLVE_ATTEMPTS)
  }

  return {
    handle(msg) {
      if (msg.t === 'train-step') {
        attach()
        start(msg)
        return
      }
      if (msg.t === 'train-stop') {
        cancelRetry()
        detach()
        step = null
        ctx = null
        target = null
        if (msg.reason === 'finished') {
          // بطاقة الإنجاز تظهر ثم تُفكك ذاتيًا — الخلفية أنهت الجلسة فعلًا
          card.finish(total)
        } else {
          card.hide()
        }
      }
    },
    dispose() {
      cancelRetry()
      detach()
      step = null
      ctx = null
      target = null
      card.hide()
    },
  }
}
