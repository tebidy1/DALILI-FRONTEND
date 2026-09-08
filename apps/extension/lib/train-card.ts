import type { TrainStep } from './protocol'
import { toArabicDigits } from './ar-digits'

/** بطاقة التدريب «دربني» داخل الصفحة الهدف — Shadow DOM معزول مثل شريط التسجيل.
 *  بقرار المالك ٢٠٢٦-٠٨-٣٠: نص بلا خلفية بخط يد (Aref Ruqaa)، وحول الهدف دائرة
 *  بيضاوية غير منتظمة مرسومة كأن يدًا أحاطت الزر بقلم — لا صندوق ولا إطار زاويّ.
 *  البصري هنا والقرار في train-mode؛ كل شيء بالأحداث بلا حلقات. */

export interface TrainCard {
  mount(): void
  unmount(): void
  /** عرض خطوة: target موجود = دائرة + تعليمات؛ null = «أبحث عن الزر» (حل صبور جارٍ) */
  showStep(p: { step: TrainStep; idx: number; total: number; guideTitle: string; target: Element | null }): void
  /** انقضت مهلة البحث ولم يظهر الزر — رسالة صادقة بدل انتظار أبدي */
  markMissing(): void
  /** LX-01: لسنا على الشاشة الهدف بعد (تسجيل دخول/تنقّل) — بطاقة «استعد» وننتظر بالأحداث */
  markWaiting(): void
  /** GM-02: تلميح لطيف بلا تقديم */
  wrongHint(title: string): void
  /** بطاقة الإنجاز النهائية — تُفكك ذاتيًا بعد مهلة قصيرة */
  finish(total: number): void
  hide(): void
  onSkip(cb: () => void): void
  onStop(cb: () => void): void
}

const HOST_TAG = 'dalili-train'
/**
 * ألوان البطاقة موحّدة مع نظام التطبيق (packages/core theme.ts + رموز الويب):
 * جرافيت + أبيض فقط، بلا لون تزييني. بلاغ المالك: النص كان بألوان غير احترافية
 * (برتقالي/أخضر/أبيض بهالة داكنة) — الآن حبر «درجة الأسود» على «ريشة» بيضاء.
 */
const INK = '#2B2A26' // حبر التطبيق الأساسي — «درجة الأسود» الجرافيتية (الآن خلفية الفرشاة)
const WHITE = '#FFFFFF' // «نفس درجة الأبيض المستخدم في التطبيق» — لون الخط بعد عكس الآية
const LINE = '#E7E3DA' // نص ثانوي فاتح على الجرافيت (اسم الدليل) — من رموز التطبيق
const DANGER = '#C4453D' // أحمر وظيفي فقط (تصحيح لطيف) — من نظام اللونين
const ACCENT = '#EA580C' // لون الحلقة حول الزر — مؤشّر انتباه فقط (لم يُطلب تغييره)
/** خط اليد: الرقعة العربية مضمّنة في الامتداد — والبدائل المحلية احتياط */
const HAND = `'Aref Ruqaa','Segoe Print','Comic Sans MS',cursive`
const FONT_URL =
  typeof chrome !== 'undefined' && chrome.runtime?.getURL ? chrome.runtime.getURL('fonts/ArefRuqaa-Regular.ttf') : ''
const FONT_FACE = FONT_URL ? `@font-face { font-family:'Aref Ruqaa'; src:url('${FONT_URL}'); font-display:swap; }` : ''
/**
 * خلفية «الريشة» خلف الجملة (طلب المالك، معكوسة الآن): مسحة فرشاة SVG بحوافّ متموّجة
 * تُمطّ لعرض النص (preserveAspectRatio=none)، وتُنسخ لكل سطر عبر box-decoration-break.
 * المالك عكس الآية: الخلفية جرافيت «درجة الأسود» والخط أبيض — نفس المسار يتغيّر لونه فقط.
 */
const brushUrl = (fillEnc: string) =>
  `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 90' preserveAspectRatio='none'><path fill='${fillEnc}' d='M4 47 C2 33 14 25 34 24 C96 20 150 30 214 24 C252 21 292 26 308 31 C318 34 318 41 316 47 C318 56 310 64 296 66 C244 71 156 60 96 66 C58 69 22 68 12 60 C4 54 4 53 4 47 Z'/></svg>")`
