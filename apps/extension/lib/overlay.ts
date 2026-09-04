import type { SessionMeta } from './protocol'

/**
 * طبقة العرض داخل الصفحة الهدف — Shadow DOM معزول تمامًا:
 *   • شريط سفلي: حالة التسجيل + عدد الخطوات + وميض «✓» عند كل خطوة (تأكيد حيّ أن الالتقاط يعمل).
 *   • حلقة تأشير برتقالية تحيط بالعنصر تحت المؤشر قبل النقر.
 * كله pointer-events:none فلا يعترض تفاعل المستخدم، ولا يتسرّب لتصميم الصفحة،
 * ويحترم prefers-reduced-motion. لا polling ولا rAF — كل شيء بالأحداث.
 */

export interface Overlay {
  mount(): void
  unmount(): void
  sync(meta: SessionMeta): void
  showRing(rect: { x: number; y: number; w: number; h: number }): void
  hideRing(): void
  /** يخفي الحلقة **ويمنع** ظهورها طوال نافذة الالتقاط (بلاغ «المستطيلان») */
  suppressRing(ms?: number): void
  releaseRing(): void
  /** CAP-13: رد نداء السحب لرسم منطقة الطمس؛ الزر نفسه صار في اللوحة الجانبية */
  onBlurDraw(cb: (rect: { x: number; y: number; w: number; h: number }) => void): void
  /** CAP-13: تفعيل/إطفاء وضع سحب الطمس — يُطلق من زر «طمس» في اللوحة الجانبية */
  setBlurMode(on: boolean): void
  showBlurCount(n: number): void
  blurHint(text: string): void
  /** CAP-15: طيّ الشريط لمقبض صغير والعكس — التسجيل نفسه لا يتوقف */
  toggleHidden(): void
}

const HOST_TAG = 'dalili-overlay'

/**
 * مؤقّت أمان لفكّ كتم الحلقة إن لم يصل إعلان انتهاء الالتقاط (موت عامل الخلفية
 * في MV3 وارد). أطول من نافذة الالتقاط الحقيقية (استقرار ١٦٠ + خنق ٤٥٠ + زمن
 * اللقطة) بهامش كافٍ، وقصير بحيث لا تغيب الحلقة عن المستخدم إن سقط الإعلان.
 */
const RING_SUPPRESS_FALLBACK_MS = 2500
const ACCENT = '#EA580C'
const REC = '#DC2626'

const STYLE = `
:host { all: initial; }
.layer {
  position: fixed; inset: 0; pointer-events: none; z-index: 2147483647;
  direction: rtl; font-family: 'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, sans-serif;
}
.ring {
  position: fixed; box-sizing: border-box;
  border: 2.5px solid ${ACCENT}; border-radius: 8px;
  box-shadow: 0 0 0 3px rgba(234,88,12,0.18);
  opacity: 0; transition: opacity .1s ease, transform .09s ease;
  transform: scale(.98);
}
.ring.on { opacity: 1; transform: scale(1); }
.bar {
  position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%) translateY(14px);
  display: inline-flex; align-items: center; gap: 10px;
  padding: 9px 16px; border-radius: 999px;
  background: #232220; color: #ECEAE4;
  box-shadow: 0 8px 26px rgba(0,0,0,.28), 0 0 0 1px rgba(255,255,255,.06);
  font-size: 13.5px; font-weight: 600; white-space: nowrap; line-height: 1;
  opacity: 0; transition: opacity .18s ease, transform .18s ease;
}
.bar.show { opacity: 1; transform: translateX(-50%) translateY(0); }
.bar.bump { animation: bump .32s ease; }
/* الشريط مؤشر هادئ فقط — لا أزرار عليه بعد اليوم؛ أزرار التحكم في اللوحة الجانبية */
.bar { pointer-events: none; }
.blurcount { color: #FDBA74; font-weight: 700; display: none; }
.blurcount.on { display: inline; }
/* CAP-15: المقبض البديل حين الشريط مطوي */
.peek {
  position: fixed; bottom: 14px; left: 50%; transform: translateX(-50%) translateY(14px);
  pointer-events: auto; cursor: pointer; border: 0;
  background: #232220; color: #ECEAE4; border-radius: 999px; padding: 7px 14px;
  font-family: 'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, sans-serif;
  font-size: 12.5px; font-weight: 700; line-height: 1; white-space: nowrap;
  box-shadow: 0 6px 20px rgba(0,0,0,.25), 0 0 0 1px rgba(255,255,255,.06);
  opacity: 0; transition: opacity .18s ease, transform .18s ease;
}
.peek.show { opacity: 1; transform: translateX(-50%) translateY(0); }
.veil {
  position: fixed; inset: 0; pointer-events: none; cursor: crosshair;
  background: rgba(15,23,42,.06);
}
.veil.on { pointer-events: auto; }
.sel {
  position: fixed; box-sizing: border-box; border: 2px dashed ${ACCENT};
  background: rgba(234,88,12,.12); border-radius: 6px; display: none;
}
.hint {
  position: fixed; top: 14px; left: 50%; transform: translateX(-50%);
  background: #232220; color: #ECEAE4; border-radius: 999px; padding: 8px 16px;
  font-size: 13px; font-weight: 600; box-shadow: 0 6px 20px rgba(0,0,0,.25);
  opacity: 0; transition: opacity .15s ease; pointer-events: none; white-space: nowrap;
}
.hint.on { opacity: 1; }
.dot { width: 9px; height: 9px; border-radius: 50%; background: ${REC}; flex: none; animation: pulse 1.3s infinite; }
.dot.paused { background: ${ACCENT}; animation: none; }
/* VOX-06: مؤشر «ميكروفون ●» — يظهر حين تُسجَّل هذه الجلسة بصوت */
.mic { display: none; color: #FDBA74; font-weight: 700; }
.mic.on { display: inline; }
.n { font-variant-numeric: tabular-nums; }
.check {
  color: #3BBD6A; font-weight: 800; opacity: 0; transform: scale(.4);
  transition: none; margin-inline-start: 2px;
}
.check.pop { animation: pop .6s ease; }
@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: .25 } }
@keyframes bump { 0%,100% { transform: translateX(-50%) translateY(0) scale(1) } 40% { transform: translateX(-50%) translateY(0) scale(1.06) } }
@keyframes pop { 0% { opacity: 0; transform: scale(.4) } 30% { opacity: 1; transform: scale(1.15) } 70% { opacity: 1; transform: scale(1) } 100% { opacity: 0; transform: scale(1) } }
@media (prefers-reduced-motion: reduce) {
  .dot { animation: none } .bar.bump { animation: none } .check.pop { animation: none }
  .ring, .bar { transition: none }
}
`

