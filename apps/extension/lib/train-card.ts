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
  /** GM-02: تلميح لطيف بلا تقديم */
  wrongHint(title: string): void
  /** بطاقة الإنجاز النهائية — تُفكك ذاتيًا بعد مهلة قصيرة */
  finish(total: number): void
  hide(): void
  onSkip(cb: () => void): void
  onStop(cb: () => void): void
}

const HOST_TAG = 'dalili-train'
const ACCENT = '#EA580C'
const OK = '#3BBD6A'
/** خط اليد: الرقعة العربية مضمّنة في الامتداد — والبدائل المحلية احتياط */
const HAND = `'Aref Ruqaa','Segoe Print','Comic Sans MS',cursive`
const FONT_URL =
  typeof chrome !== 'undefined' && chrome.runtime?.getURL ? chrome.runtime.getURL('fonts/ArefRuqaa-Regular.ttf') : ''
const FONT_FACE = FONT_URL ? `@font-face { font-family:'Aref Ruqaa'; src:url('${FONT_URL}'); font-display:swap; }` : ''
/** حبر مقروء فوق أي خلفية: حد داكن خلف الحروف (paint-order) + هالة — ليست خلفية صندوق */
const HALO = `0 1px 2px rgba(10,14,18,1), 0 0 8px rgba(10,14,18,1), 0 0 18px rgba(10,14,18,.85)`
const INK = `-webkit-text-stroke: 3px rgba(12,16,20,.85); paint-order: stroke fill;`

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
  color: #FFF; font-family: ${HAND}; text-shadow: ${HALO}; ${INK} }
.brand { font-size: 15px; color: #FDBA74; }
.guide { font-size: 13.5px; color: #E8E3D8; opacity: .92; margin-top: 2px; }
.title { font-size: 19px; line-height: 1.75; margin: 6px 0 2px; }
.note { font-size: 15.5px; line-height: 1.8; white-space: pre-wrap; margin: 4px 0; }
.hint { font-size: 15px; margin: 6px 0 2px; }
.miss { font-size: 15px; line-height: 1.8; color: #FDBA74; margin: 6px 0; }
.row { display: flex; align-items: center; gap: 10px; margin-top: 10px; }
.row .count { font-size: 14.5px; opacity: 1; margin-inline-start: auto; }
button.act { pointer-events: auto; cursor: pointer; background: transparent; color: #FFF;
  text-shadow: ${HALO}; ${INK} border: 1.6px solid rgba(255,255,255,.8); border-radius: 999px;
  padding: 5px 14px; font-family: ${HAND}; font-size: 14px; }
button.act:hover { border-color: ${ACCENT}; color: #FDBA74; }
.wrong { position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
  color: #FED7AA; font-family: ${HAND}; font-size: 16px; text-shadow: ${HALO};
  opacity: 0; transition: opacity .15s ease; white-space: nowrap;
  max-width: calc(100vw - 24px); overflow: hidden; text-overflow: ellipsis; }
.wrong.on { opacity: 1; }
.done-card { text-align: center; }
.done-card .big { font-size: 40px; }
.done-card .t { font-size: 24px; color: #6EE7A0; margin: 10px 0 4px; }
.done-card .s { font-size: 15.5px; color: #FFF; opacity: .95; }
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

  function placeNear(el: Element) {
    if (!card || !ring) return
    drawRing(el)
    const r = el.getBoundingClientRect()
    // jsdom وبعض البيئات بلا scrollIntoView — التموضع لا يعتمد عليه
    if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const cardH = card.offsetHeight || 150
    let y = r.y - cardH - 14
    if (y < 10) y = r.bottom + 14
    card.style.top = `${Math.max(10, y)}px`
    const w = card.offsetWidth || 360
    let x = r.x + r.width / 2 - w / 2
    x = Math.min(Math.max(12, x), Math.max(12, window.innerWidth - w - 12))
    card.style.left = `${x}px`
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
    count.textContent = `خطوة ${toArabicDigits(idx + 1)} من ${toArabicDigits(total)}`
    row.append(skip, stop, count)
    return row
  }

  function render(found: Element | null, missing: boolean) {
    if (!card || !ring || !last) return
    seed = hashStr(last.step.id) || 1
    clearTransform()
    card.innerHTML = ''
    const brand = document.createElement('div')
    brand.className = 'brand'
    brand.textContent = 'دربني'
    const guide = document.createElement('div')
    guide.className = 'guide'
    guide.textContent = last.guideTitle
    const title = document.createElement('div')
    title.className = 'title'
    title.textContent = last.step.title
    card.append(brand, guide, title)

    if (found) {
      ring.style.display = ''
      if (last.step.note) {
        const note = document.createElement('p')
        note.className = 'note'
        note.textContent = last.step.note
        card.appendChild(note)
      }
      const hint = document.createElement('p')
      hint.className = 'hint'
      hint.textContent = last.step.kind === 'click' ? 'انقر الزر الذي أحطته بالدائرة' : 'أكمل الإجراء على ما أحاطت به الدائرة'
      card.appendChild(hint)
    } else {
      ring.style.display = 'none'
      const miss = document.createElement('p')
      miss.className = 'miss'
      miss.textContent = missing
        ? 'لم أجد هذا الزر في الصفحة — ربما تغيّرت الواجهة منذ إنشاء الدليل. تخطَّ الخطوة أو أوقف التدريب.'
        : 'أبحث عن الزر في الصفحة… قد تتأخر عناصرها في الظهور'
      card.appendChild(miss)
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
    if (p.target) placeNear(p.target)
    else centerCard()
  }

  function markMissing() {
    if (!last || !card) return
    render(null, true)
    onReposition = null
    if (ring) ring.style.display = 'none'
    centerCard()
  }

  window.addEventListener('scroll', follow, { passive: true, capture: true })
  window.addEventListener('resize', follow)

  function wrongHint(title: string) {
    if (!wrong) return
    wrong.textContent = `ليس هذا الزر — المطلوب: ${title}`
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
    const t = document.createElement('div')
    t.className = 't'
    t.textContent = 'أكملت التدريب'
    const s = document.createElement('div')
    s.className = 's'
    s.textContent = `أنجزت ${toArabicDigits(total)} ${total === 1 ? 'خطوة' : 'خطوات'} بنجاح — عساك على القوة`
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