const BRUSH = brushUrl('%232B2A26') // فرشاة جرافيت خلف كل جملة — «درجة الأسود» من نظام التطبيق
const BRUSH_DANGER = brushUrl(`%23${DANGER.slice(1)}`) // فرشاة حمراء وظيفية لتنبيه النقر الخاطئ فقط
/** هالة داكنة رقيقة تُبقي الحرف الأبيض مقروءًا على حافة الفرشاة المتموّجة */
const DARK_HALO = `0 0 2px ${INK}, 0 1px 1px ${INK}`

const STYLE = `
${FONT_FACE}
:host { all: initial; }
.layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647;
  direction: rtl; font-family: ${HAND}; }
svg.ring { position: fixed; overflow: visible; pointer-events: none;
  animation: dalili-pulse 1.9s ease-in-out infinite; }
svg.ring path { fill: none; stroke: ${ACCENT}; stroke-linecap: round; stroke-linejoin: round;
  transition: stroke-dashoffset .9s ease-out; }
svg.ring path.pass2 { opacity: .5; }
@keyframes dalili-pulse { 0%,100% { opacity: 1 } 50% { opacity: .72 } }
.card { position: fixed; pointer-events: auto; width: min(360px, calc(100vw - 24px));
  color: ${WHITE}; font-family: ${HAND}; }
/* خلفية الريشة الجرافيتية خلف كل جملة والخط أبيض — span سطري يُنسخ لكل سطر عند الالتفاف */
.card .brush { -webkit-box-decoration-break: clone; box-decoration-break: clone;
  background-image: ${BRUSH}; background-repeat: no-repeat; background-size: 100% 100%;
  padding: 0.1em 0.42em; text-shadow: ${DARK_HALO}; }
.brand { font-size: 15px; font-weight: 700; }
.guide { font-size: 13.5px; margin-top: 4px; }
.guide .brush { color: ${LINE}; }
.title { font-size: 19px; line-height: 1.95; margin: 8px 0 2px; }
.note { font-size: 15.5px; line-height: 1.95; white-space: pre-wrap; margin: 6px 0; }
.hint { font-size: 15px; line-height: 1.95; margin: 8px 0 2px; }
.miss { font-size: 15px; line-height: 1.95; margin: 8px 0; }
.row { display: flex; align-items: center; gap: 10px; margin-top: 12px; flex-wrap: wrap; }
.row .count { font-size: 14.5px; margin-inline-start: auto; }
button.act { pointer-events: auto; cursor: pointer; background: ${WHITE}; color: ${INK};
  border: 1.5px solid ${INK}; border-radius: 999px; padding: 5px 15px;
  font-family: ${HAND}; font-size: 14px; font-weight: 700;
  box-shadow: 0 1px 3px rgba(43,42,38,.18); transition: background .15s ease, color .15s ease; }
button.act:hover { background: ${INK}; color: ${WHITE}; }
.wrong { position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
  font-family: ${HAND}; font-size: 16px;
  opacity: 0; transition: opacity .15s ease; white-space: nowrap;
  max-width: calc(100vw - 24px); overflow: hidden; text-overflow: ellipsis; }
.wrong .brush { background-image: ${BRUSH_DANGER}; color: ${WHITE}; }
.wrong.on { opacity: 1; }
.done-card { text-align: center; }
.done-card .big { font-size: 40px; filter: drop-shadow(0 1px 2px rgba(43,42,38,.25)); }
.done-card .t { font-size: 24px; margin: 12px 0 6px; }
.done-card .t .brush { font-weight: 700; }
.done-card .s { font-size: 15.5px; }
@media (prefers-reduced-motion: reduce) { svg.ring { animation: none } svg.ring path { transition: none } }
`

