/** بطاقات تعريف الأزرار (AUTO-01) — سلسلة مرشّحين لكل عنصر تُلتقط وقت التسجيل،
 *  ويحلّها وضع التدريب «دربني» في الصفحة الهدف: أول مرشح فريد يفوز.
 *  نقي تمامًا: وصف العنصر DTO يبنيه سكربت المحتوى، والحل يجري فوق منفذ محقون
 *  يطابق **مرشّحًا** لا محدِّد CSS — فمحوّل UIA في تطبيق الديسكتوب لا يحلّل CSS أبدًا. */

export type AnchorCandidate =
  | { k: 'id'; v: string }
  | { k: 'testid'; v: string }
  | { k: 'aria'; v: string }
  | { k: 'name'; v: string }
  | { k: 'text'; v: string }
  | { k: 'path'; v: string }
  /** UIA AutomationId — أقوى مرساة على الديسكتوب (نظير id في الويب) */
  | { k: 'automationId'; v: string }
  /** UIA ControlType (Button، Edit…) — مُضيِّق ضعيف وحده، يأتي قبل المسار */
  | { k: 'controlType'; v: string }
  /** ث١: تسمية الحقل (label/aria-labelledby/رأس العمود) — **متحقِّق لا باحث**: يؤكّد المحلول أو يناقضه */
  | { k: 'label'; v: string }
  /** ث١: سياق العنصر (عنوان النافذة أو النموذج) — متحقِّق لا باحث */
  | { k: 'ctx'; v: string }

export type AnchorChain = AnchorCandidate[]

/** وصف العنصر كما يستخرجه سكربت المحتوى — بلا أي DOM هنا */
export interface AnchorElInfo {
  tag: string
  id?: string
  /** data-testid */
  testid?: string
  ariaLabel?: string
  /** سمة name للحقول */
  name?: string
  /** نص العنصر المرئي */
  text?: string
  /** مسار nth-of-type كامل من أقرب سلف — يبنيه سكربت المحتوى (الملاذ الأخير) */
  path?: string
  /** UIA AutomationId — يملؤه قارئ الديسكتوب وحده؛ الويب لا يمرّره */
  automationId?: string
  /** UIA ControlType — يملؤه قارئ الديسكتوب وحده */
  controlType?: string
  /** ث١: تسمية الحقل المرئية */
  label?: string
  /** ث١: عنوان النافذة/النموذج الذي يحوي العنصر */
  ctx?: string
}

/** أقصى طول لنص المرساة — أزرار بأوصاف أطول تُطابَق بقصّها بالطريقة نفسها وقت الحل */
const TEXT_CAP = 80

/**
 * معرّفات يولّدها إطار العمل تلقائيًا وتتغيّر بين كل تحميلٍ وآخر — سمّها «متطايرة».
 * علة حقيقية (بلاغ المالك): React `useId` (مثل `_r_6_`، `_r_u0_`) وBase UI
 * (`base-ui-_r_pu_`) كانت تُلتقط كأقوى مرساة (id) وتُحقن في المسار، فعلى صفحة التدريب
 * الطازجة إمّا لا تطابق شيئًا أو — الأسوأ — يُسنِد الإطار المعرّف نفسه لعنصرٍ **آخر**
 * في الموضع نفسه من الشجرة فتطابق «فريدًا» خطأً → تُحاط دائرة الزر الخطأ. الحل:
 * نعامل هذه المعرّفات كأن العنصر بلا id، فتسقط المرساة لإشارات مستقرّة (نص/aria/مسار بنيوي).
 */
const EPHEMERAL_ID_PATTERNS: RegExp[] = [
  /_r_[a-z0-9]+_/i, // React useId مُعقَّم (يشمل المسبوق: base-ui-_r_pu_)
  /:r[a-z0-9]+:/i, // React useId الخام «:r0:» (تضمّنه Radix/Headless أيضًا)
  /^radix-/i, // Radix UI
  /^headlessui-/i, // Headless UI
  /^react-aria-?\d/i, // React Aria
  /^mui-\d/i, // MUI
  /^downshift-\d/i, // Downshift
]

/** هل المعرّف متولَّد متطايرًا (لا يُوثَّق به عبر الجلسات)؟ — نقي، يُستخدم التقاطًا وحلًّا */
export function isEphemeralId(id: string | undefined | null): boolean {
  const v = id?.trim() ?? ''
  if (!v) return false
  return EPHEMERAL_ID_PATTERNS.some((re) => re.test(v))
}