export function createOverlay(): Overlay {
  let host: HTMLElement | null = null
  let bar: HTMLElement | null = null
  let dot: HTMLElement | null = null
  let label: HTMLElement | null = null
  let count: HTMLElement | null = null
  let check: HTMLElement | null = null
  let ring: HTMLElement | null = null
  /** نافذة الالتقاط: الحلقة ممنوعة من الظهور كي لا تُخبز في البكسل */
  let ringSuppressed = false
  let suppressTimer: ReturnType<typeof setTimeout> | null = null
  let mic: HTMLElement | null = null
  let blurCount: HTMLElement | null = null
  let veil: HTMLElement | null = null
  let sel: HTMLElement | null = null
  let hint: HTMLElement | null = null
  let peek: HTMLButtonElement | null = null
  let lastCount = -1
  let blurDrawCb: ((rect: { x: number; y: number; w: number; h: number }) => void) | null = null
  let dragStart: { x: number; y: number } | null = null
  let popTimer: ReturnType<typeof setTimeout> | null = null
  let bumpTimer: ReturnType<typeof setTimeout> | null = null
  let hintTimer: ReturnType<typeof setTimeout> | null = null
  // CAP-15: الإخفاء قرار المستخدم يصمد عبر أحداث الجلسة، وينقضي بانتهائها
  let hidden = false
  let sessionActive = false

  function mount() {
    if (host) return
    host = document.createElement(HOST_TAG)
    // خارج تدفّق الصفحة تمامًا
    host.style.cssText = 'all: initial; position: fixed; inset: 0; pointer-events: none; z-index: 2147483647;'
    const root = host.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = STYLE
    root.appendChild(style)

    const layer = document.createElement('div')
    layer.className = 'layer'

    ring = document.createElement('div')
    ring.className = 'ring'

    veil = document.createElement('div')
    veil.className = 'veil'
    sel = document.createElement('div')
    sel.className = 'sel'
    hint = document.createElement('div')
    hint.className = 'hint'
    hint.textContent = 'اسحب فوق المنطقة الحساسة — كل منطقة ستُطمس في اللقطات'
    veil.append(sel)

    veil.addEventListener('pointerdown', (e) => {
      dragStart = { x: e.clientX, y: e.clientY }
      veil?.setPointerCapture(e.pointerId)
    })
    veil.addEventListener('pointermove', (e) => {
      if (!dragStart || !sel) return
      const x = Math.min(dragStart.x, e.clientX)
      const y = Math.min(dragStart.y, e.clientY)
      sel.style.display = 'block'
      sel.style.left = `${x}px`
      sel.style.top = `${y}px`
      sel.style.width = `${Math.abs(e.clientX - dragStart.x)}px`
      sel.style.height = `${Math.abs(e.clientY - dragStart.y)}px`
    })
    veil.addEventListener('pointerup', (e) => {
      if (!dragStart) return
      const rect = {
        x: Math.min(dragStart.x, e.clientX),
        y: Math.min(dragStart.y, e.clientY),
        w: Math.abs(e.clientX - dragStart.x),
        h: Math.abs(e.clientY - dragStart.y),
      }
      dragStart = null
      if (sel) {
        sel.style.display = 'none'
        sel.style.width = '0px'
        sel.style.height = '0px'
      }
      if (rect.w >= 8 && rect.h >= 8) blurDrawCb?.(rect)
    })

    bar = document.createElement('div')
    bar.className = 'bar'
    dot = document.createElement('span')
    dot.className = 'dot'
    label = document.createElement('span')
    label.textContent = 'يسجّل الآن'
    mic = document.createElement('span')
    mic.className = 'mic'
    mic.textContent = 'ميكروفون ●'
    count = document.createElement('span')
    count.className = 'n'
    check = document.createElement('span')
    check.className = 'check'
    check.textContent = '✓'
    blurCount = document.createElement('span')
    blurCount.className = 'blurcount'
    peek = document.createElement('button')
    peek.className = 'peek'
    peek.type = 'button'
    peek.textContent = '▴ دليلي'
    peek.setAttribute('aria-label', 'إظهار شريط التسجيل')
    peek.addEventListener('click', () => {
      if (hidden) toggleHidden()
    })
    bar.append(dot, label, mic, count, blurCount, check)

    layer.append(ring, hint, veil, peek, bar)
    root.appendChild(layer)
    document.documentElement.appendChild(host)
  }

  /** CAP-13: وضع السحب — ستار يعترض المؤشر فلا تُلتقط نقرات الصفحة أثناءه */
  function setBlurMode(on: boolean) {
    // لا وضع طمس خارج التسجيل الفعلي (يُطفأ عند الإيقاف المؤقت أو نهاية الجلسة)
    if (on && !sessionActive) return
    veil?.classList.toggle('on', on)
    if (hint) {
      hint.classList.toggle('on', on)
      if (on && hintTimer) clearTimeout(hintTimer)
      if (on) {
        hintTimer = setTimeout(() => hint?.classList.remove('on'), 4000)
      }
    }
    if (!on) hideRing()
  }

  function unmount() {
    if (popTimer) clearTimeout(popTimer)
    if (bumpTimer) clearTimeout(bumpTimer)
    if (hintTimer) clearTimeout(hintTimer)
    host?.remove()
    host = bar = dot = label = count = check = ring = mic = null
    blurCount = null
    veil = null
    sel = null
    hint = null
    peek = null
    lastCount = -1
    hidden = false
    sessionActive = false
  }

  /** CAP-15: طيّ الشريط إلى مقبض صغير والعكس — الجلسة نفسها لا تتأثر إطلاقًا */
  function toggleHidden() {
    hidden = !hidden
    if (!sessionActive) hidden = false
    if (bar) bar.classList.toggle('show', sessionActive && !hidden)
    peek?.classList.toggle('show', sessionActive && hidden)
  }

  function sync(meta: SessionMeta) {
    if (!bar || !dot || !label || !count) return
    const active = meta.state === 'capturing' || meta.state === 'paused'
    sessionActive = active
    if (!active) {
      bar.classList.remove('show')
      hideRing()
      lastCount = -1
      setBlurMode(false)
      if (blurCount) blurCount.classList.remove('on')
      if (mic) mic.classList.remove('on')
      // انتهاء الجلسة ينقضي معه الإخفاء — لا مقبض يتيم على صفحة بلا تسجيل
      hidden = false
      peek?.classList.remove('show')
      return
    }
    const paused = meta.state === 'paused'
    dot.classList.toggle('paused', paused)
    label.textContent = paused ? 'متوقف مؤقتًا' : 'يسجّل الآن'
    // VOX-06: مؤشر الميكروفون يرافق الجلسة المسموعة كاملة (تسجيلًا وإيقافًا مؤقتًا)
    mic?.classList.toggle('on', !!meta.micOn)
    count.textContent = ` · ${meta.stepCount.toLocaleString('ar-EG')} خطوة`
    // CAP-13 معيار القبول ③: الطمس أثناء التسجيل الفعلي فقط — يُطفأ بالإيقاف المؤقت
    if (paused) setBlurMode(false)
    bar.classList.toggle('show', !hidden)

    // وميض التأكيد عند تصاعد العدّاد فقط (لا عند البدء ولا الحذف)
    if (meta.stepCount > lastCount && lastCount >= 0 && !paused) {
      bar.classList.remove('bump')
      void bar.offsetWidth // إعادة تشغيل الأنيميشن
      bar.classList.add('bump')
      if (check) {
        check.classList.remove('pop')
        void check.offsetWidth
        check.classList.add('pop')
      }
      if (bumpTimer) clearTimeout(bumpTimer)
      bumpTimer = setTimeout(() => bar?.classList.remove('bump'), 360)
      if (popTimer) clearTimeout(popTimer)
      popTimer = setTimeout(() => check?.classList.remove('pop'), 640)
    }
    lastCount = meta.stepCount
  }

  function showRing(rect: { x: number; y: number; w: number; h: number }) {
    if (!ring) return
    // نافذة الالتقاط: أي إظهار هنا يُخبز في بكسل اللقطة كإطارٍ ثانٍ حول الزر
    if (ringSuppressed) return
    if (rect.w <= 0 || rect.h <= 0) return hideRing()
    ring.style.transition = '' // استعادة الظهور الناعم (يُلغي الإخفاء الفوري السابق)
    ring.style.left = `${rect.x}px`
    ring.style.top = `${rect.y}px`
    ring.style.width = `${rect.w}px`
    ring.style.height = `${rect.h}px`
    ring.classList.add('on')
  }

  /**
   * إخفاء فوري بلا تلاشٍ — حاسم لسلامة اللقطة: الالتقاط المسبق يقع لحظة الضغط،
   * فلو تلاشت الحلقة خلال .1s لبقيت مخبوزةً في اللقطة كمستطيلٍ ثانٍ حول الزر
   * (علة «مستطيلين»). قطع الانتقال يجعلها تختفي في الإطار نفسه قبل الالتقاط.
   */
  function hideRing() {
    if (!ring) return
    ring.style.transition = 'none'
    ring.classList.remove('on')
  }

  /**
   * بلاغ المالك 2026-09-04 («مستطيلان فوق بعض»، عودة العلة): إخفاء الحلقة مرةً
   * عند الضغط لا يكفي — بين النقرة واللقطة الحيّة نافذةٌ تبلغ ٦٠٠مث (استقرار +
   * خنق)، وأي `mouseover` خلالها يُعيدها: حركة فأر، أو إعادة رسم صفحةٍ تحت
   * مؤشّر ساكن. فتُخبز في البكسل كإطارٍ ثانٍ جامدٍ لا يقبل تحريكًا ولا تلوينًا.
   *
   * الكتم يُقفل الباب طوال النافذة كلها: تُخفى الحلقة **ويُمنع** إظهارها حتى
   * `releaseRing`. ومؤقّت الأمان يفكّه وحده إن مات عامل الخلفية قبل أن يعلن
   * انتهاء الالتقاط — فلا تختفي الحلقة إلى الأبد بصمت.
   */
  function suppressRing(ms = RING_SUPPRESS_FALLBACK_MS) {
    ringSuppressed = true
    hideRing()
    if (suppressTimer !== null) clearTimeout(suppressTimer)
    suppressTimer = setTimeout(() => {
      suppressTimer = null
      ringSuppressed = false
    }, ms)
  }

  function releaseRing() {
    if (suppressTimer !== null) {
      clearTimeout(suppressTimer)
      suppressTimer = null
    }
    ringSuppressed = false
  }

  function onBlurDraw(cb: (rect: { x: number; y: number; w: number; h: number }) => void) {
    blurDrawCb = cb
  }

  function showBlurCount(n: number) {
    if (!blurCount) return
    if (n <= 0) return blurCount.classList.remove('on')
    blurCount.textContent = ` · طمس ${n.toLocaleString('ar-EG')}`
    blurCount.classList.add('on')
  }

  function blurHint(text: string) {
    if (!hint) return
    hint.textContent = text
    hint.classList.add('on')
    if (hintTimer) clearTimeout(hintTimer)
    hintTimer = setTimeout(() => hint?.classList.remove('on'), 3200)
  }

  return {
    mount,
    unmount,
    sync,
    showRing,
    hideRing,
    suppressRing,
    releaseRing,
    onBlurDraw,
    setBlurMode,
    showBlurCount,
    blurHint,
    toggleHidden,
  }
}