export function createTrainCard(): TrainCard {
  let host: HTMLElement | null = null
  let ring: SVGSVGElement | null = null
  let card: HTMLElement | null = null
  let wrong: HTMLElement | null = null
  let skipCb: (() => void) | null = null
  let stopCb: (() => void) | null = null
  let wrongTimer: ReturnType<typeof setTimeout> | null = null
  let finishTimer: ReturnType<typeof setTimeout> | null = null
  let onReposition: (() => void) | null = null
  let last: { step: TrainStep; idx: number; total: number; guideTitle: string } | null = null
  let seed = 1

  function mount() {
    if (host) return
    host = document.createElement(HOST_TAG)
    host.style.cssText = 'all: initial; position: fixed; inset: 0; pointer-events: none; z-index: 2147483647;'
    const root = host.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = STYLE
    root.appendChild(style)
    const layer = document.createElement('div')
    layer.className = 'layer'

    ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    ring.setAttribute('class', 'ring')

    card = document.createElement('div')
    card.className = 'card'

    wrong = document.createElement('div')
    wrong.className = 'wrong'
    wrong.setAttribute('role', 'status')

    layer.append(ring, card, wrong)
    root.appendChild(layer)
    document.documentElement.appendChild(host)
  }

  /** عشوائية مذرّة — الدائرة نفسها تُعاد بنفس شكلها عند إعادة التموضع فلا ترتجف بلا معنى */
  function mulberry32(s: number): () => number {
    let a = s >>> 0
    return () => {
      a |= 0
      a = (a + 0x6d2b79f5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  function hashStr(s: string): number {
    let h = 2166136261
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
    return h >>> 0
  }

  /** مسار بيضاوي مرسوم بيد: نقاط بارجاف محورين، انسياب Q عبر المنصفات،
   *  وإغلاق متجاوز بزاوية عشوائية — حافتا القلم تبقيان ظاهرتين كما تُغلق الدائرة على الورق */
  function sketchOval(w: number, h: number, rnd: () => number): string {
    const cx = w / 2
    const cy = h / 2
    const rx = Math.max(30, w / 2)
    const ry = Math.max(18, h / 2)
    const start = rnd() * Math.PI * 2
    const sweep = Math.PI * 2 + 0.3 + rnd() * 0.55
    const n = 11 + Math.floor(rnd() * 3)
    const pts: [number, number][] = []
    const pt = (ang: number): [number, number] => {
      const jx = 1 + (rnd() - 0.5) * 0.17
      const jy = 1 + (rnd() - 0.5) * 0.17
      return [cx + Math.cos(ang) * rx * jx, cy + Math.sin(ang) * ry * jy]
    }
    for (let i = 0; i <= n; i++) pts.push(pt(start + (i / n) * sweep))
    const mid = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    const f = (v: number) => Math.round(v * 10) / 10
    let d = `M ${f(mid(pts[0]!, pts[1]!)![0]!)} ${f(mid(pts[0]!, pts[1]!)![1]!)}`
    for (let i = 1; i <= n; i++) {
      const nxt = i < n ? mid(pts[i]!, pts[i + 1]!) : pts[n]!
      d += ` Q ${f(pts[i]![0])} ${f(pts[i]![1])} ${f(nxt[0])} ${f(nxt[1])}`
    }
    return d
  }

  /** رسم الدائرة حول العنصر — تمريرتان بقلم واحد؛ العنصر المخفي (rect صفري) لا دائرة له */
  function drawRing(el: Element): boolean {
    if (!ring) return false
    const r = el.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0) {
      ring.style.display = 'none'
      return false
    }
    ring.style.display = ''
    const pad = 16
    const w = r.width + pad * 2
    const h = r.height + pad * 2
    ring.style.left = `${r.x - pad}px`
    ring.style.top = `${r.y - pad}px`
    ring.style.width = `${w}px`
    ring.style.height = `${h}px`
    ring.setAttribute('viewBox', `0 0 ${w} ${h}`)
    ring.innerHTML = ''
    const mk = (cls: string, width: number, offset: number): SVGPathElement => {
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      p.setAttribute('class', cls)
      p.setAttribute('stroke-width', `${width}`)
      p.setAttribute('d', sketchOval(w, h, mulberry32(seed + offset)))
      ring!.appendChild(p)
      return p
    }
    const paths = [mk('', 3.4, 0), mk('pass2', 2.6, 977)]
    // رسم حي: القلم يطارد المسار ثم تستقر الحافتان — getTotalLength غائب في jsdom فيمر صامتًا
    for (const p of paths) {
      if (typeof p.getTotalLength !== 'function') continue
      const len = p.getTotalLength()
      if (!len) continue
      p.style.strokeDasharray = `${len}`
      p.style.strokeDashoffset = `${len}`
      requestAnimationFrame(() => {
        p.style.strokeDashoffset = '0'
      })
    }
    return true
  }

  /**
   * يلصق البطاقة والحلقة بموضع العنصر **الحالي** — يستدعيه `follow` على كل حدث
   * تمرير، فيقرأ المستطيل طازجًا كل مرة (لا إحداثيات بائتة).
   *
   * علة «الأزرار في غير مكانها» (بلاغ المالك، بعد LX-01): كان التمرير
   * `scrollIntoView({behavior:'smooth'})` بداخل هذه الدالة نفسها — فيُعاد إطلاقه
   * على كل نبضة تمرير يطلقها `follow`، فتقاتل الحركةُ نفسها ولا تستقر، وتُحسب
   * البطاقة من مستطيلٍ التُقط قبل ذلك التمرير. تفاقم مع `reuse-here` لأن الصفحة
   * تبدأ مُمرَّرة لموضع عشوائي فيلزم تمرير كبير. الحل: التمرير مرة واحدة عند عرض
   * الخطوة (`scrollTargetIntoView`) وهذه الدالة تُموضِع فقط من مستطيلٍ طازج.
   */
  function placeNear(el: Element) {
    if (!card || !ring) return
    drawRing(el)
    const r = el.getBoundingClientRect()
    const cardH = card.offsetHeight || 150
    let y = r.y - cardH - 14
    if (y < 10) y = r.bottom + 14
    card.style.top = `${Math.max(10, y)}px`
    const w = card.offsetWidth || 360
    let x = r.x + r.width / 2 - w / 2
    x = Math.min(Math.max(12, x), Math.max(12, window.innerWidth - w - 12))
    card.style.left = `${x}px`
  }

  /**
   * تمرير **فوري** (auto) يجلب الهدف لوسط الشاشة قبل حساب الموضع. الفوري يحدّث موضع
   * التمرير تزامنيًا، فيقرأ `placeNear` بعده مستطيلًا **مستقرًّا** ويضع البطاقة والحلقة
   * صحيحًا من أول رسمة — لا سباق مع حركة ناعمة.
   *
   * علة «الخطوات البعيدة في غير مكانها» (بلاغ المالك): مع `behavior:'smooth'` كان
   * الموضع يُحسب أثناء حركة التمرير المتحرّكة، فالخطوات التي تحتاج تمريرًا كبيرًا
   * (٥، ٦، ٩…) تستقرّ على مستطيلٍ لم يصل بعدُ لوجهته، بينما الخطوات الظاهرة أصلًا تصحّ.
   * الحل: تمرير فوري ثم حساب من مستطيلٍ نهائي. (jsdom بلا scrollIntoView — يمرّ صامتًا.)
   */
  function scrollTargetIntoView(el: Element) {
    if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center', behavior: 'auto' })
  }

  function follow() {
    // إعادة تموضع على تخطيط الصفحة الحالي — قانون الاستقرار
    if (onReposition) onReposition()
  }

  function centerCard() {
    if (!card) return
    card.style.top = '18px'
    card.style.left = '50%'
    card.style.transform = 'translateX(-50%)'
  }

  function clearTransform() {
    if (card) card.style.transform = ''
  }

  /** span سطري يحمل خلفية الريشة البيضاء ويحضن الجملة — أساس كل نصوص البطاقة */
  function brushSpan(text: string): HTMLElement {
    const s = document.createElement('span')
    s.className = 'brush'
    s.textContent = text
    return s
  }

  /** سطر نصّي: حاوية كتلية بالصنف المطلوب (تتراص عموديًا) + جملة بخلفية ريشة داخلها */
  function inkLine(cls: string, text: string): HTMLElement {
    const el = document.createElement('div')
    el.className = cls
    el.appendChild(brushSpan(text))
    return el
  }

  function rowButtons(total: number, idx: number): HTMLElement {
    const row = document.createElement('div')
    row.className = 'row'
    const skip = document.createElement('button')
    skip.className = 'act'
    skip.type = 'button'
    skip.textContent = 'تخطي'
    skip.setAttribute('aria-label', 'تخطي هذه الخطوة')
    skip.addEventListener('click', () => skipCb?.())
    const stop = document.createElement('button')
    stop.className = 'act'
    stop.type = 'button'
    stop.textContent = 'إيقاف'
    stop.setAttribute('aria-label', 'إيقاف التدريب')
    stop.addEventListener('click', () => stopCb?.())
    const count = document.createElement('span')
    count.className = 'count'
    count.appendChild(brushSpan(`خطوة ${toArabicDigits(idx + 1)} من ${toArabicDigits(total)}`))
    row.append(skip, stop, count)
    return row
  }

  function render(found: Element | null, missing: boolean) {
    if (!card || !ring || !last) return
    seed = hashStr(last.step.id) || 1
    clearTransform()
    card.innerHTML = ''
    card.append(inkLine('brand', 'دربني'), inkLine('guide', last.guideTitle), inkLine('title', last.step.title))

    if (found) {
      ring.style.display = ''
      if (last.step.note) card.appendChild(inkLine('note', last.step.note))
      card.appendChild(
        inkLine('hint', last.step.kind === 'click' ? 'انقر الزر الذي أحطته بالدائرة' : 'أكمل الإجراء على ما أحاطت به الدائرة'),
      )
    } else {
      ring.style.display = 'none'
      card.appendChild(
        inkLine(
          'miss',
          missing
            ? 'لم أجد هذا الزر في الصفحة — ربما تغيّرت الواجهة منذ إنشاء الدليل. تخطَّ الخطوة أو أوقف التدريب.'
            : 'أبحث عن الزر في الصفحة… قد تتأخر عناصرها في الظهور',
        ),
      )
    }
    card.appendChild(rowButtons(last.total, last.idx))
  }

  function showStep(p: { step: TrainStep; idx: number; total: number; guideTitle: string; target: Element | null }) {
    mount()
    if (finishTimer) clearTimeout(finishTimer)
    if (!card || !ring) return
    last = { step: p.step, idx: p.idx, total: p.total, guideTitle: p.guideTitle }
    render(p.target, false)
    onReposition = p.target ? () => placeNear(p.target!) : null
    if (p.target) {
      scrollTargetIntoView(p.target) // أولًا تمرير فوري يُثبّت موضع الهدف تزامنيًا
      placeNear(p.target) // ثم نضع من مستطيلٍ مستقرّ — صحيح من أول رسمة؛ follow يتابع تمرير المستخدم لاحقًا
    } else centerCard()
  }

  function markMissing() {
    if (!last || !card) return
    render(null, true)
    onReposition = null
    if (ring) ring.style.display = 'none'
    centerCard()
  }

  /** LX-01: بطاقة «استعد» — لسنا على الشاشة الهدف بعد؛ نرشد للدخول/التنقّل وننتظر بالأحداث */
  function markWaiting() {
    if (!last || !card) return
    clearTransform()
    if (ring) ring.style.display = 'none'
    onReposition = null
    card.innerHTML = ''
    const wait = inkLine('miss', 'لم نصل إلى الشاشة المطلوبة بعد — سجّل الدخول وانتقل إليها وسيبدأ التدريب تلقائيًا.')
    // في الانتظار «إيقاف» فقط — لا تخطٍّ لخطوة لم تبدأ
    const row = document.createElement('div')
    row.className = 'row'
    const stop = document.createElement('button')
    stop.className = 'act'
    stop.type = 'button'
    stop.textContent = 'إيقاف'
    stop.setAttribute('aria-label', 'إيقاف التدريب')
    stop.addEventListener('click', () => stopCb?.())
    row.append(stop)
    card.append(inkLine('brand', 'دربني'), inkLine('guide', last.guideTitle), inkLine('title', last.step.title), wait, row)
    centerCard()
  }

  window.addEventListener('scroll', follow, { passive: true, capture: true })
  window.addEventListener('resize', follow)

  function wrongHint(title: string) {
    if (!wrong) return
    wrong.innerHTML = ''
    wrong.appendChild(brushSpan(`ليس هذا الزر — المطلوب: ${title}`))
    wrong.classList.add('on')
    if (wrongTimer) clearTimeout(wrongTimer)
    wrongTimer = setTimeout(() => wrong?.classList.remove('on'), 2600)
  }

  function finish(total: number) {
    mount()
    if (!card || !ring) return
    ring.style.display = 'none'
    last = null
    onReposition = null
    card.className = 'card done-card'
    card.style.top = '42%'
    card.style.left = '50%'
    card.style.transform = 'translate(-50%, -50%)'
    card.innerHTML = ''
    const big = document.createElement('div')
    big.className = 'big'
    big.textContent = '🎉'
    const t = inkLine('t', 'أكملت التدريب')
    const s = inkLine('s', `أنجزت ${toArabicDigits(total)} ${total === 1 ? 'خطوة' : 'خطوات'} بنجاح — عساك على القوة`)
    card.append(big, t, s)
    if (finishTimer) clearTimeout(finishTimer)
    finishTimer = setTimeout(hide, 4500)
  }

  function hide() {
    if (wrongTimer) clearTimeout(wrongTimer)
    if (finishTimer) clearTimeout(finishTimer)
    onReposition = null
    last = null
    host?.remove()
    host = null
    ring = card = wrong = null
  }

  function unmount() {
    hide()
  }

  return {
    mount,
    unmount,
    showStep,
    markMissing,
    markWaiting,
    wrongHint,
    finish,
    hide,
    onSkip(cb) {
      skipCb = cb
    },
    onStop(cb) {
      stopCb = cb
    },
  }
}
