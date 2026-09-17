import type { CaptureEvent, CaptureRect } from './protocol'
import { createGesturePacer } from '@dalili/core'

/**
 * إيماءة المستخدم الواحدة — الوحدة الذرّية للالتقاط (بلاغ المالك 2026-09-06).
 *
 * **العلة الجذرية:** سكربت المحتوى كان يستمع لـ`click` و`change` مستقلَّين، فكل حدث
 * DOM يصير خطوة. لكن المتصفح يرسل لنقرة إنسان **واحدة** على زر تبديل حتى ثلاثة
 * أحداث خلال ١-٥ مليّثانية. قياس حيّ في كروم (2026-09-06) على ستة أنماط:
 *
 * | النمط | ما يرسله المتصفح | خطوات قبل هذا الملف |
 * |---|---|---|
 * | A `input[checkbox]` عارٍ | click(input) → change | ٢ |
 * | B checkbox داخل `label` | click(label) → **click(input)** → change | ٣ |
 * | C `label[for]` | click(label) → click(input) → change | ٣ |
 * | D حقل مخفيّ + `span[role=radio]` **شقيق** (claude.ai) | click(span) → change(input) | ٢ |
 * | E `div[role=switch]` بلا حقل | click(div) | ١ ✔ |
 * | F `label` + حقل مُخفى بصريًا | click(label) → click(input) → change | ٣ |
 *
 * الشاهد في قاعدة المالك (الدليل `MtKW5SLkbdRs`): الخطوتان ١ و٢ بمرساةٍ واحدة
 * وفارق ٦٣مث، والخطوات ٩ و١٠ و١١ من نقرة واحدة بفارق ٦مث.
 *
 * **القانون هنا:** إيماءة واحدة = خطوة واحدة، مرساتها وإطارها على العنصر
 * **المرئي** لا على الحقل الضامر — فيصحّ الدليل قراءةً ويصحّ «دربني» تنفيذًا.
 */

/** أصغر ضلع يُعتدّ به مفتاحًا مرئيًا — دونه فالعنصر حقلٌ مخفيّ لا زر */
export const MIN_VISIBLE_PX = 8

/** أقصى صعودٍ في الأسلاف بحثًا عن المفتاح المرئي — أبعد من ذلك حاوية لا زر */
const MAX_ANCESTOR_HOPS = 4

/** أقصى قرابة بين شقيقين لاعتبارهما مفتاحًا واحدًا (حقل مخفيّ + مفتاحه المرسوم) */
const MAX_SIBLING_HOPS = 3

/** أولوية أنواع الأحداث داخل الإيماءة — الأغنى بالمعنى يفوز على النقرة الخام */
const KIND_RANK: Record<string, number> = { select: 3, toggle: 2, input: 1, click: 0 }

/** أنواع أحداث القيمة التي يجوز طيّها في إيماءة نقرة — الكتابة ليست منها (انظر فخ 45) */
const FOLDABLE_VALUE_KINDS = new Set(['toggle', 'select'])

/**
 * هل يصلح المستطيل مفتاحًا مرئيًا (إطارًا على اللقطة أو هدفًا للتدريب)؟
 * الحجم يحكم أولًا: الحقل المخفيّ يقاس {-2,-2,2,2} أو ٢×٢ في أي موضع.
 * والدفع بعيدًا عن الشاشة (`left:-9999px`) يُرفض كذلك. لكن **ما تحت الطيّة يُقبل**:
 * التدريب يمرّر إليه، فبُعده عن العين ليس خفاءً.
 */
export function usableRect(r: CaptureRect): boolean {
  if (r.w < MIN_VISIBLE_PX || r.h < MIN_VISIBLE_PX) return false
  return r.x + r.w > 0 && r.y + r.h > 0
}

function rectOf(el: Element): CaptureRect {
  const r = el.getBoundingClientRect()
  return { x: r.x, y: r.y, w: r.width, h: r.height }
}

/** هل العنصر مرئيٌّ حقًّا بمقاييسه اللحظية؟ */
export function isVisibleControl(el: Element): boolean {
  return usableRect(rectOf(el))
}

