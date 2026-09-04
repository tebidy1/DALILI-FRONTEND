import { resolveAnchor, type AnchorDom } from '@dalili/core'
import type { ToTabMsg, TrainResult, TrainStep } from './protocol'
import { createTrainCard } from './train-card'
import { pickInteractive } from './pick'
import { anchorTextOf } from './anchor-of'

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
): TrainMode {
  const card = createTrainCard()
  let step: TrainStep | null = null
  let target: Element | null = null
  let total = 0 // لبطاقة الإنجاز النهائية
  let done = false // الخطوة الحالية بلّغت نتيجتها — لا تكرار قبل وصول التالية
  let gen = 0 // جيل الخطوة الحالي — يُبطل مؤقتات الخطوات السابقة فورًا
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let ctx: { idx: number; guideTitle: string } | null = null

  function cancelRetry() {
    gen++
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = null
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

  function onClick(e: Event) {
    if (!step || done || fromOurCard(e)) return
    // أثناء البحث لا هدف بعد — النقر ليس صحيحًا ولا خاطئًا؛ صمت حتى يعرف التدريب هدفه
    if (!target) return
    const el = composedEl(e)
    if (!el) return
    const picked = pickInteractive(el) ?? el
    if (picked === target || target.contains(picked) || picked.contains(target)) {
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

  /** حلّ مرساة الخطوة الحالية — العنصر المخفي (rect صفري) لا يُعتدّ به: RC2 */
  function visibleTarget(): Element | null {
    if (!step) return null
    const el = resolveAnchor(step.anchor, dom)?.el ?? null
    if (!el) return null
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0 ? el : null
  }

  function show(el: Element | null) {
    if (!step || !ctx) return
    card.showStep({ step, idx: ctx.idx, total, guideTitle: ctx.guideTitle, target: el })
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
      card.markMissing()
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
    if (!el) resolvePatiently(RESOLVE_ATTEMPTS)
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