/** هل يحوي المسار مقطع معرّفٍ متطاير (`[id="_r_.._"]`)؟ — لا يُوثَّق به وقت الحل */
function pathHasEphemeralId(path: string): boolean {
  return EPHEMERAL_ID_PATTERNS.some((re) => re.test(path))
}

/** تطبيع النص المرساة — الدالة ذاتها وقت الالتقاط ووقت الحل فلا انزياح بينهما */
export function anchorNormText(s: string): string {
  const clean = s.replace(/\s+/g, ' ').trim()
  return clean.length > TEXT_CAP ? clean.slice(0, TEXT_CAP - 1) + '…' : clean
}

/** بناء سلسلة المرشحين بترتيب الأولوية الملزم:
 *  id → automationId → testid → aria → name → نص → controlType → مسار */
export function buildAnchorChain(info: AnchorElInfo): AnchorChain {
  const chain: AnchorChain = []
  const push = (k: AnchorCandidate['k'], raw: string | undefined, minLen = 1) => {
    const v = raw?.trim() ?? ''
    if (v.length >= minLen) chain.push({ k, v } as AnchorCandidate)
  }
  // المعرّف المتطاير يُسقَط كأن العنصر بلا id — فتبقى المرساة مستقرّة (testid/aria/نص/مسار)
  push('id', isEphemeralId(info.id) ? undefined : info.id)
  push('automationId', info.automationId)
  push('testid', info.testid)
  push('aria', info.ariaLabel)
  push('name', info.name)
  const text = anchorNormText(info.text ?? '')
  if (text.length >= 2) chain.push({ k: 'text', v: text })
  // المتحقِّقان مطبّعان بالدالة نفسها وقت الحل — حرفان على الأقل وإلا فضجيج
  for (const k of ['label', 'ctx'] as const) {
    const v = anchorNormText(info[k] ?? '')
    if (v.length >= 2) chain.push({ k, v })
  }
  push('controlType', info.controlType)
  push('path', info.path)
  return chain
}

/** تهريب قيمة داخل محدّد سمة — علامة الاقتباس والشرطة الخلفية فقط */
function escAttr(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/** المحدّد الخام لمرشح (مرشح النص يُعالَج بالترشيح لا بالمحدِّد — انظر TEXT_ANCHOR_SEL).
 *  مرشّحا UIA لا مقابل CSS لهما ⇐ null صريح لا محدِّد مخترَع */
export function anchorToSelector(c: AnchorCandidate): string | null {
  switch (c.k) {
    case 'automationId':
    case 'controlType':
    case 'label':
    case 'ctx':
      return null
    case 'id':
      return `[id="${escAttr(c.v)}"]`
    case 'testid':
      return `[data-testid="${escAttr(c.v)}"]`
    case 'aria':
      return `[aria-label="${escAttr(c.v)}"]`
    case 'name':
      return `[name="${escAttr(c.v)}"]`
    case 'path':
      return c.v
    case 'text':
      return TEXT_ANCHOR_SEL
  }
}

/**
 * عناصر تُطابَق بنصها — نص المرساة معنى للأزرار والروابط لا لأي فقرة في الصفحة.
 * علة «الخطوة الأخيرة لا تُظهر عنصرًا» (بلاغ المالك): القائمة كانت تُغفل أدوارًا
 * تفاعلية شائعة في القوائم الحديثة — أبرزها `menuitemradio` (اختيار النموذج مثلًا) —
 * فيسقط المرساة النصية الوحيدة المستقرّة لعنصرٍ معرّفه متطاير، فلا يُحل أبدًا. القائمة
 * الآن موحّدة مع أدوار pick.ts التفاعلية التي يُعرّفها نصها المرئي.
 */
export const TEXT_ANCHOR_SEL = [
  'a',
  'button',
  'summary',
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="menuitemradio"]',
  '[role="menuitemcheckbox"]',
  '[role="option"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="treeitem"]',
  'input[type="submit"]',
  'input[type="button"]',
].join(',')

