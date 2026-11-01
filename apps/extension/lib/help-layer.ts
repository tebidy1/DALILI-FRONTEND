import type { NoteDto, NoteStepDto } from '@dalili/shared'
import { t } from './i18n'
import { placeCardNear } from './train-card'
import { toArabicDigits } from './ar-digits'

/** هـ ج١ (HLP) طبقة «ما هذا؟» داخل الصفحة — مضيف dalili-help في Shadow DOM معزول:
 *  إطار يتبع الماوس، ونقاط على الأزرار المشروحة وإبراز المختار (للشريك)، وبطاقة
 *  الموظف بحالاتها الأربع. هادئة بلا لون إنذار (التصميم §٥.٣)، والتموضع حساب
 *  بطاقة دربني نفسه. */

export const HELP_HOST = 'dalili-help'

/** ألوان هوية التطبيق (theme.ts): الأزرق الرسمي والجرافيت */
const BRAND = '#16324F'
const INK = '#2B2A26'
const LINE = '#E7E3DA'
const MUTED = '#5B6770'

const STYLE = `
:host { all: initial; }
.layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483646; direction: rtl; }
.frame { position: fixed; border: 2px solid ${BRAND}; border-radius: 8px; pointer-events: none;
  box-shadow: 0 0 0 3px rgba(22,50,79,.12); display: none; }
.hl { position: fixed; border: 3px solid ${BRAND}; border-radius: 10px; pointer-events: none;
  box-shadow: 0 0 0 3px rgba(22,50,79,.18); display: none; }
.dot { position: fixed; width: 11px; height: 11px; border-radius: 50%; background: ${BRAND};
  border: 2px solid #fff; box-shadow: 0 1px 3px rgba(15,30,46,.35); pointer-events: none; }
.card { position: fixed; pointer-events: auto; width: min(340px, calc(100vw - 24px));
  background: #fff; color: ${INK}; border: 1px solid ${LINE}; border-radius: 14px;
  box-shadow: 0 10px 30px rgba(15,30,46,.16); padding: 14px 16px 12px;
  font-family: system-ui, 'Segoe UI', Tahoma, sans-serif; font-size: 14px; line-height: 1.75; }
.card .brand { font-size: 12px; font-weight: 700; color: ${BRAND}; letter-spacing: .2px; margin-bottom: 2px; }
.card .body { font-size: 16px; font-weight: 650; white-space: pre-wrap; }
.card .partner { display: flex; align-items: center; gap: 8px; margin-top: 8px; color: ${MUTED}; font-size: 13px; }
.card .partner img { width: 22px; height: 22px; border-radius: 6px; object-fit: cover; }
.card .muted { color: ${MUTED}; }
.card .row { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
.card button { pointer-events: auto; cursor: pointer; background: ${BRAND}; color: #fff; border: none;
  border-radius: 999px; padding: 6px 16px; font: inherit; font-size: 13.5px; font-weight: 600; }
.card button.ghost { background: #fff; color: ${BRAND}; border: 1.5px solid ${BRAND}; }
`

export interface HelpLayer {
  mount(): void
  /** إطار التأشير يتبع الماوس — null يخفيه */
  frame(el: Element | null): void
  /** نقاط الشريك على الأزرار المشروحة */
  dots(els: Element[]): void
  /** إبراز ثابت للزر المختار (وضع الكتابة) */
  highlight(el: Element | null): void
  /** بطاقة الشرح: جملة الشريك واسمه، و«افتح الدليل»/«دربني» إن رُبط بدليل */
  showNote(n: NoteDto, el: Element, onOpen?: () => void, onTrain?: () => void): void
  /** «هذا الزر في دليل…» مع «افتح» و«دربني» */
  showStep(s: NoteStepDto, el: Element, onOpen: () => void, onTrain: () => void): void
  /** «لا شرح بعد» و«اطلب شرحاً» إن كان العنصر عنصر تحكّم يُسأل عنه */
  showNone(el: Element, offerRequest: boolean, onRequest: () => void): void
  /** وصل الجواب من اللوحة — البطاقة الحالية تصير تأكيد الوصول */
  markRequested(): void
  /** الحد الصادق: جزء لا نرى داخله */
  showLimit(el: Element): void
  dispose(): void
}

const rectOf = (el: Element) => el.getBoundingClientRect()
const place = (box: HTMLElement, r: DOMRect, pad = 0) => {
  box.style.display = ''
  box.style.left = `${r.x - pad}px`
  box.style.top = `${r.y - pad}px`
  box.style.width = `${r.width + pad * 2}px`
  box.style.height = `${r.height + pad * 2}px`
}

