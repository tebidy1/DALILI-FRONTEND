import { cssAnchorFinder, findByAnchor, resolveAnchor, safeAnchor, screenKey, type AnchorDom } from '@dalili/core'
import type { NoteDto, NoteStepDto, MyNoteDto } from '@dalili/shared'
import type { HelpOutMsg, HelpPick, ToTabMsg } from './protocol'
import { createHelpGuard } from './help-guard'
import { createHelpLayer } from './help-layer'
import { pickInteractive } from './pick'
import { anchorOf, anchorTextOf, ctxOf, labelOf } from './anchor-of'

/** هـ ج١ (HLP) وضع «ما هذا؟» داخل الصفحة: حاجز يمنع التنفيذ، وإطار يتبع الماوس،
 *  وضغطة تُطابَق كلها على الجهاز — شرح الشريك ثم خطوة دليل ثم «لا شرح بعد» وطلب.
 *  مفتاح الشاشة يُقرأ وقت كل ضغطة (أودو صفحة واحدة)، والالتقاط بلا ctx ولا استعلام.
 *  الخصوصية (HLP-05): لا شيء يُرسل للخادم عند الضغط — المطابقة محلية. */

/** المنفذ نفسه الذي يستعمله «دربني» — فلا انزياح بين الالتقاط والحل */
const realDom: AnchorDom<Element> = {
  ...cssAnchorFinder(
    (sel) => Array.from(document.querySelectorAll(sel)),
    (el) => anchorTextOf(el),
  ),
  labelOf,
  ctxOf,
}

const contains = (outer: Element, inner: Element) => outer.contains(inner)
/** المختار ليس عنصر تحكّم (فراغ نافذة أو شريط): لا يُطابَق بما يحويه — وإلا ظهر شرح أول زر بداخله */
const hitInside = (picked: Element) => (outer: Element, inner: Element) => outer !== picked && outer.contains(inner)

/** أدوار تُسأل عنها — menuitem* يشمل menuitemradio وmenuitemcheckbox */
const REQUESTABLE_ROLE = /^(button|tab|menuitem|switch|checkbox|radio|combobox)/

/** «اطلب شرحاً» لعناصر التحكّم فقط، لا للروابط (نصها اسم عميل) ولا لخلايا الجداول */
function offerRequest(el: Element, canRequest: boolean): boolean {
  if (!canRequest) return false
  if (el.closest('a, td, [role="row"]')) return false
  const tag = el.tagName.toLowerCase()
  if (tag === 'button' || tag === 'input' || tag === 'select' || tag === 'textarea') return true
  return REQUESTABLE_ROLE.test(el.getAttribute('role') ?? '')
}

/** عنصر داخل إطار أصل آخر لا نرى داخله — حدّ صادق لا تخمين */
function foreignFrame(el: Element): HTMLIFrameElement | null {
  const iframe = el instanceof HTMLIFrameElement ? el : (el.closest('iframe') as HTMLIFrameElement | null)
  if (!iframe) return null
  try {
    return iframe.contentDocument === null ? iframe : null
  } catch {
    return iframe
  }
}

