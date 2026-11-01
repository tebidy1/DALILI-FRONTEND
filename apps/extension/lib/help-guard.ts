/** هـ ج١ (HLP-02) حاجز النقر لوضع «ما هذا؟» — كود جديد لا إعادة استعمال:
 *  الالتقاط الحالي يستمع ولا يحجب، وأودو (OWL) ينفّذ أفعالًا على mousedown وEnter،
 *  فيُحجب كل شيء في مرحلة الالتقاط على window ما دام الوضع قائمًا.
 *  الاستثناء الوحيد: أحداث طبقتنا dalili-* (بطاقة الموظف) تمرّ كاملة. */
import { insideOurLayer } from './pick'

export interface HelpGuardHandlers {
  onHover(el: Element): void
  onPick(el: Element): void
  onExit(): void
}

/** أحداث لا يجوز أن تراها الصفحة أبدًا أثناء الوضع — أودو يستمع لأكثر من click */
const BLOCKED_TYPES = [
  'pointerdown',
  'pointerup',
  'mousedown',
  'mouseup',
  'click',
  'dblclick',
  'auxclick',
  'submit',
  'keydown',
  'keyup',
  'keypress',
] as const

/** هل أصل الحدث داخل طبقتنا؟ المسار المكوَّن يضم مضيف Shadow DOM، وinsideOurLayer يغطي الضوء */
function fromOurLayer(e: Event): boolean {
  const path = e.composedPath()
  const first = path[0]
  if (first instanceof Element && insideOurLayer(first)) return true
  return path.some((n) => n instanceof Element && n.tagName.toUpperCase().startsWith('DALILI-'))
}

/** أصل الحدث كعنصر — المرساة تُبنى عليه لا على الهدف المكوَّن عند المضيف */
function originOf(e: Event): Element | null {
  const n: Node | null = (e.composedPath()[0] ?? e.target) as Node | null
  return n instanceof Element ? n : null
}

export function createHelpGuard(win: Window, h: HelpGuardHandlers): { dispose(): void } {
  const blocked = (e: Event) => {
    if (fromOurLayer(e)) return
    e.preventDefault()
    e.stopImmediatePropagation()
    if (e.type === 'click') {
      const el = originOf(e)
      if (el) h.onPick(el)
    }
    if (e.type === 'keydown' && (e as KeyboardEvent).key === 'Escape') h.onExit()
  }
  const hover = (e: Event) => {
    const el = originOf(e)
    if (el && !fromOurLayer(e)) h.onHover(el)
  }

  // passive:false كي يعمل preventDefault حتى لو وسّع المتصفح القائمة السلبية افتراضيًا
  win.addEventListener('pointermove', hover, true)
  for (const t of BLOCKED_TYPES) win.addEventListener(t, blocked, { capture: true, passive: false })

  return {
    dispose() {
      win.removeEventListener('pointermove', hover, true)
      for (const t of BLOCKED_TYPES) win.removeEventListener(t, blocked, { capture: true })
    },
  }
}