export function createHelpLayer(): HelpLayer {
  let host: HTMLElement | null = null
  let root: ShadowRoot | null = null
  let frameEl: HTMLElement | null = null
  let hlEl: HTMLElement | null = null
  let card: HTMLElement | null = null
  let dotEls: HTMLElement[] = []
  let notedEls: Element[] = []
  let cardAnchor: Element | null = null
  let onReposition: (() => void) | null = null

  const follow = () => onReposition?.()

  function mount() {
    if (host) return
    host = document.createElement(HELP_HOST)
    host.style.cssText = 'all: initial;'
    root = host.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = STYLE
    root.appendChild(style)
    const layer = document.createElement('div')
    layer.className = 'layer'
    frameEl = document.createElement('div')
    frameEl.className = 'frame'
    hlEl = document.createElement('div')
    hlEl.className = 'hl'
    card = document.createElement('div')
    card.className = 'card'
    layer.append(frameEl, hlEl, card)
    root.appendChild(layer)
    document.documentElement.appendChild(host)
    window.addEventListener('scroll', follow, { passive: true, capture: true })
    window.addEventListener('resize', follow)
  }

  /** يُستدعى مع كل تمرير: القياسات كلها أولًا ثم الكتابة (قراءة بعد كتابة تفرض إعادة تخطيط
   *  الصفحة كلها لكل نقطة)، والعقد القائمة تُعاد موضعتها لا تُهدم وتُبنى */
  function placeDots() {
    const rects = notedEls.filter((el) => el.isConnected).map(rectOf)
    const layer = root?.querySelector('.layer')
    while (dotEls.length > rects.length) dotEls.pop()!.remove()
    while (layer && dotEls.length < rects.length) {
      const d = document.createElement('div')
      d.className = 'dot'
      layer.appendChild(d)
      dotEls.push(d)
    }
    dotEls.forEach((d, i) => {
      const r = rects[i]!
      d.style.left = `${Math.max(0, r.right - 12)}px`
      d.style.top = `${Math.max(0, r.y - 6)}px`
    })
  }

  /** بطاقة جديدة قرب عنصر — التموضع حساب دربني، ويُعاد على التمرير من مستطيل طازج */
  function cardNear(el: Element, build: (c: HTMLElement) => void) {
    if (!card) return
    cardAnchor = el
    card.innerHTML = ''
    card.className = 'card'
    build(card)
    placeCardNear(card, el)
    onReposition = () => {
      if (cardAnchor?.isConnected && card) placeCardNear(card, cardAnchor)
      placeDots()
    }
  }

  const btn = (label: string, onClick: () => void, ghost = false): HTMLButtonElement => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = ghost ? 'ghost' : ''
    b.textContent = label
    b.addEventListener('click', onClick)
    return b
  }

  const brandLine = () => {
    const b = document.createElement('div')
    b.className = 'brand'
    b.textContent = t('ext.helpBrand')
    return b
  }

  return {
    mount,
    frame(el) {
      if (!frameEl) return
      if (!el) {
        frameEl.style.display = 'none'
        return
      }
      const r = rectOf(el)
      if (r.width <= 0 && r.height <= 0) {
        frameEl.style.display = 'none'
        return
      }
      place(frameEl, r, 3)
    },
    dots(els) {
      notedEls = els
      placeDots()
    },
    highlight(el) {
      if (!hlEl) return
      if (!el) {
        hlEl.style.display = 'none'
        return
      }
      place(hlEl, rectOf(el), 4)
      onReposition = () => {
        if (el.isConnected && hlEl) place(hlEl, rectOf(el), 4)
        placeDots()
      }
    },
    showNote(n, el, onOpen, onTrain) {
      cardNear(el, (c) => {
        c.appendChild(brandLine())
        const body = document.createElement('div')
        body.className = 'body'
        body.textContent = n.body
        c.appendChild(body)
        const p = document.createElement('div')
        p.className = 'partner'
        if (n.partner.logoUrl) {
          const img = document.createElement('img')
          img.alt = ''
          img.src = n.partner.logoUrl
          p.appendChild(img)
        }
        const name = document.createElement('span')
        name.textContent = n.partner.name
        p.appendChild(name)
        c.appendChild(p)
        if (n.guide && (onOpen || onTrain)) {
          const row = document.createElement('div')
          row.className = 'row'
          if (onOpen) row.appendChild(btn(t('ext.helpOpenGuide'), onOpen))
          if (onTrain) row.appendChild(btn(t('ext.helpTrain'), onTrain, true))
          c.appendChild(row)
        }
      })
    },
    showStep(s, el, onOpen, onTrain) {
      cardNear(el, (c) => {
        c.appendChild(brandLine())
        const line = document.createElement('div')
        line.className = 'body'
        line.textContent = t('ext.helpInGuide', { title: s.title, n: toArabicDigits(s.no) })
        c.appendChild(line)
        const row = document.createElement('div')
        row.className = 'row'
        row.append(btn(t('ext.helpOpen'), onOpen), btn(t('ext.helpTrain'), onTrain, true))
        c.appendChild(row)
      })
    },
    showNone(el, offerRequest, onRequest) {
      cardNear(el, (c) => {
        c.appendChild(brandLine())
        const line = document.createElement('div')
        line.className = 'body'
        line.textContent = t('ext.helpNoNote')
        c.appendChild(line)
        if (offerRequest) {
          const row = document.createElement('div')
          row.className = 'row'
          row.appendChild(btn(t('ext.helpRequestBtn'), onRequest))
          c.appendChild(row)
        }
      })
    },
    markRequested() {
      if (!card || !cardAnchor) return
      card.innerHTML = ''
      card.appendChild(brandLine())
      const line = document.createElement('div')
      line.className = 'body'
      line.textContent = t('ext.helpRequested')
      card.appendChild(line)
    },
    showLimit(el) {
      cardNear(el, (c) => {
        c.appendChild(brandLine())
        const line = document.createElement('div')
        line.className = 'body'
        line.textContent = t('ext.helpLimit')
        c.appendChild(line)
      })
    },
    dispose() {
      window.removeEventListener('scroll', follow, { passive: true, capture: true } as EventListenerOptions)
      window.removeEventListener('resize', follow)
      host?.remove()
      host = null
      root = null
      frameEl = hlEl = card = null
      dotEls = []
      notedEls = []
      cardAnchor = null
      onReposition = null
    },
  }
}