/**
 * منفذ الحل — يعيد العناصر المطابقة **لمرشّح واحد**، والنواة تحكم بالفرادة.
 * لا CSS في الواجهة: الويب يبنيه بـcssAnchorFinder، والديسكتوب يبني IUIAutomationCondition مباشرة.
 */
export interface AnchorDom<E> {
  find(c: AnchorCandidate): E[]
  /** نص العنصر المرئي — يكشف تناقض مرشّحٍ مع نص الخطوة. اختياري: محوّل بلا نص لا يُفحص */
  textOf?(el: E): string
  /** تضييق مطابقاتٍ ملتبسة (المرئي وحده مثلًا) — اختياري؛ يعيد المجموعة كما هي إن لم يحسم */
  narrow?(els: E[]): E[]
  /** ث١: تسمية العنصر — تتحقق من مرشّح label. اختياري: غيابه = لا حكم */
  labelOf?(el: E): string
  /** ث١: سياق العنصر — يتحقق من مرشّح ctx. اختياري */
  ctxOf?(el: E): string
}

/** محوّل الويب: مرشّح ← محدِّد CSS، ومرشّح النص ← عناصر TEXT_ANCHOR_SEL بنصها المطبَّع */
export function cssAnchorFinder<E>(select: (sel: string) => E[], textOf: (el: E) => string): AnchorDom<E> {
  return {
    textOf,
    find(c) {
      if (c.k === 'text') {
        const want = anchorNormText(c.v)
        return select(TEXT_ANCHOR_SEL).filter((el) => anchorNormText(textOf(el)) === want)
      }
      const sel = anchorToSelector(c)
      return sel === null ? [] : select(sel)
    },
  }
}

/** ث١: ثقة الحلّ — عالية تُرسم، متوسطة تُسأل «هل ترى؟»، منخفضة تُعامل كغير موجود (محجوزة: الحلّ لا ينتجها اليوم) */
export type AnchorConfidence = 'high' | 'medium' | 'low'

/** أقل عدد إشارات متفقة على العنصر لثقة عالية (باحثة تتضمّنه + متحقِّقات توافقه) */
export const CONFIDENCE_HIGH_MIN_SIGNALS = 2

export interface AnchorHit<E> {
  el: E
  /** فهرس المرشح الفائز — للتشخيص: أي بطاقة من السلسلة نجحت */
  via: number
  confidence: AnchorConfidence
}

/** مرشّحات المعنى — مطابقتها **الفريدة** حجة على هوية العنصر لا على موضعه */
const SEMANTIC_FINDERS = new Set<AnchorCandidate['k']>(['aria', 'testid', 'automationId', 'id', 'name', 'text'])

/**
 * ث١: درجة ثقة الفائز.
 *  - الدعم = باحثات **فريدة** تطابقه وحده + متحقِّقات (نص/تسمية/سياق) توافقه. مجموعة متعددة لا تدعم:
 *    `name` يطابق كل صفوف الجدول لا يميّز الصف (مراجعة I7، علة GM-08) — وتسمية العمود توافق الصفوف كلها.
 *  - عالية = باحث معنى فريد + إشارة ثانية + بلا تناقض + بلا حسم بالإجماع.
 *  - التناقض (تسمية أو سياق مختلف) يحدّها بمتوسطة لا منخفضة: اسم السجل ولغة الواجهة تتغيّر والزر
 *    صحيح (مراجعة C1) — نسأل الموظف بدل أن نعلن الفقد.
 */
function confidenceOf<E>(el: E, chain: AnchorChain, sets: Array<{ via: number; els: E[] }>, dom: AnchorDom<E>, byConsensus: boolean): AnchorConfidence {
  let support = 0
  let strong = false
  for (const { via, els } of sets) {
    if (els.length !== 1 || els[0] !== el) continue
    support++
    if (SEMANTIC_FINDERS.has(chain[via]!.k)) strong = true
  }
  const textSingleton = sets.some(({ via, els }) => chain[via]!.k === 'text' && els.length === 1 && els[0] === el)
  const readers: Partial<Record<AnchorCandidate['k'], ((e: E) => string) | undefined>> = { text: dom.textOf, label: dom.labelOf, ctx: dom.ctxOf }
  let contradicted = false
  for (const c of chain) {
    const read = readers[c.k]
    if (!read) continue
    const have = anchorNormText(read(el))
    if (!have) continue
    if (have !== anchorNormText(c.v)) contradicted = true
    else if (!(c.k === 'text' && textSingleton)) support++ // النص الفريد حُسب باحثًا — لا مرّتين
  }
  return strong && support >= CONFIDENCE_HIGH_MIN_SIGNALS && !contradicted && !byConsensus ? 'high' : 'medium'
}

