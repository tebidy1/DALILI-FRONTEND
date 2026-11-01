import { anchorNormText, cssAnchorFinder, resolveAnchor, type AnchorConfidence, type AnchorDom } from '@dalili/core'
import type { ToTabMsg, TrainOutcome, TrainResult, TrainStep } from './protocol'
import { createTrainCard, HOST_TAG, type StepCtx } from './train-card'
import { onTargetScreen } from './train'
import { pickInteractive } from './pick'
import { anchorTextOf, ctxOf, labelOf } from './anchor-of'
import { isVisibleControl, visibleRepresentative } from './gesture'
import { coverKind, sideOf, sightOf, type CoverKind } from './train-sight'

/** وضع التدريب داخل الصفحة الهدف — سكربت المحتوى يستقبل الخطوة الجارية من الخلفية:
 *  يحلّ المرساة، يحتاط الزر بدائرة مرسومة (GM-01)، يكشف النقر الخاطئ بلطف (GM-02)،
 *  ويعلن التقدم للخلفية. الخلفية مصدر الحقيقة للفهرس — هذا الملف يعرض خطوة وينتظر التالية.
 *
 *  ث١ دربني الواثق (2026-10-31): كان التدريب «أعمى» — يعرض عبارة التوجيه قبل أن يجد الزر،
 *  ويرسم الدائرة ولا يتحقق أنها ظاهرة، ويبحث بدوران كل ٣٥٠ms. الآن كل فحص = حلّ بدرجة ثقة +
 *  فحص رؤية بالنقاط (train-sight)، يُطلقه حدث (طفرة/تمرير/حجم/تركيز) مجمّعًا في إطار رسم واحد،
 *  والحالة تُقرَّر من الاثنين: تجهيز، مؤكَّد، غير متأكد، مغطّى، غير موجود. لا دوران ولا تعليق أبدي. */

/** «تجهيز» لا يظهر إن وُجد الزر قبل ذلك — منعًا لرمش البطاقة في الصفحات السريعة */
const PREPARING_DELAY_MS = 300
/** أقصى مدة بلا هدف قبل «غير موجود» */
const MISSING_AFTER_MS = 8000
/** «تم» ثم ظهر هدف الخطوة التالية خلال هذه المدة = أثر الخطوة ظاهر ⇐ «متحقق» */
const PROOF_WINDOW_MS = 5000
/** أقل فاصل بين فحصين — صفحات كأودو تطلق مئات الطفرات في الثانية (مراجعة I1) */
const CHECK_GAP_MS = 100
/** سمات تغيّر ظهور الهدف أو قابليته — غيرها (مؤشرات الكتابة، الحركات) لا يستحق فحصًا */
const WATCHED_ATTRS = ['class', 'style', 'hidden', 'aria-hidden', 'disabled', 'open']

/** مطابقات ملتبسة تُضيَّق إلى الظاهر منها — القوالب المخفية والنسخ المطويّة ليست هدفًا */
const realDom: AnchorDom<Element> = {
  ...cssAnchorFinder(
    (sel) => Array.from(document.querySelectorAll(sel)),
    (el) => anchorTextOf(el),
  ),
  narrow: (els) => els.filter((el) => isVisibleControl(el) || isVisibleControl(visibleRepresentative(el))),
  // ث١: الدالتان نفسهما وقت الالتقاط — فلا يختلف الطرفان
  labelOf,
  ctxOf,
}

/** خطوات الكتابة والاختيار والتبديل تكتمل بأي إدخال صحيح في العنصر — GM-06 خطوة مرنة */
const VALUE_KINDS = new Set(['input', 'select', 'toggle', 'keypress'])
/** خطوات الكتابة — هدفها حقلٌ نصّي يولد غالبًا مركَّزًا (سطر جديد، نافذة بحث) */
const TYPING_KINDS = new Set(['input', 'keypress'])
const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'number', 'tel', 'url', 'password'])