/** أسلاف تمثّل المفتاح المرئي لحقلٍ مخفيّ — تُفضَّل على أي حاوية عامة */
const PRESENTATION_SEL = 'label,[role="switch"],[role="checkbox"],[role="radio"],[role="menuitemcheckbox"],[role="menuitemradio"],button,[role="button"]'

/**
 * ما يصلح **شقيقًا** يمثّل حقلًا مخفيًّا: أدوار التبديل والـlabel وحدها — بلا
 * `button` العام. الشقيق ليس رابطة صريحة كالاحتواء، فنضيّق حتى لا يُختطف زرُّ
 * «إلغاء» المجاور مفتاحًا لخانة اختيار.
 */
const SIBLING_SWITCH_SEL = 'label,[role="switch"],[role="checkbox"],[role="radio"],[role="menuitemcheckbox"],[role="menuitemradio"]'

/** أقرب سلفٍ مشترك بين عنصرين، أو null إن تجاوزت القرابة السقف */
function sharesAncestorWithin(a: Element, b: Element, hops: number): boolean {
  let cur: Element | null = a
  for (let i = 0; cur && i <= hops; i++, cur = cur.parentElement) {
    if (cur.contains(b)) return true
  }
  return false
}

/** الـlabel المرتبط بحقلٍ ما — عبر `labels` أو `label[for]` صراحةً */
function labelFor(el: Element): Element | null {
  const labels = (el as HTMLInputElement).labels
  if (labels && labels.length > 0 && labels[0]) return labels[0]
  const id = el.getAttribute('id')
  if (!id) return null
  try {
    return el.ownerDocument.querySelector(`label[for="${CSS.escape(id)}"]`)
  } catch {
    return null
  }
}

/**
 * المفتاح المرئي الذي يمثّل هذا العنصر. الحقل الأصلي (checkbox/radio) كثيرًا ما
 * يكون مخفيًّا بمستطيل ضامر ومعرّفٍ متطاير، بينما ما يراه المستخدم ويضغطه شيء آخر.
 *
 * علة قديمة لم تُغلق: البحث كان **صعودًا في الأسلاف فقط**، وفي نمط claude.ai
 * (النمط D) المفتاح المرئي **شقيق** لا سلف — فيعود الحقل الضامر، فيُرسم الإطار
 * على ٢×٢ خارج الشاشة، وتُبنى المرساة على عنصر لا يمكن للمتدرّب نقره أبدًا.
 *
 * الترتيب: العنصر نفسه إن كان مرئيًا · ثم عناصر الإيماءة (ما ضغطه المستخدم فعلًا —
 * أوثق إشارة على الإطلاق) · ثم الـlabel المرتبط · ثم أقرب سلفٍ مرئي. وإن عزّ الكل
 * فالعنصر نفسه — صدقٌ لا اختراع.
 */
export function visibleRepresentative(el: Element, seen: readonly Element[] = []): Element {
  if (isVisibleControl(el)) return el

  // ① ما ضغطه المستخدم فعلًا في هذه الإيماءة (يحوي العنصر أو يشاركه سلفًا قريبًا)
  for (const cand of seen) {
    if (cand === el || !isVisibleControl(cand)) continue
    if (cand.contains(el) || sharesAncestorWithin(el, cand, MAX_SIBLING_HOPS)) return cand
  }

  // ② الـlabel المرتبط بالحقل — رابطة صريحة في HTML لا تخمين
  const lbl = labelFor(el)
  if (lbl && isVisibleControl(lbl)) return lbl

  // ③ سلفٌ مرئي ذو دلالة مفتاح (label/switch/checkbox/radio/button)
  let container: Element | null = null
  let cur: Element | null = el.parentElement
  for (let hops = 0; cur && hops < MAX_ANCESTOR_HOPS; hops++, cur = cur.parentElement) {
    if (!isVisibleControl(cur)) continue
    if (cur.matches(PRESENTATION_SEL)) return cur
    if (!container) container = cur
  }

  // ④ الشقيق: مفتاح تبديل مرئي **وحيد** داخل أقرب حاوية — الحقل المخفيّ ومفتاحه
  //    المرسوم يسكنان معًا (نمط claude.ai). الوحدانية شرط: التباسٌ = لا تخمين.
  let box: Element | null = el.parentElement
  for (let hops = 0; box && hops < MAX_SIBLING_HOPS; hops++, box = box.parentElement) {
    const cands = Array.from(box.querySelectorAll(SIBLING_SWITCH_SEL)).filter(
      (c) => c !== el && !c.contains(el) && isVisibleControl(c),
    )
    if (cands.length === 1) return cands[0]!
    if (cands.length > 1) break
  }

  // ⑤ وإلا فأقرب حاوية مرئية، وإلا العنصر نفسه — صدقٌ لا اختراع
  return container ?? el
}