/**
 * حلّ المرساة على مرحلتين — صدق لا تخمين في كلتيهما.
 *
 * ① أول مرشح فريد يفوز (الملتبس يضيّقه المنفذ إن استطاع)، **ما لم يناقض نصَّ الخطوة**.
 *    علة أودو (2026-10-31): خيارات الإكمال التلقائي معرّفاتها موضعية (`autocomplete_0_0`
 *    = «الخيار الأول» أيًّا كان) — فطابقت فريدًا خيارًا آخر وأحاطته الدائرة.
 * ② إجماع: إن لم يحسم مرشّح وحده، فالعنصر الذي تلتقي عليه مرشّحات أكثر (اثنان على الأقل،
 *    وموافقة النص تُعدّ صوتًا) يفوز. صفوف الجداول مثال: `name` العمود يطابق كل الصفوف،
 *    والمسار يطابق صفًّا بموضعه — تقاطعهما أو النص يحسم. التعادل بلا نص يحسم = لا حل.
 */
export function resolveAnchor<E>(chain: AnchorChain, dom: AnchorDom<E>): AnchorHit<E> | null {
  const textCand = chain.find((c) => c.k === 'text')
  const want = textCand ? anchorNormText(textCand.v) : ''
  /** يوافق النص: نعم/لا، أو null حين لا حكم (لا نص في السلسلة، أو المحوّل/العنصر بلا نص كالحقول) */
  const agrees = (el: E): boolean | null => {
    if (!want || !dom.textOf) return null
    const have = anchorNormText(dom.textOf(el))
    return have ? have === want : null
  }
  const narrow = (els: E[]): E[] => {
    if (els.length <= 1 || !dom.narrow) return els
    const n = dom.narrow(els)
    return n.length > 0 ? n : els
  }

  const sets: Array<{ via: number; els: E[] }> = []
  let early: { el: E; via: number } | null = null
  for (let i = 0; i < chain.length; i++) {
    const c = chain[i]
    if (!c) continue
    // حماية الأدلة القديمة: مرشّح مبنيّ على معرّفٍ متطاير قد يطابق عنصرًا خاطئًا «فريدًا» — نتجاوزه
    if (c.k === 'id' && isEphemeralId(c.v)) continue
    if (c.k === 'path' && pathHasEphemeralId(c.v)) continue
    if (c.k === 'label' || c.k === 'ctx') continue // متحقِّقان لا باحثان
    const matches = narrow(dom.find(c))
    if (matches.length === 0) continue
    sets.push({ via: i, els: matches })
    const only = matches[0]
    // الفائز الفريد يُحسم هنا، لكن المسح يكمل: ثقته تُحسب من السلسلة كلها
    if (!early && matches.length === 1 && only !== undefined && agrees(only) !== false) early = { el: only, via: i }
  }
  if (early) return { ...early, confidence: confidenceOf(early.el, chain, sets, dom, false) }

  // ② الإجماع — العناصر المناقضة للنص مستبعدة أصلًا
  const score = new Map<E, { n: number; via: number }>()
  for (const { via, els } of sets) {
    for (const el of els) {
      if (agrees(el) === false) continue
      const s = score.get(el)
      if (s) s.n++
      else score.set(el, { n: 1, via })
    }
  }
  const textSet = textCand ? sets.find((s) => chain[s.via] === textCand)?.els : undefined
  for (const [el, s] of score) if (agrees(el) === true && !textSet?.includes(el)) s.n++
  let best = 0
  for (const s of score.values()) best = Math.max(best, s.n)
  if (best < 2) return null
  const top = [...score.entries()].filter(([, s]) => s.n === best)
  // تعادلٌ بين عناصر كلها توافق نص الخطوة = متكافئة للمتدرّب (خلايا العميل نفسه) — الأول
  if (top.length === 1 || top.every(([el]) => agrees(el) === true)) {
    const [el, s] = top[0]!
    return { el, via: s.via, confidence: confidenceOf(el, chain, sets, dom, true) }
  }
  return null
}