function isTextField(el: Element | null): el is HTMLElement {
  if (el instanceof HTMLTextAreaElement) return !el.disabled && !el.readOnly
  if (el instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(el.type) && !el.disabled && !el.readOnly
  if (!(el instanceof HTMLElement)) return false
  const ce = el.getAttribute('contenteditable')
  return el.isContentEditable === true || ce === '' || ce === 'true' || ce === 'plaintext-only'
}

/** هل حدث القيمة على هذا العنصر يُكمل خطوةً من هذا النوع بلا هدفٍ محلول؟ */
function valueFits(el: Element, kind: string): boolean {
  if (TYPING_KINDS.has(kind)) return isTextField(el)
  const role = el.getAttribute('role')
  if (kind === 'select') return el instanceof HTMLSelectElement || role === 'combobox' || role === 'listbox'
  if (kind === 'toggle') {
    return (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) || role === 'switch' || role === 'checkbox' || role === 'radio'
  }
  return false
}

/** ث١: نتيجة خطوة تُعلَن للخلفية — تسبق train-progress للخطوة نفسها، أو ترقيةٌ لسابقتها */
export interface TrainOutcomeMsg {
  idx: number
  outcome: TrainOutcome
  confidence: AnchorConfidence | null
}

/** منافذ قابلة للحقن للاختبار: المتصفح الحقيقي افتراضًا */
export interface TrainModeOpts {
  outcome?: (o: TrainOutcomeMsg) => void
  pointAt?: (x: number, y: number) => Element | null
  viewport?: () => { w: number; h: number }
  /** «افتح الشاشة المطلوبة» — التنقّل في التبويب نفسه */
  assign?: (url: string) => void
}

export interface TrainMode {
  handle(msg: ToTabMsg): void
  dispose(): void
}

/** حالة الخطوة المعروضة — none = لحظة الوصول قبل أي حكم */
type View = 'none' | 'preparing' | 'found' | 'unsure' | 'covered' | 'missing' | 'waiting'

/** إطار الرسم التالي — وبيئة بلا rAF (jsdom) تأخذ مؤقّت إطار واحد */
const nextFrame = (cb: () => void): (() => void) => {
  if (typeof requestAnimationFrame === 'function') {
    const id = requestAnimationFrame(cb)
    return () => cancelAnimationFrame(id)
  }
  const id = setTimeout(cb, 16)
  return () => clearTimeout(id)
}

/** jsdom بلا elementFromPoint — بلا منفذ نقاط لا حكم بالتغطية (المتصفح الحقيقي يملكه دائمًا) */
const defaultPointAt = (x: number, y: number): Element | null =>
  typeof document.elementFromPoint === 'function' ? document.elementFromPoint(x, y) : null

export function createTrainMode(
  send: (result: TrainResult) => void,
  dom: AnchorDom<Element> = realDom,
  here: () => string = () => location.href,
  opts: TrainModeOpts = {},
): TrainMode {
  const card = createTrainCard()
  const pointAt = opts.pointAt ?? defaultPointAt
  const viewport = opts.viewport ?? (() => ({ w: innerWidth, h: innerHeight }))
  let step: TrainStep | null = null
  let ctx: StepCtx | null = null
  let target: Element | null = null
  let confidence: AnchorConfidence | null = null
  let view: View = 'none'
  let coveredBy: CoverKind | null = null
  let total = 0 // لبطاقة الإنجاز النهائية
  let done = false // الخطوة الحالية بلّغت نتيجتها — لا تكرار قبل وصول التالية
  /** الموظف أجاب «نعم» على هذا العنصر — صار مؤكَّدًا له وحده */
  let saidYes: Element | null = null
  /** الموظف أجاب «ليس هذا» — لا يُعرض عليه السؤال نفسه ثانيةً */
  let saidNo: Element | null = null
  /** عنصر مُرِّر إليه مرة — لا نعيد التمرير إليه في كل فحص */
  let scrolledTo: Element | null = null
  /** «تم» على الخطوة السابقة — يُرقّى إلى «متحقق» إن ظهر هدف هذه الخطوة خلال النافذة */
  let proof: { idx: number; at: number; href: string } | null = null
  let prepTimer: ReturnType<typeof setTimeout> | null = null
  let missTimer: ReturnType<typeof setTimeout> | null = null
  let frame: (() => void) | null = null
  let lastCheck = 0
  let observer: MutationObserver | null = null
  /**
   * العنصر الذي أكمل الخطوة السابقة. الكتابة تكتمل من أول حرف، والمتدرّب يواصل كتابة بقيتها —
   * فلا يُحتسب ذلك الحقل (وهو ما زال مركَّزًا) إكمالًا للخطوة التالية ولا هدفًا بديلًا لها.
   */
  let prevDoneEl: Element | null = null
  let doneEl: Element | null = null
  /** البطاقة معروضة الآن (أي حالة) — يحكم ظهور «تجهيز» فورًا عند الانتقال لخطوة جديدة */
  let cardShown = false

  card.onSkip(() => report('skip', 'missing'))
  card.onStop(() => {
    // الإيقاف على خطوة لم توجد = نتيجتها «لم توجد»؛ وإلا فلا نتيجة لخطوة لم تُنفَّذ
    if (view === 'missing') report('stop', 'missing')
    else report('stop')
  })
  card.onDidIt(() => report('done', 'declared'))
  card.onUnsure((answer) => {
    if (!target) return
    if (answer === 'yes') {
      saidYes = target
      check()
      return
    }
    // «ليس هذا» = غير موجود فورًا، لا ثماني ثوانٍ تجهيز (مراجعة I5) — والرصد يبقى لعنصر أوثق
    saidNo = target
    target = null
    confidence = null
    goMissing()
  })
  card.onOpenTarget(() => {
    if (step?.url) (opts.assign ?? ((u: string) => location.assign(u)))(step.url)
  })

  function report(result: TrainResult, outcome?: TrainOutcome, by: Element | null = null) {
    if (!step || !ctx || done) return
    done = true
    doneEl = by
    if (outcome) {
      opts.outcome?.({ idx: ctx.idx, outcome, confidence })
      proof = outcome === 'declared' ? { idx: ctx.idx, at: Date.now(), href: here() } : null
    }
    send(result)
  }

  /** نتيجة إنجاز بالهدف نفسه: مؤكَّد بثقة عالية = متحقق؛ بثقة متوسطة (بعد «نعم» أو على الإطار المتقطّع) = أكّده الموظف */
  function actedOnTarget(): TrainOutcome {
    return view === 'found' && confidence === 'high' ? 'verified' : 'confirmed'
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

  /**
   * نقرة عنصرٍ نصُّه نصُّ الخطوة نفسه = الفعل المطلوب. خيارات القوائم المتولّدة (إكمال أودو
   * التلقائي) قد لا تحلّها المرساة — لا دور تفاعلي، أو تظهر بعد المهلة — لكن نصّها لا يكذب.
   */
  function textMatches(...els: Element[]): boolean {
    const want = step?.anchor.find((c) => c.k === 'text')?.v
    if (!want) return false
    const norm = anchorNormText(want)
    return els.some((el) => anchorNormText(anchorTextOf(el)) === norm)
  }

  function onClick(e: Event) {
    if (!step || done || fromOurCard(e) || view === 'waiting') return
    const el = composedEl(e)
    if (!el) return
    const picked = pickInteractive(el) ?? el
    if (step.kind === 'click' && textMatches(picked, el)) {
      // النص يطابق لكن العنصر ليس الهدف المحلول: اختيار الموظف لا تحقّقنا (مراجعة I9)
      report('done', target && sameControl(picked, target) ? actedOnTarget() : 'confirmed')
      return
    }
    // أثناء البحث لا هدف بعد — النقر ليس صحيحًا ولا خاطئًا؛ صمت حتى يعرف التدريب هدفه
    if (!target) return
    if (sameControl(picked, target)) {
      // نقر حقل «أدخل/اختر» دخولٌ إليه لا إكمال — القيمة (onValue) تكملها. التبديل يبقى بالنقر:
      // المفاتيح المرسومة (div[role=switch]) لا تطلق change أصلًا
      if (TYPING_KINDS.has(step.kind) || step.kind === 'select') return
      report('done', actedOnTarget())
      return
    }
    // مغطّى: الموظف يغلق ما فوق الزر كما طلبت البطاقة — ليس نقرًا خاطئًا (مراجعة I4)
    if (view === 'covered') return
    // GM-02: توجيه لطيف بلا تقديم — التدريب لا يعاقب
    card.wrongHint(step.title)
  }

  /**
   * بهدفٍ محلول: القيمة في الهدف وحده تُكملها. بلا هدف (بحث جارٍ أو تعذّرت الإشارة): أي قيمة
   * في عنصرٍ من نوع الخطوة تُكملها — المتدرّب يكتب في الحقل بنفسه، فلا نعلّقه على مرساةٍ
   * انكسرت (بلاغ أودو: «أدخل» توقّف التدريب كله) — لكنها «بإقرار الموظف» لا «متحقق».
   * الانتظار مستثنى: الكتابة في صفحة الدخول ليست الخطوة.
   */
  function onValue(e: Event) {
    if (!step || done || !VALUE_KINDS.has(step.kind) || view === 'waiting') return
    const el = e.target instanceof Element ? e.target : null
    if (!el) return
    if (target) {
      if (el === target || target.contains(el) || el.contains(target)) report('done', actedOnTarget(), el)
      return
    }
    if (el !== prevDoneEl && valueFits(el, step.kind)) report('done', 'declared', el)
  }

  /** حدث صفحة ⇐ فحص واحد في الإطار التالي — مئات طفرات أودو في الثانية تصير فحصًا واحدًا */
  function schedule() {
    if (frame !== null || !step) return
    const wait = lastCheck + CHECK_GAP_MS - Date.now()
    const run = () => {
      frame = null
      check()
    }
    if (wait > 0) {
      const id = setTimeout(run, wait)
      frame = () => clearTimeout(id)
    } else frame = nextFrame(run)
  }

  function attach() {
    document.addEventListener('click', onClick, true)
    document.addEventListener('input', onValue, true)
    document.addEventListener('change', onValue, true)
    document.addEventListener('focusin', schedule, true)
    window.addEventListener('scroll', schedule, { passive: true, capture: true })
    window.addEventListener('resize', schedule)
    if (!observer) {
      observer = new MutationObserver(schedule)
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: WATCHED_ATTRS })
    }
  }

  function detach() {
    document.removeEventListener('click', onClick, true)
    document.removeEventListener('input', onValue, true)
    document.removeEventListener('change', onValue, true)
    document.removeEventListener('focusin', schedule, true)
    window.removeEventListener('scroll', schedule, { capture: true })
    window.removeEventListener('resize', schedule)
    observer?.disconnect()
    observer = null
  }

  function clearTimers() {
    if (prepTimer) clearTimeout(prepTimer)
    if (missTimer) clearTimeout(missTimer)
    frame?.()
    prepTimer = missTimer = null
    frame = null
  }

  /**
   * حلّ مرساة الخطوة الحالية بدرجة ثقة — العنصر المخفيّ لا يُعتدّ به: RC2.
   *
   * كان الشرط `> 0` فحسب، فيمرّ الحقل المخفيّ الذي يقاس {-2,-2,2,2} (وهو ما تحمله
   * مراسي أدلة التبديل الملتقَطة قبل 2026-09-06). وإن كان المحلول ضامرًا فله مفتاحٌ مرئي
   * غالبًا (سلفٌ أو شقيق) — نأخذه بالثقة نفسها بدل أن نعلن الفقد.
   * الحقل المركَّز بديلًا (مرساة انكسرت) تخمينٌ معقول لا يقين ⇐ ثقة متوسطة.
   */
  function resolveTarget(): { el: Element; confidence: AnchorConfidence } | null {
    if (!step) return null
    const hit = resolveAnchor(step.anchor, dom)
    if (hit) {
      if (isVisibleControl(hit.el)) return hit
      const rep = visibleRepresentative(hit.el)
      if (rep !== hit.el && isVisibleControl(rep)) return { el: rep, confidence: hit.confidence }
    }
    const f = focusedField()
    return f ? { el: f, confidence: 'medium' } : null
  }

  /**
   * خطوة كتابة لم تُحل مرساتها: الحقل المركَّز الآن هو هدفها غالبًا — أودو يركّز حقل المنتج
   * في السطر الجديد فور «Add Line»، والنوافذ تركّز حقل البحث. يُرفض إن ناقض اسمَ الحقل في المرساة.
   */
  function focusedField(): Element | null {
    if (!step || !TYPING_KINDS.has(step.kind)) return null
    let a: Element | null = document.activeElement
    while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement
    if (!isTextField(a) || !isVisibleControl(a) || a === prevDoneEl) return null
    const name = step.anchor.find((c) => c.k === 'name')?.v
    if (name && a.getAttribute('name') !== name) return null
    return a
  }

  /** LX-01: أول خطوة ولسنا على الشاشة الهدف = تحويل لتسجيل الدخول/شاشة أخرى، لا زر مفقود */
  function offTargetFirstStep(): boolean {
    return !!step && !!ctx && ctx.idx === 0 && !onTargetScreen(here(), step.url)
  }

  /** لا هدف الآن: بعد أن كان ظاهرًا (أعاد النظام بناءه) نعود للتجهيز فورًا؛ وإلا فالمؤقتان يحكمان */
  function lost() {
    target = null
    confidence = null
    if (view === 'found' || view === 'unsure' || view === 'covered') {
      view = 'preparing'
      if (ctx) card.markPreparing(ctx)
      cardShown = true
      armMissing()
    }
  }

  function goMissing() {
    if (!ctx) return
    settle()
    view = 'missing'
    card.markPreparing(ctx) // يضع سياق الخطوة إن لم تكن البطاقة معروضة بعد
    card.markMissing()
    cardShown = true
  }

  function armMissing() {
    if (missTimer) return
    missTimer = setTimeout(() => {
      missTimer = null
      if (!target && (view === 'none' || view === 'preparing')) goMissing()
    }, MISSING_AFTER_MS)
  }

  /** فحص واحد: حلّ + رؤية ⇐ حالة. البطاقة لا تُعاد رسمها ما لم تتغيّر الحالة — منعًا للرمش */
  function check() {
    if (!step || !ctx || done) return
    lastCheck = Date.now()
    // حالة مستقرّة: الهدف حيّ ⇐ فحص الرؤية وحده، بلا إعادة حلّ على كل طفرة (مراجعة I1)
    const steady = target?.isConnected && confidence && (view === 'found' || view === 'unsure' || view === 'covered')
    const hit = steady ? { el: target!, confidence: confidence! } : resolveTarget()
    if (!hit || hit.el === saidNo) {
      if (view === 'waiting' || view === 'missing') return
      lost()
      return
    }
    if (hit.confidence === 'low') {
      if (view !== 'missing' && view !== 'waiting') goMissing()
      return
    }
    const sight = sightOf(hit.el, { pointAt, ignore: (n) => n.tagName.toLowerCase() === HOST_TAG, viewport: viewport() })
    if (sight.state === 'gone') {
      lost()
      return
    }
    // خارج منفذ العرض فقط (أسفل الطيّة) هدفٌ مشروع — البطاقة تمرّر إليه عند عرضه.
    // المقصوص داخل حاوية: نمرّر إليه مرة ثم يحكم الفحص التالي؛ بلا مساحة = ليس هدفًا
    if (sight.state === 'offscreen' && sight.why !== 'viewport') {
      if (sight.why === 'clipped' && scrolledTo !== hit.el && typeof hit.el.scrollIntoView === 'function') {
        scrolledTo = hit.el
        hit.el.scrollIntoView({ block: 'center', behavior: 'auto' })
        schedule()
        return
      }
      if (view !== 'waiting') lost()
      return
    }
    cardShown = true
    const changed = hit.el !== target
    target = hit.el
    confidence = hit.confidence
    if (sight.state === 'covered') {
      const kind = coverKind(sight.cover, viewport())
      if (view !== 'covered' || coveredBy !== kind) {
        view = 'covered'
        coveredBy = kind
        card.markCovered(ctx, kind)
      }
      settle()
      return
    }
    coveredBy = null
    const sure = hit.confidence === 'high' || saidYes === hit.el
    const next: View = sure ? 'found' : 'unsure'
    if (view !== next || changed) {
      view = next
      if (sure) card.showStep({ ...ctx, target: hit.el })
      else card.markUnsure(ctx, hit.el, sideOf(rectOf(hit.el), viewport()))
    } else card.reposition()
    settle()
    if (sure && proof && proof.idx === ctx.idx - 1 && Date.now() - proof.at <= PROOF_WINDOW_MS && here() !== proof.href) {
      // «تم» على السابقة ثم تغيّرت الشاشة وظهر هدف هذه = أثرها ظاهر. الشاشة نفسها لا تكفي:
      // هدف التالية قد يكون حاضرًا أصلًا فتُخفى الخطوة المعطوبة عن «معطوب» (مراجعة C2)
      opts.outcome?.({ idx: proof.idx, outcome: 'verified', confidence: null })
      proof = null
    }
  }

  /** وُجد الهدف — لا تجهيز ولا «غير موجود» بعد الآن لهذه الخطوة */
  function settle() {
    if (prepTimer) clearTimeout(prepTimer)
    if (missTimer) clearTimeout(missTimer)
    prepTimer = missTimer = null
  }

  function rectOf(el: Element) {
    const r = el.getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  }

  function start(msg: Extract<ToTabMsg, { t: 'train-step' }>) {
    clearTimers()
    prevDoneEl = doneEl
    doneEl = null
    step = msg.step
    total = msg.total
    done = false
    ctx = { step: msg.step, idx: msg.idx, total: msg.total, guideTitle: msg.guideTitle }
    target = null
    confidence = null
    view = 'none'
    coveredBy = null
    saidYes = saidNo = scrolledTo = null
    if (proof && proof.idx !== msg.idx - 1) proof = null
    check()
    if (view !== 'none') return
    // خارج الشاشة الهدف في أول خطوة → «استعد» فورًا بلا بحث عبثي على صفحة الدخول
    if (offTargetFirstStep()) {
      view = 'waiting'
      card.markPreparing(ctx)
      card.markWaiting()
      cardShown = true
      return
    }
    const prepare = () => {
      prepTimer = null
      if (view === 'none' && ctx) {
        view = 'preparing'
        card.markPreparing(ctx)
        cardShown = true
      }
    }
    // بطاقة الخطوة السابقة ما زالت ظاهرة: توجيهها البائت أسوأ من رمشة — التجهيز فورًا
    if (msg.idx > 0 && cardShown) prepare()
    else prepTimer = setTimeout(prepare, PREPARING_DELAY_MS)
    armMissing()
  }

  function stopAll() {
    cardShown = false
    clearTimers()
    detach()
    step = null
    ctx = null
    target = null
    view = 'none'
  }

  return {
    handle(msg) {
      if (msg.t === 'train-step') {
        attach()
        start(msg)
        return
      }
      if (msg.t === 'train-stop') {
        stopAll()
        proof = null
        if (msg.reason === 'finished') {
          // بطاقة الإنجاز تظهر ثم تُفكك ذاتيًا — الخلفية أنهت الجلسة فعلًا
          card.finish(total)
        } else {
          card.hide()
        }
      }
    },
    dispose() {
      stopAll()
      card.hide()
    },
  }
}