export function createHelpMode(
  send: (m: HelpOutMsg) => void,
  dom: AnchorDom<Element> = realDom,
  here: () => string = () => location.href,
): { handle(msg: ToTabMsg): void; dispose(): void } {
  let mode: 'ask' | 'author' | null = null
  let notes: NoteDto[] = []
  /** مراسي خطوات الأدلة بمفاتيح شاشاتها — تُحسب مرة عند التشغيل فالضغطة لا تنتظر شبكة */
  let stepAnchors: Array<NoteStepDto & { screenKey: string }> = []
  let canRequest = false
  let guard: { dispose(): void } | null = null
  const layer = createHelpLayer()

  /** مراسي الخطوات بمفاتيح شاشاتها — قرار الخطة: تُجلب مع الشروح عند التشغيل */
  function rekeySteps(steps: NoteStepDto[]) {
    stepAnchors = steps.map((s) => ({ ...s, screenKey: screenKey(s.url) }))
  }

  /** نقاط الشريك: شروح هذه الشاشة تُحلّ إلى عناصرها */
  function refreshDots() {
    if (mode !== 'author') return
    const hereKey = screenKey(here())
    const els: Element[] = []
    for (const n of notes) {
      if (n.screenKey !== hereKey) continue
      const hit = resolveAnchor(n.anchor, dom)
      if (hit?.el.isConnected) els.push(hit.el)
    }
    layer.dots(els)
  }

  function onHover(el: Element) {
    layer.frame(pickInteractive(el) ?? el)
  }

  function buildPick(el: Element): HelpPick | null {
    const chain = anchorOf(el)
    if (!chain) return null
    // الاسم: نص الزر، أو aria-label، أو تسمية الحقل — مقصوصًا إلى ٨٠
    const raw = anchorTextOf(el) || el.getAttribute('aria-label') || labelOf(el) || el.tagName.toLowerCase()
    return {
      anchor: safeAnchor(chain),
      screenKey: screenKey(here()), // وقت الضغطة — أودو صفحة واحدة تتنقل والوضع قائم
      label: raw.replace(/\s+/g, ' ').trim().slice(0, 80),
      site: location.host,
    }
  }

  function onPick(el: Element) {
    const frame = foreignFrame(el)
    if (frame) {
      layer.showLimit(frame)
      return
    }
    const control = pickInteractive(el)
    const target = control ?? el
    const pick = buildPick(target)
    if (!pick) return
    const within = control ? contains : hitInside(target)

    if (mode === 'author') {
      layer.highlight(target)
      const hit = findByAnchor(notes, pick.screenKey, target, dom, within)
      send({ t: 'help-pick', pick, ...(hit ? { noteId: hit.id } : {}) })
      return
    }
    if (mode !== 'ask') return

    const note = findByAnchor(notes, pick.screenKey, target, dom, within)
    if (note) {
      layer.showNote(
        note,
        target,
        note.guide ? () => send({ t: 'help-open', guideId: note.guide!.id!, train: false }) : undefined,
        note.guide ? () => send({ t: 'help-open', guideId: note.guide!.id!, train: true }) : undefined,
      )
      return
    }
    const st = findByAnchor(stepAnchors, pick.screenKey, target, dom, within)
    if (st) {
      layer.showStep(
        st,
        target,
        () => send({ t: 'help-open', guideId: st.guideId, train: false }),
        () => send({ t: 'help-open', guideId: st.guideId, train: true }),
      )
      return
    }
    layer.showNone(target, offerRequest(target, canRequest), () => send({ t: 'help-request', pick }))
  }

  function teardown(announce: boolean) {
    guard?.dispose()
    guard = null
    layer.dispose()
    mode = null
    notes = []
    stepAnchors = []
    canRequest = false
    if (announce) send({ t: 'help-exit' })
  }

  function turnOn(msg: Extract<ToTabMsg, { t: 'help-on' }>) {
    teardown(false)
    mode = msg.mode
    canRequest = msg.mode === 'ask' ? msg.canRequest : false
    notes = msg.notes
    if (msg.mode === 'ask') rekeySteps(msg.steps)
    layer.mount()
    layer.dots([])
    refreshDots()
    guard = createHelpGuard(window, { onHover, onPick, onExit: () => teardown(true) })
  }

  return {
    handle(msg) {
      if (msg.t === 'help-on') {
        turnOn(msg)
        return
      }
      if (!mode) return
      if (msg.t === 'help-notes') {
        notes = msg.notes
        refreshDots()
        return
      }
      if (msg.t === 'help-requested') {
        layer.markRequested()
        return
      }
      if (msg.t === 'help-off') teardown(false)
    },
    dispose() {
      teardown(false)
    },
  }
}