/**
 * هل ينتمي حدث القيمة هذا إلى الإيماءة المفتوحة؟
 *
 * **فخ 45 محفوظًا:** القياس الحيّ أعطى `pointerdown@158 → change@160 → click@163` —
 * أي أن تفريغ حقلٍ سابق (blur) يقع **داخل** نافذة نقرة المغادرة. لو طوينا الكتابة
 * في تلك النقرة لتحوّلت «انقر حفظ» إلى «اكتب في الاسم» بصمت. لذلك الكتابة (`input`)
 * لا تنطوي أبدًا؛ والتبديل/الاختيار ينطويان بشرط القرابة لا بشرط الزمن وحده.
 *
 * وقاعدة الشقيق محصورة في **الحقل المخفيّ** حصرًا — فهو سبب وجودها الوحيد. قائمة
 * مرئية تتغيّر بجوار زرٍ يُنقر تبقى خطوتها المستقلة.
 */
export function foldsIntoGesture(el: Element, kind: CaptureEvent['kind'], seen: readonly Element[]): boolean {
  if (!FOLDABLE_VALUE_KINDS.has(kind)) return false
  const hiddenControl = !isVisibleControl(el)
  for (const cand of seen) {
    if (cand === el || cand.contains(el) || el.contains(cand)) return true
    if (hiddenControl && sharesAncestorWithin(el, cand, MAX_SIBLING_HOPS)) return true
  }
  return false
}

/** حدثٌ واحد من الإيماءة مقرونًا بالعنصر الذي وقع عليه */
export interface GestureRecord {
  ev: CaptureEvent
  el: Element
}

/** حصيلة الطيّ: الحدث الناجي، ومفتاحه المرئي، والعنصر الذي جاء منه أصلًا.
 *  تساوي `el === source` تعني «لا انزياح» — فيبقى مسار الالتقاط القديم كما هو حرفيًا. */
export interface FoldedGesture extends GestureRecord {
  source: Element
}

/**
 * يطوي كل أحداث الإيماءة في خطوة واحدة: النوع الأغنى بالمعنى يفوز، والعنصر
 * هو المفتاح المرئي، والختم أبكر ما في الإيماءة (فلا ينقلب ترتيب الخطوات كما كان
 * يحدث حين كانت النقرة تتأخّر ١٦٠مث بينما `change` يُرسل فورًا)، ولقطة الضغط
 * المسبقة تنتقل للناجية أيًّا كان نوعها.
 */
export function foldGesture(records: readonly GestureRecord[]): FoldedGesture | null {
  if (records.length === 0) return null
  let winner = records[0]!
  for (const r of records) {
    if ((KIND_RANK[r.ev.kind] ?? 0) >= (KIND_RANK[winner.ev.kind] ?? 0)) winner = r
  }
  const els = records.map((r) => r.el)
  const el = visibleRepresentative(winner.el, els)
  const ts = records.reduce((min, r) => Math.min(min, r.ev.ts), records[0]!.ev.ts)
  const preTs = records.find((r) => r.ev.preTs !== undefined)?.ev.preTs
  const ev: CaptureEvent = { ...winner.ev, ts, ...(preTs !== undefined ? { preTs } : {}) }
  return { ev, el, source: winner.el }
}

/**
 * نافذة جمع الإيماءة: كم ننتظر بعد آخر حدثٍ قبل أن نعلن أن ضغطة المستخدم انتهت.
 * القياس الحيّ في كروم (2026-09-06): أحداث الضغطة الواحدة تتباعد ١-٦ مليّثانية،
 * وأسوأ ما رُصد في قاعدة المالك ٦٣مث. ستّون هامشٌ كريم دون أن يبتلع ضغطتين.
 */
export const GESTURE_COLLECT_MS = 60

/** سقف عمر الإيماءة مهما تتابعت أحداثها — لا خطوة تُحتجز إلى الأبد (قانون لا تعليق) */
export const GESTURE_MAX_MS = 400

export interface GestureCollector {
  /** ضغطة جديدة: تُفرَّغ السابقة فورًا ثم تُفتح إيماءة نظيفة */
  open(): void
  /** نقرة تنضمّ للإيماءة الجارية (أو تفتح واحدة إن جاءت بلا ضغطة — نقرة برمجية) */
  addClick(ev: CaptureEvent, el: Element): void
  /** حدث قيمة: يعود true إن انطوى في الإيماءة، وfalse إن كان خطوة مستقلّة بذاتها */
  addValue(ev: CaptureEvent, el: Element): boolean
  /** يطوي ما بيده ويُصدره الآن — قبل مغادرة الصفحة أو إيقاف التسجيل أو ضغط Enter */
  flush(): void
  /** هل ثمّة إيماءة مفتوحة؟ وعناصرها — يحتاجها بناء حدث القيمة ليعرف المفتاح المرئي */
  seen(): readonly Element[]
}

/**
 * آلة حالة الإيماءة — **موضع العلة الأصلية**: كان `click` و`change` مستمعَين
 * مستقلَّين يرسل كلٌّ منهما خطوته، فضغطةٌ واحدة تصير خطوتين أو ثلاثًا. استُخرجت
 * هنا لتكون تحت حارس اختبارٍ يعيد تشغيل **تسلسلات الأحداث المقيسة في كروم حقيقي**
 * بدل أن يبقى التوصيل بلا شاهد.
 *
 * النوافذ الزمنيّة (صمت ٦٠مث / سقف ٤٠٠مث) مفوَّضة منذ 2026-09-15 إلى
 * `createGesturePacer` في `@dalili/core` بساعةٍ ومجدولٍ محقونين — المؤقّتات
 * الحقيقيّة تُمرَّر كمحقن، وتوقّعات DOM (`isVisibleControl` ·
 * `visibleRepresentative` · `foldGesture`) تبقى هنا حصرًا.
 */
export function createGestureCollector(
  emit: (folded: FoldedGesture) => void,
  opts: { collectMs?: number; maxMs?: number; now?: () => number } = {},
): GestureCollector {
  const collectMs = opts.collectMs ?? GESTURE_COLLECT_MS
  const maxMs = opts.maxMs ?? GESTURE_MAX_MS
  const now = opts.now ?? (() => Date.now())
  // مفاتيح الإيماءة الحيّة (عناصر DOM) — دفترُ الجامع لا المِضخّة؛ المِضخّة تُعلِم
  // بإغلاق النافذة عبر onFlush فيُمسح الدفتر معها فلا يختلّ الاتّفاق
  let els: Element[] = []
  const pacer = createGesturePacer<GestureRecord>({
    collectMs,
    maxMs,
    now,
    schedule: (fn, ms) => {
      const t = setTimeout(fn, ms)
      return () => clearTimeout(t)
    },
    onFlush(records) {
      els = []
      const folded = foldGesture(records)
      if (folded) emit(folded)
    },
  })

  function add(rec: GestureRecord) {
    pacer.add(rec)
    if (!els.includes(rec.el)) els.push(rec.el)
  }

  return {
    open() {
      pacer.open() // يصرّف المعلَّق فورًا (عبر onFlush) ثم يفتح نافذة نظيفة
    },
    addClick(ev, el) {
      add({ ev, el })
    },
    addValue(ev, el) {
      // نافذة بلا عناصر (= بعد open مباشرة) لا يطويها شيء — كما كان `!open` سابقًا
      if (pacer.seenCount() === 0 || !foldsIntoGesture(el, ev.kind, els)) return false
      add({ ev, el })
      return true
    },
    flush() {
      pacer.flush()
    },
    seen: () => els,
  }
}
